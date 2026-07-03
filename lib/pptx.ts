import path from "path";
import { promises as fs } from "fs";
import pptxgen from "pptxgenjs";
import type { Deck, Slide } from "@/lib/anthropic";
import type { DesignSpec } from "@/lib/design";
import type { ResolvedVisual } from "@/lib/visuals";

interface Theme {
  bg: string;
  titleBg: string;
  primary: string;
  accent: string;
  heading: string;
  text: string;
  titleText: string;
  subText: string;
  font: string;
}

// Цвета в формате pptxgenjs — hex без "#".
const THEMES: Record<string, Theme> = {
  business: {
    bg: "FFFFFF",
    titleBg: "1F3864",
    primary: "1F3864",
    accent: "2E75B6",
    heading: "1F3864",
    text: "333333",
    titleText: "FFFFFF",
    subText: "D6E4F0",
    font: "Calibri",
  },
  creative: {
    bg: "FFF7ED",
    titleBg: "7C2D12",
    primary: "EA580C",
    accent: "F97316",
    heading: "7C2D12",
    text: "44403C",
    titleText: "FFF7ED",
    subText: "FED7AA",
    font: "Georgia",
  },
  minimal: {
    bg: "FFFFFF",
    titleBg: "FFFFFF",
    primary: "111111",
    accent: "111111",
    heading: "111111",
    text: "444444",
    titleText: "111111",
    subText: "777777",
    font: "Arial",
  },
};

type ResolvedFont = { face: string; size: number; bold: boolean; italic: boolean };

// Разрешённая тема рендера: базовый Theme + шрифты/размеры из prefs + флаг academic.
interface Style extends Theme {
  headingFont: ResolvedFont;
  bodyFont: ResolvedFont;
  academic: boolean;
}

// Whitelist шрифтов (кириллица-совместимые, есть в Office/Windows). default Arial.
const FONT_WHITELIST = new Set([
  "Times New Roman",
  "Arial",
  "Tahoma",
  "Verdana",
  "Calibri",
]);

function sanitizeFace(face: string | undefined, fallback: string): string {
  return face && FONT_WHITELIST.has(face) ? face : fallback;
}

// Academic default-пресет: белый фон, тёмные чернила, единственный accent
// только на номера/штрихи/подчёркивания (см. docs/ex1.png, ex2.png).
const ACADEMIC: Theme = {
  bg: "FFFFFF",
  titleBg: "FFFFFF",
  primary: "1F3A5F",
  accent: "1F3A5F",
  heading: "1A1A1A",
  text: "1A1A1A",
  titleText: "1A1A1A",
  subText: "555555",
  font: "Arial",
};

// DesignSpec переопределяет базовый Theme пресета стилей (палитра/шрифты/размеры).
export function themeFromPrefs(base: Theme, prefs?: DesignSpec): Style {
  const academic = prefs?.preset === "academic";
  const start: Theme = academic ? { ...ACADEMIC } : { ...base };

  const pal = prefs?.palette;
  if (pal?.bg) {
    start.bg = pal.bg;
    start.titleBg = pal.bg;
  }
  if (pal?.text) {
    start.text = pal.text;
    start.heading = pal.text;
    start.titleText = pal.text;
  }
  if (pal?.accent) {
    start.accent = pal.accent;
    start.primary = pal.accent;
  }

  const headingFace = sanitizeFace(prefs?.fonts?.heading?.face, start.font);
  const bodyFace = sanitizeFace(prefs?.fonts?.body?.face, headingFace);
  const headingFont: ResolvedFont = {
    face: headingFace,
    size: prefs?.fonts?.heading?.size ?? (academic ? 32 : 28),
    bold: prefs?.fonts?.heading?.bold ?? true,
    italic: prefs?.fonts?.heading?.italic ?? false,
  };
  const bodyFont: ResolvedFont = {
    face: bodyFace,
    size: prefs?.fonts?.body?.size ?? (academic ? 24 : 18),
    bold: false,
    italic: false,
  };
  start.font = headingFace; // back-compat для мест, всё ещё читающих t.font

  return { ...start, headingFont, bodyFont, academic };
}

