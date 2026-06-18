import pptxgen from "pptxgenjs";
import type { Deck, Slide } from "@/lib/anthropic";

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

function renderContent(slide: pptxgen.Slide, s: Slide, t: Theme) {
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
      { x: 0.9, y: 1.9, w: W - 1.8, h: H - 2.6, valign: "top", fit: "shrink" }
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

export async function buildPptx(
  deck: Deck,
  style: string,
  outPath: string
): Promise<void> {
  const theme = THEMES[style] ?? THEMES.business;

  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "SlideMaker";
  pptx.title = deck.title;

  for (const s of deck.slides) {
    const slide = pptx.addSlide();
    switch (s.layout) {
      case "title":
        renderTitle(slide, s, theme);
        break;
      case "section":
        renderSection(slide, s, theme);
        break;
      default: // content | conclusion
        renderContent(slide, s, theme);
        break;
    }
  }

  await pptx.writeFile({ fileName: outPath });
}
