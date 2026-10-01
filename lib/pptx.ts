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

// Заголовок так же нельзя доверять fit:"shrink" — длинный заголовок в 2 строки
// вылезает из своего бокса и наезжает на accent-подчёркивание. Считаем кегль сам.
// Заголовки жирные/ALL-CAPS/charSpacing → символ шире тела: charW ≈ 0.62*pt.
export function fitHeadingFontSize(
  text: string,
  widthIn: number,
  heightIn: number,
  baseSize: number,
  minSize = 18
): number {
  for (let size = baseSize; size >= minSize; size -= 1) {
    const charsPerLine = Math.max(6, Math.floor(widthIn / ((0.62 * size) / 72)));
    const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
    if (lines * ((1.15 * size) / 72) <= heightIn) return size;
  }
  return minSize;
}

type ContentOpts = {
  hasImage: boolean;
  bottomVisual: boolean; // широкий визуал уходит вниз на всю ширину
};

// Composition follows the material, never the slide's position in the deck.
export function selectComposition(s: Pick<Slide, "bullets"> & { composition?: string }): string {
  const points = s.bullets.filter(Boolean);
  const dates = points.map(p => p.match(/^\s*((?:1\d|20)\d{2})\s+\S/));
  if ((!s.composition || s.composition === "auto" || s.composition === "timeline") && points.length >= 2 && points.length <= 4 && dates.every(Boolean)) return "timeline";
  if (s.composition === "timeline") return "list"; // no invented milestones
  if (s.composition === "metrics" && points.length >= 1 && points.length <= 4 && points.every(p => /^\s*[€$£]?\d[\d,.+%–−-]*\s+\S/.test(p))) return "metrics";
  if (s.composition === "comparison" && points.length >= 2 && points.length <= 4) return "comparison";
  if (s.composition === "statement" || points.length === 1) return "statement";
  return "list";
}

function contentHeading(slide: pptxgen.Slide, s: Slide, t: Style) {
  slide.addText(s.heading, {
    x: 0.75, y: 0.6, w: W - 1.5, h: 1.0, margin: 0,
    fontSize: fitHeadingFontSize(s.heading, W - 1.5, 1.0, t.headingFont.size),
    bold: t.headingFont.bold, italic: t.headingFont.italic,
    color: t.heading, fontFace: t.headingFont.face, valign: "middle",
  });
}