// Размеры для LAYOUT_WIDE: 13.33 x 7.5 дюйма.
const W = 13.33;
const H = 7.5;
const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");

type SlideImage = {
  path: string;
  description: string | null;
};

type Box = { x: number; y: number; w: number; h: number };

function resolveSlideImagePath(filePath: string): string | null {
  const resolved = path.resolve(process.cwd(), filePath);
  if (!resolved.startsWith(UPLOADS_ROOT + path.sep)) {
    return null;
  }
  return resolved;
}

// Натуральные размеры PNG (IHDR) и JPEG (SOF-маркеры) из байтов заголовка.
// Достаточно первых килобайт — читаем только сигнатуру. null = формат неизвестен.
function parseImageSize(buf: Buffer): { w: number; h: number } | null {
  // PNG: 8-байтная сигнатура, затем IHDR — width@16, height@20 (big-endian).
  if (
    buf.length >= 24 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    if (w > 0 && h > 0) return { w, h };
    return null;
  }
  // JPEG: FFD8, дальше сегменты; SOF0..SOF3/5..7/9..11/13..15 несут размеры.
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) {
        off++;
        continue;
      }
      const marker = buf[off + 1];
      // маркеры без длины: RSTn (D0..D7), SOI, EOI
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        off += 2;
        continue;
      }
      const len = buf.readUInt16BE(off + 2);
      const isSOF =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isSOF) {
        const h = buf.readUInt16BE(off + 5);
        const w = buf.readUInt16BE(off + 7);
        if (w > 0 && h > 0) return { w, h };
        return null;
      }
      off += 2 + len;
    }
  }
  return null;
}

function sizeFromDataUrl(data: string): { w: number; h: number } | null {
  const comma = data.indexOf(",");
  if (comma < 0) return null;
  try {
    const buf = Buffer.from(data.slice(comma + 1), "base64");
    return parseImageSize(buf);
  } catch {
    return null;
  }
}

async function sizeFromFile(filePath: string): Promise<{ w: number; h: number } | null> {
  try {
    const fd = await fs.open(filePath, "r");
    try {
      const buf = Buffer.alloc(64 * 1024);
      const { bytesRead } = await fd.read(buf, 0, buf.length, 0);
      return parseImageSize(buf.subarray(0, bytesRead));
    } finally {
      await fd.close();
    }
  } catch {
    return null;
  }
}

// Вписать натуральный размер в регион с сохранением аспекта, центрировать.
// natural неизвестен → регион как есть (старое поведение, картинка тянется).
function fitContain(
  region: Box,
  natural: { w: number; h: number } | null
): Box {
  if (!natural || natural.w <= 0 || natural.h <= 0) return region;
  const regionAspect = region.w / region.h;
  const imgAspect = natural.w / natural.h;
  let w: number;
  let h: number;
  if (imgAspect > regionAspect) {
    w = region.w;
    h = region.w / imgAspect;
  } else {
    h = region.h;
    w = region.h * imgAspect;
  }
  return {
    x: region.x + (region.w - w) / 2,
    y: region.y + (region.h - h) / 2,
    w,
    h,
  };
}

function renderTitle(slide: pptxgen.Slide, s: Slide, t: Style) {
  slide.background = { color: t.titleBg };
  slide.addText(s.heading, {
    x: 0.9,
    y: 2.5,
    w: W - 1.8,
    h: 1.8,
    fontSize: 40,
    bold: true,
    color: t.titleText,
    fontFace: t.headingFont.face,
    align: "left",
    valign: "middle",
  });
  // акцентная линия
  slide.addShape("rect", { x: 0.95, y: 4.35, w: 2.2, h: 0.08, fill: { color: t.accent } });
  if (s.subheading) {
    slide.addText(s.subheading, {
      x: 0.9,
      y: 4.6,
      w: W - 1.8,
      h: 1.2,
      fontSize: 20,
      color: t.subText,
      fontFace: t.bodyFont.face,
      align: "left",
    });
  }
}

