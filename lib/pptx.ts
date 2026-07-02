import path from "path";
import { promises as fs } from "fs";
import pptxgen from "pptxgenjs";
import type { Deck, Slide } from "@/lib/anthropic";
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

function renderTitle(slide: pptxgen.Slide, s: Slide, t: Theme) {
  slide.background = { color: t.titleBg };
  slide.addText(s.heading, {
    x: 0.9,
    y: 2.5,
    w: W - 1.8,
    h: 1.8,
    fontSize: 40,
    bold: true,
    color: t.titleText,
    fontFace: t.font,
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
      fontFace: t.font,
      align: "left",
    });
  }
}

function renderSection(slide: pptxgen.Slide, s: Slide, t: Theme, index: number) {
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
    fontFace: t.font,
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
    fontFace: t.font,
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
      fontFace: t.font,
      align: "left",
    });
  }
}

// Геометрия content-слайда для варианта лейаута. 3 детерминированных варианта,
// ротация по индексу слайда — соседние всегда различаются.
function contentLayout(variant: number): {
  headingX: number;
  headingY: number;
  bulletY: number;
  decor: (slide: pptxgen.Slide, t: Theme) => void;
} {
  switch (variant % 3) {
    case 1:
      // вертикальная полоса слева
      return {
        headingX: 0.9,
        headingY: 0.6,
        bulletY: 1.9,
        decor: (slide, t) =>
          slide.addShape("rect", { x: 0, y: 0, w: 0.28, h: H, fill: { color: t.primary } }),
      };
    case 2:
      // акцент-блок под заголовком, без верхней полосы
      return {
        headingX: 0.7,
        headingY: 0.55,
        bulletY: 2.05,
        decor: (slide, t) =>
          slide.addShape("rect", {
            x: 0.75,
            y: 1.6,
            w: 2.4,
            h: 0.09,
            fill: { color: t.accent },
          }),
      };
    default:
      // верхняя акцентная полоса (вариант 0)
      return {
        headingX: 0.7,
        headingY: 0.6,
        bulletY: 1.9,
        decor: (slide, t) =>
          slide.addShape("rect", { x: 0, y: 0, w: W, h: 0.22, fill: { color: t.primary } }),
      };
  }
}

function renderContent(
  slide: pptxgen.Slide,
  s: Slide,
  t: Theme,
  hasImage: boolean,
  variant: number
) {
  slide.background = { color: t.bg };
  const layout = contentLayout(variant);
  layout.decor(slide, t);

  slide.addText(s.heading, {
    x: layout.headingX,
    y: layout.headingY,
    w: W - layout.headingX - 0.7,
    h: 1.0,
    fontSize: 28,
    bold: true,
    color: t.heading,
    fontFace: t.font,
    align: "left",
    fit: "shrink",
  });

  const bullets = s.bullets.filter((b) => b.trim().length > 0);
  if (bullets.length > 0) {
    const bulletW = hasImage ? 5.8 : W - 1.8;
    const bulletH = hasImage ? 4.9 : H - 2.6;
    slide.addText(
      bullets.map((b) => ({
        text: b,
        options: {
          bullet: { code: "2022", indent: 18 },
          fontSize: 18,
          color: t.text,
          fontFace: t.font,
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
    fontFace: t.font,
    align: "right",
  });
}

function visualRegion(hasBullets: boolean): Box {
  return {
    x: hasBullets ? 7.2 : 2.0,
    y: 1.85,
    w: hasBullets ? 5.2 : 9.3,
    h: hasBullets ? 3.45 : 4.45,
  };
}

// Подпись всегда ПОД полным регионом (не под вписанной картинкой) — не наезжает.
function addCaption(slide: pptxgen.Slide, t: Theme, text: string, region: Box) {
  if (!text) return;
  slide.addText(text, {
    x: region.x,
    y: region.y + region.h + 0.12,
    w: region.w,
    h: 0.45,
    fontSize: 12,
    color: t.subText,
    fontFace: t.font,
    italic: true,
    fit: "shrink",
  });
}

function renderAiVisual(
  pptx: pptxgen,
  slide: pptxgen.Slide,
  t: Theme,
  visual: ResolvedVisual,
  hasBullets: boolean
) {
  const region = visualRegion(hasBullets);
  if (visual.kind === "image") {
    const fitted = fitContain(region, sizeFromDataUrl(visual.data));
    slide.addImage({ data: visual.data, ...fitted, altText: visual.alt });
    addCaption(slide, t, visual.caption, region);
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
  aiVisuals?: Map<number, ResolvedVisual>
): Promise<void> {
  const theme = THEMES[style] ?? THEMES.business;

  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "SlideMaker";
  pptx.title = deck.title;

  for (let index = 0; index < deck.slides.length; index++) {
    const s = deck.slides[index];
    const slide = pptx.addSlide();
    const image = s.layout === "content" ? slideImages?.get(index + 1) : undefined;
    const resolvedPath = image ? resolveSlideImagePath(image.path) : null;
    // AI-визуал только если на этот слайд нет загрузки пользователя
    const aiVisual =
      s.layout === "content" && !resolvedPath ? aiVisuals?.get(index + 1) : undefined;
    const bullets = s.bullets.filter((b) => b.trim().length > 0);
    const hasBullets = bullets.length > 0;
    switch (s.layout) {
      case "title":
        renderTitle(slide, s, theme);
        break;
      case "section":
        renderSection(slide, s, theme, index);
        break;
      default: // content | conclusion
        renderContent(
          slide,
          s,
          theme,
          Boolean(resolvedPath) || Boolean(aiVisual),
          index
        );
        if (resolvedPath && image) {
          const region = visualRegion(hasBullets);
          const fitted = fitContain(region, await sizeFromFile(resolvedPath));
          slide.addImage({
            path: resolvedPath,
            ...fitted,
            altText: image.description ?? "",
          });
          addCaption(slide, theme, image.description ?? "", region);
        } else if (aiVisual) {
          renderAiVisual(pptx, slide, theme, aiVisual, hasBullets);
        }
        break;
    }
  }

  await pptx.writeFile({ fileName: outPath });
}