function renderEditorialContent(slide: pptxgen.Slide, s: Slide, t: Style, opts: ContentOpts) {
  slide.background = { color: t.bg };
  contentHeading(slide, s, t);
  const points = s.bullets.filter(b => b.trim());
  if (!points.length) return;
  const region = { x: 0.8, y: 2.0, w: opts.hasImage && !opts.bottomVisual ? 5.85 : W - 1.6,
    h: opts.bottomVisual ? 1.8 : 4.65 };
  const composition = opts.hasImage || opts.bottomVisual ? "list" : selectComposition(s);
  const addBody = (text: string, box: Box, size: number, bold = false, color = t.text) => {
    slide.addText(text, { ...box, margin: 0, fontFace: t.bodyFont.face, fontSize: size,
      color, bold, valign: "top", breakLine: false });
  };
  if (composition === "timeline" || composition === "metrics") {
    const gap = 0.4;
    const width = (region.w - gap * (points.length - 1)) / points.length;
    const parts = points.map(p => p.trim().match(/^(\S+)\s+([\s\S]+)$/)!);
    const bodySize = Math.min(t.bodyFont.size, ...parts.map(p => fitBodyFontSize([p[2]], width, 2.6, t.bodyFont.size)));
    points.forEach((_, i) => {
      const x = region.x + i * (width + gap);
      addBody(parts[i][1], { x, y: 2.25, w: width, h: 1.0 }, fitHeadingFontSize(parts[i][1], width, 1, 48), true, t.accent);
      if (composition === "timeline") {
        slide.addShape("line", { x, y: 3.55, w: width + (i < points.length - 1 ? gap : 0), h: 0,
          line: { color: t.accent, width: 1.5 } });
        slide.addShape("ellipse", { x, y: 3.49, w: 0.12, h: 0.12,
          fill: { color: t.accent }, line: { color: t.accent } });
      }
      addBody(parts[i][2], { x, y: 3.95, w: width, h: 2.6 }, bodySize);
    });
  } else if (composition === "comparison") {
    const cols = points.length <= 3 ? points.length : 2;
    const rows = Math.ceil(points.length / cols);
    const gapX = 0.5;
    const gapY = 0.4;
    const width = (region.w - gapX * (cols - 1)) / cols;
    const maxHeight = (region.h - gapY * (rows - 1)) / rows;
    const innerWidth = width - 0.48;
    const cards = points.map((point) => {
      const match = point.match(/^\s*(.{1,45}?)\s*(?::|—)\s+([\s\S]+?)\s*$/u);
      return match
        ? { label: match[1].trim(), body: match[2].trim() }
        : { label: "", body: point };
    });
    const estimateLines = (text: string, boxWidth: number, size: number, charRatio: number) =>
      Math.max(1, Math.ceil(text.length / Math.max(8, Math.floor(boxWidth * 72 / (charRatio * size)))));
    const labelFontSizes = cards.map(card => card.label
      ? fitHeadingFontSize(card.label, innerWidth, 0.8, 20, 14)
      : 0);
    const labelHeights = cards.map((card, index) => card.label
      ? estimateLines(card.label, innerWidth, labelFontSizes[index], 0.62) * (1.15 * labelFontSizes[index]) / 72
      : 0);
    const naturalHeight = Math.max(...cards.map((card, index) => {
      const bodyLines = estimateLines(card.body, innerWidth, t.bodyFont.size, 0.52);
      const bodyHeight = bodyLines * (1.3 * t.bodyFont.size) / 72 + 10 / 72;
      return labelHeights[index] + (card.label ? 0.12 : 0) + bodyHeight + 0.44;
    }));
    const height = Math.min(maxHeight, Math.max(1.45, naturalHeight));
    points.forEach((p, i) => {
      const box = { x: region.x + (i % cols) * (width + gapX), y: region.y + Math.floor(i / cols) * (height + gapY), w: width, h: height };
      slide.addShape("rect", { ...box, fill: { color: t.accent, transparency: 94 }, line: { transparency: 100, color: t.bg } });
      const card = cards[i];
      const contentX = box.x + 0.24;
      const contentY = box.y + 0.22;
      if (card.label) {
        addBody(card.label, { x: contentX, y: contentY, w: innerWidth, h: labelHeights[i] }, labelFontSizes[i], true, t.heading);
      }
      const bodyY = contentY + labelHeights[i] + (card.label ? 0.12 : 0);
      const bodyHeight = Math.max(0.5, box.y + box.h - 0.22 - bodyY);
      const bodySize = fitBodyFontSize([card.body], innerWidth, bodyHeight, t.bodyFont.size);
      addBody(card.body, { x: contentX, y: bodyY, w: innerWidth, h: bodyHeight }, bodySize);
    });
  } else if (composition === "statement") {
    const lead = points[0];
    addBody(lead, { ...region, h: points.length > 1 ? 2.15 : 3.6 },
      fitHeadingFontSize(lead, region.w, points.length > 1 ? 2.15 : 3.6, 38), true);
    if (points.length > 1) {
      const rest = points.slice(1).join("\n\n");
      addBody(rest, { ...region, y: 4.5, h: 2.1 }, fitBodyFontSize(points.slice(1), region.w, 2.1, t.bodyFont.size));
    }
  } else {
    // Content-sized rows: no giant empty frames and no arbitrary list numbers.
    const gap = opts.bottomVisual ? 0.12 : 0.26;
    const height = (region.h - gap * (points.length - 1)) / points.length;
    const size = Math.min(...points.map(p => fitBodyFontSize([p], region.w - 0.35, height, t.bodyFont.size)));
    points.forEach((p, i) => {
      const y = region.y + i * (height + gap);
      slide.addShape("ellipse", { x: region.x, y: y + 0.13, w: 0.075, h: 0.075,
        fill: { color: t.accent }, line: { color: t.accent, transparency: 100 } });
      addBody(p, { x: region.x + 0.3, y, w: region.w - 0.3, h: height }, size);
    });
  }
}

function renderContent(slide: pptxgen.Slide, s: Slide, t: Style, opts: ContentOpts) {
  renderEditorialContent(slide, s, t, opts);
}

function renderAcademicTitle(slide: pptxgen.Slide, s: Slide, t: Style) {
  slide.background = { color: t.bg };
  slide.addText(s.heading, {
    x: 0.9, y: 1.8, w: W - 1.8, h: 2.1, margin: 0,
    fontSize: fitHeadingFontSize(s.heading, W - 1.8, 2.1, t.headingFont.size + 14),
    bold: true, color: t.heading, fontFace: t.headingFont.face, valign: "middle",
  });
  if (s.subheading) slide.addText(s.subheading, {
    x: 0.9, y: 4.25, w: W - 2.8, h: 1.35, margin: 0,
    fontSize: fitBodyFontSize([s.subheading], W - 2.8, 1.35, t.bodyFont.size),
    color: t.text, fontFace: t.bodyFont.face, valign: "top",
  });
}

function renderAcademicSection(slide: pptxgen.Slide, s: Slide, t: Style) {
  renderAcademicTitle(slide, s, t);
}