function renderSection(slide: pptxgen.Slide, s: Slide, t: Style, index: number) {
  // Светлый фон вместо full-bleed accent. Крупный accent-номер + вертикальный бар.
  slide.background = { color: t.bg };
  const num = String(index + 1).padStart(2, "0");
  // толстый вертикальный accent-бар слева — крупный элемент без заливки всего слайда
  slide.addShape("rect", { x: 0.9, y: 2.6, w: 0.14, h: 2.3, fill: { color: t.accent } });
  // крупный полупрозрачный номер секции
  slide.addText(num, {
    x: 0.9,
    y: 1.3,
    w: 4.0,
    h: 1.4,
    fontSize: 96,
    bold: true,
    color: t.accent,
    transparency: 82,
    fontFace: t.headingFont.face,
    align: "left",
    valign: "middle",
  });
  slide.addText(s.heading, {
    x: 1.3,
    y: 2.6,
    w: W - 2.4,
    h: 2.3,
    fontSize: 40,
    bold: true,
    color: t.heading,
    fontFace: t.headingFont.face,
    align: "left",
    valign: "middle",
  });
  if (s.subheading) {
    slide.addText(s.subheading, {
      x: 1.3,
      y: 5.0,
      w: W - 2.4,
      h: 1.0,
      fontSize: 18,
      color: t.text,
      fontFace: t.bodyFont.face,
      align: "left",
    });
  }
}

// Один декор на ВСЮ колоду (по стилю), без ротации: рандомные полосы то сверху,
// то слева читаются как хаос, а не как дизайн (фидбек владельца 03.07).
function contentDecor(styleKey: string): {
  headingX: number;
  headingY: number;
  bulletY: number;
  decor: (slide: pptxgen.Slide, t: Style) => void;
} {
  switch (styleKey) {
    case "creative":
      // тонкая вертикальная полоса слева
      return {
        headingX: 0.9,
        headingY: 0.6,
        bulletY: 1.9,
        decor: (slide, t) =>
          slide.addShape("rect", { x: 0, y: 0, w: 0.18, h: H, fill: { color: t.primary } }),
      };
    case "minimal":
      // только короткое accent-подчёркивание под заголовком
      return {
        headingX: 0.7,
        headingY: 0.55,
        bulletY: 2.0,
        decor: (slide, t) =>
          slide.addShape("rect", {
            x: 0.75,
            y: 1.55,
            w: 2.2,
            h: 0.06,
            fill: { color: t.accent },
          }),
      };
    default:
      // business: тонкая верхняя полоса
      return {
        headingX: 0.7,
        headingY: 0.6,
        bulletY: 1.9,
        decor: (slide, t) =>
          slide.addShape("rect", { x: 0, y: 0, w: W, h: 0.14, fill: { color: t.primary } }),
      };
  }
}

// Детерминированный подбор кегля буллетов под высоту региона. pptxgenjs
// fit:"shrink" пишет normAutofit, который PowerPoint пересчитывает только при
// редактировании textbox — на просмотре текст просто вылезает за слайд.
// Считаем сами: ширина символа ≈ 0.52*pt, высота строки ≈ 1.3*pt.
export function fitBodyFontSize(
  bullets: string[],
  widthIn: number,
  heightIn: number,
  baseSize: number
): number {
  const PARA_GAP_IN = 10 / 72; // paraSpaceAfter 10pt
  for (let size = baseSize; size >= 12; size -= 1) {
    const charsPerLine = Math.max(8, Math.floor(widthIn / ((0.52 * size) / 72)));
    const lineH = (1.3 * size) / 72;
    let total = 0;
    for (const b of bullets) {
      total += Math.max(1, Math.ceil(b.length / charsPerLine)) * lineH + PARA_GAP_IN;
    }
    if (total <= heightIn) return size;
  }
  return 12;
}

