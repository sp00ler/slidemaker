import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { STYLES, StyleId } from "@/lib/tariffs";

const client = new Anthropic(); // ключ берётся из ANTHROPIC_API_KEY

const SlideSchema = z.object({
  layout: z.enum(["title", "content", "section", "conclusion"]),
  heading: z.string(),
  subheading: z.string(),
  bullets: z.array(z.string()),
});

const DeckSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  slides: z.array(SlideSchema),
});

const TopUpSlidesSchema = z.union([
  z.array(SlideSchema),
  z.object({ slides: z.array(SlideSchema) }).transform((data) => data.slides),
]);

export type Slide = z.infer<typeof SlideSchema>;
export type Deck = z.infer<typeof DeckSchema>;

export function extractJson(text: string): string {
  let t = text.trim();
  // убираем возможные ```json ... ``` ограждения
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    t = t.slice(first, last + 1);
  }
  return t;
}

function parseDeckResponse(text: string): Deck {
  if (!text) throw new Error("Пустой ответ модели");

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(text));
  } catch {
    throw new Error("Не удалось разобрать JSON из ответа модели");
  }

  return DeckSchema.parse(parsed);
}

function getResponseText(response: Anthropic.Messages.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function makeTitleSlide(deck: Deck): Slide {
  return {
    layout: "title",
    heading: deck.title || "Презентация",
    subheading: deck.subtitle || "",
    bullets: [],
  };
}

function makeConclusionSlide(): Slide {
  return {
    layout: "conclusion",
    heading: "Итоги",
    subheading: "",
    bullets: ["Ключевые выводы представлены выше."],
  };
}

function makePlaceholderSlide(index: number): Slide {
  return {
    layout: "content",
    heading: `Дополнительный слайд ${index}`,
    subheading: "",
    bullets: ["Содержание будет уточнено при доработке презентации."],
  };
}

function asTitleSlide(slide: Slide | undefined, deck: Deck): Slide {
  if (!slide) return makeTitleSlide(deck);
  return {
    ...slide,
    layout: "title",
    heading: slide.heading || deck.title || "Презентация",
    subheading: slide.subheading || deck.subtitle || "",
    bullets: [],
  };
}

function asConclusionSlide(slide: Slide | undefined): Slide {
  if (!slide) return makeConclusionSlide();
  return {
    ...slide,
    layout: "conclusion",
    heading: slide.heading || "Итоги",
    subheading: "",
    bullets: slide.bullets.length > 0 ? slide.bullets : ["Ключевые выводы представлены выше."],
  };
}

export function normalizeDeck(deck: Deck, slideCount: number): Deck {
  const titleIndex = deck.slides.findIndex((slide) => slide.layout === "title");
  const conclusionIndexFromEnd = [...deck.slides]
    .reverse()
    .findIndex((slide) => slide.layout === "conclusion");
  const conclusionIndex =
    conclusionIndexFromEnd === -1
      ? -1
      : deck.slides.length - 1 - conclusionIndexFromEnd;
  const fallbackTitleIndex = deck.slides.length > 0 ? 0 : -1;
  const fallbackConclusionIndex = deck.slides.length > 0 ? deck.slides.length - 1 : -1;
  const effectiveTitleIndex = titleIndex === -1 ? fallbackTitleIndex : titleIndex;
  const effectiveConclusionIndex =
    conclusionIndex === -1 ? fallbackConclusionIndex : conclusionIndex;

  const title = asTitleSlide(
    effectiveTitleIndex === -1 ? undefined : deck.slides[effectiveTitleIndex],
    deck
  );
  const conclusion = asConclusionSlide(
    effectiveConclusionIndex === -1
      ? undefined
      : deck.slides[effectiveConclusionIndex]
  );
  const middleCount = Math.max(slideCount - 2, 0);
  const middle = deck.slides.filter(
    (_, index) => index !== effectiveTitleIndex && index !== effectiveConclusionIndex
  );
  const normalizedMiddle = middle.slice(0, middleCount);

  while (normalizedMiddle.length < middleCount) {
    normalizedMiddle.push(makePlaceholderSlide(normalizedMiddle.length + 1));
  }

  if (slideCount <= 1) {
    return { ...deck, slides: [title].slice(0, slideCount) };
  }

  return {
    ...deck,
    slides: [title, ...normalizedMiddle, conclusion],
  };
}

function insertTopUpSlides(deck: Deck, slides: Slide[]): Deck {
  const conclusionIndexFromEnd = [...deck.slides]
    .reverse()
    .findIndex((slide) => slide.layout === "conclusion");

  if (conclusionIndexFromEnd === -1) {
    return { ...deck, slides: [...deck.slides, ...slides] };
  }

  const conclusionIndex = deck.slides.length - 1 - conclusionIndexFromEnd;

  return {
    ...deck,
    slides: [
      ...deck.slides.slice(0, conclusionIndex),
      ...slides,
      ...deck.slides.slice(conclusionIndex),
    ],
  };
}

export async function generateDeck(params: {
  topic: string;
  style: string;
  slideCount: number;
}): Promise<Deck> {
  const { topic, slideCount } = params;
  const style = (params.style as StyleId) in STYLES ? (params.style as StyleId) : "business";
  const styleInfo = STYLES[style];

  const system =
    "Ты — эксперт по созданию презентаций. Делаешь чёткую, логичную структуру слайдов. " +
    "Отвечай на языке темы (для русской темы — по-русски). " +
    "Возвращай СТРОГО валидный JSON по схеме, без markdown и без пояснений.";

  const prompt = `Создай структуру презентации.
Тема: "${topic}"
Стиль оформления: ${styleInfo.label} (${styleInfo.hint})
Количество слайдов: ровно ${slideCount}.

Требования:
- Первый слайд — титульный (layout "title"): heading = название темы, subheading = краткий подзаголовок, bullets = [].
- Последний слайд — заключение (layout "conclusion"): 2–4 ключевых вывода в bullets.
- Остальные — содержательные (layout "content"): heading и 3–5 кратких пунктов (bullets). Допустим 1 слайд-раздел (layout "section") для крупной темы.
- Пункты краткие (до ~12 слов), без нумерации внутри текста.
- subheading заполняй только для "title"/"section", иначе пустая строка "".

Схема JSON:
{
  "title": string,
  "subtitle": string,
  "slides": [
    { "layout": "title"|"content"|"section"|"conclusion", "heading": string, "subheading": string, "bullets": string[] }
  ]
}
Верни только JSON.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    system,
    messages: [{ role: "user", content: prompt }],
  });

  const deck = parseDeckResponse(getResponseText(response));
  if (deck.slides.length === 0) {
    throw new Error("Модель вернула пустой список слайдов");
  }

  let deckForNormalization = deck;

  if (deck.slides.length < slideCount) {
    const missing = slideCount - deck.slides.length;
    const topUpPrompt = `Для презентации ниже не хватает ${missing} слайдов.
Сгенерируй только недостающие содержательные слайды для вставки перед заключением.
Не возвращай титульный слайд и не возвращай заключение.
Тема: "${topic}"
Стиль оформления: ${styleInfo.label} (${styleInfo.hint})

Верни СТРОГО валидный JSON без markdown:
{
  "slides": [
    { "layout": "content"|"section", "heading": string, "subheading": string, "bullets": string[] }
  ]
}

Текущая презентация:
${JSON.stringify(deck)}`;

    try {
      const topUpResponse = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        system,
        messages: [{ role: "user", content: topUpPrompt }],
      });
      const topUpSlides = TopUpSlidesSchema.parse(
        JSON.parse(extractJson(getResponseText(topUpResponse)))
      )
        .filter((slide) => slide.layout !== "title" && slide.layout !== "conclusion")
        .slice(0, missing);

      deckForNormalization = insertTopUpSlides(deck, topUpSlides);
    } catch (e) {
      console.warn("Deck top-up failed, using placeholder slides:", e);
    }
  }

  if (deckForNormalization.slides.length < slideCount) {
    console.warn(
      `Deck placeholder fallback: got ${deckForNormalization.slides.length}, expected ${slideCount}`
    );
  }

  return normalizeDeck(deckForNormalization, slideCount);
}