function renderAcademicContent(slide: pptxgen.Slide, s: Slide, t: Style,
  hasImage: boolean, bottomVisual: boolean) {
  renderEditorialContent(slide, s, t, { hasImage, bottomVisual });
}

// Широкий визуал (LR-диаграммы) в боковом регионе съёживается в марку —
// уводим его вниз на всю ширину слайда.
const WIDE_ASPECT = 1.5;

function visualRegion(hasBullets: boolean, bottom: boolean, reserveFooter = false): Box {
  // Полоса под визуал шире и ВЫШЕ (h 2.95 вместо 2.25): схемы на защите читаемы
  // с расстояния. Текстовые регионы обязаны заканчиваться выше y=4.05.
  if (bottom) return { x: 0.7, y: 4.05, w: W - 1.4, h: reserveFooter ? 2.35 : 2.95 };
  return {
    x: hasBullets ? 7.2 : 2.0,
    y: 1.85,
    w: hasBullets ? 5.2 : 9.3,
    h: hasBullets ? 3.45 : 4.45,
  };
}

function renderSourceFooter(slide: pptxgen.Slide, s: Slide, t: Style) {
  const validSources = (s.sources ?? []).flatMap((source) => {
    try {
      const url = new URL(source);
      if (url.protocol !== "https:") return [];
      return [{ source, host: url.hostname.replace(/^www\./i, "") }];
    } catch {
      return [];
    }
  });
  if (!validSources.length) return;
  const links = validSources.map(({ source, host }, index) => ({
    text: `${host} · ${index + 1}`,
    options: { hyperlink: { url: source } },
  }));
  const runs = links.flatMap((link, index) => index === 0
    ? [link]
    : [{ text: "   ·   " }, link]);
  slide.addText(runs, {
    x: 0.75, y: H - 0.36, w: W - 1.5, h: 0.2,
    fontSize: 9, color: t.subText, fontFace: t.bodyFont.face,
    align: "right", valign: "middle",
  });
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
    color: t.text,
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
  bottom: boolean,
  reserveFooter: boolean
) {
  const region = visualRegion(hasBullets, bottom, reserveFooter);
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
      chartColors: chart.kind === "pie" ? [t.accent, t.primary, t.heading, t.subText] : [t.accent],
      showLegend: chart.kind === "pie",
      legendPos: "b",
      showValue: chart.kind !== "pie",
      showPercent: chart.kind === "pie",
      catAxisLabelColor: t.text,
      valAxisLabelColor: t.text,
    }
  );
  addCaption(slide, t, [visual.caption, chart.source].filter(Boolean).join(" · "), region);
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
  const base = THEMES[style] ?? THEMES.business;
  const validColor = (value: string | undefined) => value && /^[0-9a-f]{6}$/i.test(value) ? value : undefined;
  const modelPalette = deck.palette;
  // Auto design must actually use the model palette. Explicit user choices win.
  const automaticPalette = (!prefs?.preset || prefs.preset === "auto") && validColor(modelPalette?.bg) && validColor(modelPalette?.ink)
    ? { bg: modelPalette!.bg, text: modelPalette!.ink, accent: validColor(modelPalette?.accent) ?? base.accent }
    : undefined;
  const spec = themeFromPrefs(base, automaticPalette
    ? { ...prefs, palette: { ...automaticPalette, ...prefs?.palette } }
    : prefs);
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
    let aiVisual =
      s.layout === "content" && !resolvedPath ? aiVisuals?.get(index + 1) : undefined;
    // Preserve photos and rendered diagrams; only generated artwork is excluded.
    if (spec.academic && aiVisual?.kind === "image" && aiVisual.sourceType === "image") aiVisual = undefined;
    const bullets = s.bullets.filter((b) => b.trim().length > 0);
    const hasBullets = bullets.length > 0;
    const hasImage = Boolean(resolvedPath) || Boolean(aiVisual);
    const hasSources = Boolean(s.sources?.length);

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
        if (spec.academic) renderAcademicContent(slide, s, spec, hasImage, bottomVisual);
        else renderContent(slide, s, spec, { hasImage, bottomVisual });
        if (resolvedPath && image) {
          const region = visualRegion(hasBullets, bottomVisual, hasSources);
          const fitted = fitContain(region, natural);
          slide.addImage({
            path: resolvedPath,
            ...fitted,
            altText: image.description ?? "",
          });
          addCaption(slide, spec, image.description ?? "", region, fitted);
        } else if (aiVisual) {
          renderAiVisual(pptx, slide, spec, aiVisual, hasBullets, bottomVisual, hasSources);
        }
        break;
    }
    if (s.layout === "content" && hasSources) renderSourceFooter(slide, s, spec);
  }

  await pptx.writeFile({ fileName: outPath });
}