type ContentOpts = {
  hasImage: boolean;
  bottomVisual: boolean; // широкий визуал уходит вниз на всю ширину
  styleKey: string;
};

function renderContent(slide: pptxgen.Slide, s: Slide, t: Style, opts: ContentOpts) {
  slide.background = { color: t.bg };
  const layout = contentDecor(opts.styleKey);
  layout.decor(slide, t);

  slide.addText(s.heading, {
    x: layout.headingX,
    y: layout.headingY,
    w: W - layout.headingX - 0.7,
    h: 1.0,
    fontSize: t.headingFont.size,
    bold: t.headingFont.bold,
    italic: t.headingFont.italic,
    color: t.heading,
    fontFace: t.headingFont.face,
    align: "left",
    fit: "shrink",
  });

  const bullets = s.bullets.filter((b) => b.trim().length > 0);
  if (bullets.length > 0) {
    const bulletW = opts.bottomVisual ? W - 1.8 : opts.hasImage ? 5.8 : W - 1.8;
    const bulletH = opts.bottomVisual ? 2.5 : opts.hasImage ? 4.9 : H - 2.6;
    const fontSize = fitBodyFontSize(bullets, bulletW - 0.3, bulletH, t.bodyFont.size);
    slide.addText(
      bullets.map((b) => ({
        text: b,
        options: {
          bullet: { code: "2022", indent: 18 },
          fontSize,
          color: t.text,
          fontFace: t.bodyFont.face,
          breakLine: true,
          paraSpaceAfter: 10,
        },
      })),
      { x: 0.9, y: layout.bulletY, w: bulletW, h: bulletH, valign: "top", fit: "shrink" }
    );
  }

  slide.addText("slidemaker.ru", {
    x: W - 3.0,
    y: H - 0.5,
    w: 2.7,
    h: 0.3,
    fontSize: 9,
    color: t.subText,
    fontFace: t.bodyFont.face,
    align: "right",
  });
}

// ── Academic-лейауты (docs/ex1.png, ex2.png) ─────────────────────────────────
// Общий заголовок: ALL-CAPS по центру + короткое accent-подчёркивание.
function academicHeading(slide: pptxgen.Slide, s: Slide, t: Style) {
  slide.addText(s.heading.toUpperCase(), {
    x: 0.7,
    y: 0.45,
    w: W - 1.4,
    h: 0.8,
    fontSize: t.headingFont.size,
    bold: true,
    color: t.heading,
    fontFace: t.headingFont.face,
    align: "center",
    valign: "middle",
    charSpacing: 1,
  });
  // accent-подчёркивание по центру
  slide.addShape("rect", { x: W / 2 - 1.4, y: 1.3, w: 2.8, h: 0.035, fill: { color: t.accent } });
}

// Тонкая рамка-бокс (1pt), прозрачная заливка.
function academicBox(slide: pptxgen.Slide, region: Box, color: string) {
  slide.addShape("rect", {
    ...region,
    fill: { type: "none" },
    line: { color, width: 1 },
  });
}

function renderAcademicTitle(slide: pptxgen.Slide, s: Slide, t: Style) {
  slide.background = { color: t.bg };
  slide.addText(s.heading.toUpperCase(), {
    x: 0.9,
    y: 2.4,
    w: W - 1.8,
    h: 1.6,
    fontSize: t.headingFont.size + 8,
    bold: true,
    color: t.heading,
    fontFace: t.headingFont.face,
    align: "center",
    valign: "middle",
    charSpacing: 1,
  });
  slide.addShape("rect", { x: W / 2 - 1.6, y: 4.15, w: 3.2, h: 0.04, fill: { color: t.accent } });
  if (s.subheading) {
    slide.addText(s.subheading, {
      x: 1.2,
      y: 4.5,
      w: W - 2.4,
      h: 1.2,
      fontSize: t.bodyFont.size,
      color: t.text,
      fontFace: t.bodyFont.face,
      align: "center",
    });
  }
}

