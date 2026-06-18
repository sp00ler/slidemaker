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

export type Slide = z.infer<typeof SlideSchema>;
export type Deck = z.infer<typeof DeckSchema>;

function extractJson(text: string): string {
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

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  if (!text) throw new Error("Пустой ответ модели");

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(text));
  } catch {
    throw new Error("Не удалось разобрать JSON из ответа модели");
  }

  const deck = DeckSchema.parse(parsed);

  // Гарантируем нужное число слайдов (модель иногда отклоняется).
  if (deck.slides.length > slideCount) {
    deck.slides = deck.slides.slice(0, slideCount);
  }
  if (deck.slides.length === 0) {
    throw new Error("Модель вернула пустой список слайдов");
  }

  return deck;
}
