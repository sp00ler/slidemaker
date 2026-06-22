import path from "path";
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

function resolveSlideImagePath(filePath: string): string | null {
  const resolved = path.resolve(process.cwd(), filePath);
  if (!resolved.startsWith(UPLOADS_ROOT + path.sep)) {
    return null;
  }
  return resolved;
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

function renderSection(slide: pptxgen.Slide, s: Slide, t: Theme) {
  slide.background = { color: t.primary };
  slide.addText(s.heading, {
    x: 0.9,
    y: 2.8,
    w: W - 1.8,
    h: 1.9,
    fontSize: 34,
    bold: true,
    color: "FFFFFF",
    fontFace: t.font,
    align: "center",
    valign: "middle",
  });
  if (s.subheading) {
    slide.addText(s.subheading, {
      x: 0.9,
      y: 4.7,
      w: W - 1.8,
      h: 1.0,
      fontSize: 18,
      color: "FFFFFFCC",
      fontFace: t.font,
      align: "center",
    });
  }
}

function renderContent(
  slide: pptxgen.Slide,
  s: Slide,
  t: Theme,
  hasImage: boolean
) {
  slide.background = { color: t.bg };
  // верхняя акцентная полоса
  slide.addShape("rect", { x: 0, y: 0, w: W, h: 0.22, fill: { color: t.primary } });

  slide.addText(s.heading, {
    x: 0.7,
    y: 0.6,
    w: W - 1.4,
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
      { x: 0.9, y: 1.9, w: bulletW, h: bulletH, valign: "top", fit: "shrink" }
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

function visualRegion(hasBullets: boolean) {
  return {
    x: hasBullets ? 7.2 : 2.0,
    y: 1.85,
    w: hasBullets ? 5.2 : 9.3,
    h: hasBullets ? 3.45 : 4.45,
  };
}

function addCaption(
  slide: pptxgen.Slide,
  t: Theme,
  text: string,
  region: { x: number; y: number; w: number; h: number }
) {
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
    slide.addImage({ data: visual.data, ...region, altText: visual.alt });
    addCaption(slide, t, visual.caption, region);
    return;
  }
  // chart — нативный график pptxgenjs
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
        renderSection(slide, s, theme);
        break;
      default: // content | conclusion
        renderContent(slide, s, theme, Boolean(resolvedPath) || Boolean(aiVisual));
        if (resolvedPath && image) {
          const region = visualRegion(hasBullets);
          slide.addImage({
            path: resolvedPath,
            ...region,
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