function renderAcademicSection(slide: pptxgen.Slide, s: Slide, t: Style) {
  // Секция академ = центрированный ALL-CAPS заголовок в тонкой рамке, без заливки.
  slide.background = { color: t.bg };
  const region: Box = { x: 1.0, y: 2.6, w: W - 2.0, h: 2.3 };
  academicBox(slide, region, t.text);
  slide.addText(s.heading.toUpperCase(), {
    ...region,
    fontSize: t.headingFont.size + 4,
    bold: true,
    color: t.heading,
    fontFace: t.headingFont.face,
    align: "center",
    valign: "middle",
    charSpacing: 1,
  });
  slide.addShape("rect", { x: W / 2 - 1.4, y: region.y + region.h + 0.25, w: 2.8, h: 0.04, fill: { color: t.accent } });
}

function renderAcademicContent(
  slide: pptxgen.Slide,
  s: Slide,
  t: Style,
  hasImage: boolean,
  variant: number
) {
  slide.background = { color: t.bg };
  academicHeading(slide, s, t);

  const bullets = s.bullets.filter((b) => b.trim().length > 0);
  const region: Box = {
    x: 0.7,
    y: 1.75,
    w: hasImage ? 5.9 : W - 1.4,
    h: H - 1.75 - 0.45,
  };

  // hasImage не оставляет места двум колонкам → нумерованные блоки в левой части.
  const mode = hasImage ? 0 : variant % 3;
  if (bullets.length > 0) {
    if (mode === 1) {
      academicTwoColumns(slide, t, bullets, region);
    } else if (mode === 2) {
      academicFramed(slide, t, bullets, region);
    } else {
      academicNumbered(slide, t, bullets, region);
    }
  }

  slide.addText("slidemaker.ru", {
    x: W - 3.0,
    y: H - 0.42,
    w: 2.7,
    h: 0.3,
    fontSize: 9,
    color: t.subText,
    fontFace: t.bodyFont.face,
    align: "right",
  });
}

// Вариант 0 (ex1): нумерованные блоки с вертикальным accent-штрихом.
function academicNumbered(slide: pptxgen.Slide, t: Style, bullets: string[], region: Box) {
  const gap = 0.18;
  const n = bullets.length;
  const blockH = (region.h - gap * (n - 1)) / n;
  bullets.forEach((b, i) => {
    const y = region.y + i * (blockH + gap);
    slide.addShape("rect", {
      x: region.x,
      y: y + 0.05,
      w: 0.06,
      h: Math.max(blockH - 0.1, 0.1),
      fill: { color: t.accent },
    });
    slide.addText(String(i + 1), {
      x: region.x + 0.16,
      y,
      w: 0.55,
      h: blockH,
      fontSize: t.bodyFont.size + 2,
      bold: true,
      color: t.accent,
      fontFace: t.headingFont.face,
      align: "left",
      valign: "middle",
    });
    slide.addText(b, {
      x: region.x + 0.8,
      y,
      w: region.w - 0.9,
      h: blockH,
      fontSize: fitBodyFontSize([b], region.w - 1.2, blockH, t.bodyFont.size),
      color: t.text,
      fontFace: t.bodyFont.face,
      align: "left",
      valign: "middle",
      fit: "shrink",
    });
  });
}

// Вариант 1 (ex2): двухколоночная сетка тонких боксов.
function academicTwoColumns(slide: pptxgen.Slide, t: Style, bullets: string[], region: Box) {
  const colGap = 0.4;
  const colW = (region.w - colGap) / 2;
  const half = Math.ceil(bullets.length / 2);
  const cols = [bullets.slice(0, half), bullets.slice(half)];
  const rows = Math.max(cols[0].length, cols[1].length, 1);
  const rowGap = 0.2;
  const boxH = (region.h - rowGap * (rows - 1)) / rows;
  cols.forEach((col, ci) => {
    const x = region.x + ci * (colW + colGap);
    col.forEach((b, ri) => {
      const y = region.y + ri * (boxH + rowGap);
      academicBox(slide, { x, y, w: colW, h: boxH }, t.text);
      slide.addText(b, {
        x: x + 0.18,
        y: y + 0.1,
        w: colW - 0.36,
        h: boxH - 0.2,
        fontSize: fitBodyFontSize([b], colW - 0.5, boxH - 0.2, t.bodyFont.size),
        color: t.text,
        fontFace: t.bodyFont.face,
        align: "left",
        valign: "middle",
        fit: "shrink",
      });
    });
  });
}

// Вариант 2: единый тонкий бокс-рамка вокруг маркированного списка.
function academicFramed(slide: pptxgen.Slide, t: Style, bullets: string[], region: Box) {
  academicBox(slide, region, t.text);
  const fontSize = fitBodyFontSize(bullets, region.w - 1.0, region.h - 0.6, t.bodyFont.size);
  slide.addText(
    bullets.map((b) => ({
      text: b,
      options: {
        bullet: { code: "2022", indent: 18 },
        fontSize,
        color: t.text,
        fontFace: t.bodyFont.face,
        breakLine: true,
        paraSpaceAfter: 10,
      },
    })),
    {
      x: region.x + 0.35,
      y: region.y + 0.3,
      w: region.w - 0.7,
      h: region.h - 0.6,
      valign: "top",
      fit: "shrink",
    }
  );
}

// Широкий визуал (LR-диаграммы) в боковом регионе съёживается в марку —
// уводим его вниз на всю ширину слайда.
const WIDE_ASPECT = 2.0;

function visualRegion(hasBullets: boolean, bottom: boolean): Box {
  if (bottom) return { x: 0.7, y: 4.65, w: W - 1.4, h: 2.25 };
  return {
    x: hasBullets ? 7.2 : 2.0,
    y: 1.85,
    w: hasBullets ? 5.2 : 9.3,
    h: hasBullets ? 3.45 : 4.45,
  };
}

// Подпись вплотную ПОД вписанной картинкой (не у дна пустого региона — иначе
// висит в вакууме). Нейтральный серый: subText темы бывает нечитаем на светлом.
function addCaption(slide: pptxgen.Slide, t: Style, text: string, region: Box, fitted?: Box) {
  if (!text) return;
  const anchor = fitted ?? region;
  const y = Math.min(anchor.y + anchor.h + 0.06, H - 0.5);
  slide.addText(text, {
    x: region.x,
    y,
    w: region.w,
    h: 0.4,
    fontSize: 11,
    color: "8A8A8A",
    fontFace: t.bodyFont.face,
    align: "center",
    fit: "shrink",
  });
}

function renderAiVisual(
  pptx: pptxgen,
  slide: pptxgen.Slide,
  t: Style,
  visual: ResolvedVisual,
  hasBullets: boolean,
  bottom: boolean
) {
  const region = visualRegion(hasBullets, bottom);
  if (visual.kind === "image") {
    const fitted = fitContain(region, sizeFromDataUrl(visual.data));
    slide.addImage({ data: visual.data, ...fitted, altText: visual.alt });
    addCaption(slide, t, visual.caption, region, fitted);
    return;
  }
  // chart — нативный график pptxgenjs, заполняет регион целиком
  const { chart } = visual;
  const type =
    chart.kind === "line"
      ? pptx.ChartType.line
      : chart.kind === "pie"
        ? pptx.ChartType.pie
        : pptx.ChartType.bar;
  slide.addChart(
    type,
    [
      {
        name: chart.unit || "Значение",
        labels: chart.data.map((d) => d.label),
        values: chart.data.map((d) => d.value),
      },
    ],
    {
      ...region,
      chartColors: [t.accent, t.primary, t.heading, t.subText],
      showLegend: chart.kind === "pie",
      legendPos: "b",
      showValue: chart.kind !== "pie",
      showPercent: chart.kind === "pie",
      catAxisLabelColor: t.text,
      valAxisLabelColor: t.text,
    }
  );
  addCaption(slide, t, visual.caption, region);
}

export async function buildPptx(
  deck: Deck,
  style: string,
  outPath: string,
  slideImages?: Map<number, SlideImage>,
  aiVisuals?: Map<number, ResolvedVisual>,
  prefs?: DesignSpec,
  titleImage?: SlideImage
): Promise<void> {
  const spec = themeFromPrefs(THEMES[style] ?? THEMES.business, prefs);
  const titleMode = prefs?.title?.mode ?? "auto";

  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "SlideMaker";
  pptx.title = deck.title;

  // Титул: mode="upload" → загруженный PNG/JPG первым слайдом (вписан, без обрезки).
  if (titleMode === "upload" && titleImage) {
    const resolved = resolveSlideImagePath(titleImage.path);
    if (resolved) {
      const slide = pptx.addSlide();
      slide.background = { color: spec.bg };
      const fitted = fitContain({ x: 0, y: 0, w: W, h: H }, await sizeFromFile(resolved));
      slide.addImage({
        path: resolved,
        ...fitted,
        altText: titleImage.description ?? "",
      });
    }
  }

  for (let index = 0; index < deck.slides.length; index++) {
    const s = deck.slides[index];
    // mode="self"/"upload" → сгенерированный титульный слайд не рендерим.
    if (s.layout === "title" && titleMode !== "auto") continue;

    const slide = pptx.addSlide();
    const image = s.layout === "content" ? slideImages?.get(index + 1) : undefined;
    const resolvedPath = image ? resolveSlideImagePath(image.path) : null;
    // AI-визуал только если на этот слайд нет загрузки пользователя
    const aiVisual =
      s.layout === "content" && !resolvedPath ? aiVisuals?.get(index + 1) : undefined;
    const bullets = s.bullets.filter((b) => b.trim().length > 0);
    const hasBullets = bullets.length > 0;
    const hasImage = Boolean(resolvedPath) || Boolean(aiVisual);

    // Широкий растровый визуал (LR-диаграмма) при наличии буллетов — вниз на
    // всю ширину, иначе в боковом регионе он превращается в марку.
    let natural: { w: number; h: number } | null = null;
    if (resolvedPath) natural = await sizeFromFile(resolvedPath);
    else if (aiVisual?.kind === "image") natural = sizeFromDataUrl(aiVisual.data);
    const bottomVisual =
      hasBullets && natural !== null && natural.w / natural.h > WIDE_ASPECT;

    switch (s.layout) {
      case "title":
        if (spec.academic) renderAcademicTitle(slide, s, spec);
        else renderTitle(slide, s, spec);
        break;
      case "section":
        if (spec.academic) renderAcademicSection(slide, s, spec);
        else renderSection(slide, s, spec, index);
        break;
      default: // content | conclusion
        if (spec.academic) renderAcademicContent(slide, s, spec, hasImage, index);
        else renderContent(slide, s, spec, { hasImage, bottomVisual, styleKey: style });
        if (resolvedPath && image) {
          const region = visualRegion(hasBullets, bottomVisual);
          const fitted = fitContain(region, natural);
          slide.addImage({
            path: resolvedPath,
            ...fitted,
            altText: image.description ?? "",
          });
          addCaption(slide, spec, image.description ?? "", region, fitted);
        } else if (aiVisual) {
          renderAiVisual(pptx, slide, spec, aiVisual, hasBullets, bottomVisual);
        }
        break;
    }
  }

  await pptx.writeFile({ fileName: outPath });
}
