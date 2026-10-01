export type DeckQualityContext = {
  topic: string; slideCount: number; sourceText?: string | null;
  wishes?: string | null; storyboard?: string | null; currentYear?: number;
};
type Slide = {
  layout: string; heading: string; subheading: string; bullets: string[]; sources?: string[];
  visual: { type: string; caption: string; chart: { source?: string; data: { value: number }[] } | null };
};
type Deck = { slides: Slide[] };
const filler = /дополнительный слайд|содержание будет уточнено|ключевые выводы представлены выше|заполнить позднее|^презентация$|lorem ipsum|placeholder|your content here|to be determined|\btbd\b/i;
const norm = (s: string) => s.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, " ").trim();

export function validateDeckQuality(deck: Deck, context: DeckQualityContext): string[] {
  const issues: string[] = [];
  if (deck.slides.length !== context.slideCount) issues.push(`Ожидалось ${context.slideCount} слайдов, получено ${deck.slides.length}.`);
  const material = [context.topic, context.sourceText, context.wishes, context.storyboard].filter(Boolean).join("\n");
  const materialNumbers = new Set<string>();
  for (const match of material.matchAll(/-?\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?/g)) {
    const compact = match[0].replace(/[ \u00a0\u202f]/g, "");
    materialNumbers.add(compact.replace(",", "."));
    if (/^-?\d{1,3}[,.]\d{3}$/.test(compact)) {
      materialNumbers.add(compact.replace(/[,.]/g, ""));
    }
  }
  if (deck.slides[0]?.layout !== "title") issues.push("Первый слайд должен быть титульным.");
  if (deck.slides.length > 1 && deck.slides.at(-1)?.layout !== "conclusion")
    issues.push("Последний слайд должен быть заключением.");
  deck.slides.slice(1, -1).forEach((slide, index) => {
    if (slide.layout !== "content") issues.push(`Слайд ${index + 2}: ожидается содержательный layout.`);
  });
  const seen = new Map<string, number>();
  deck.slides.forEach((slide, index) => {
    const n = index + 1;
    if (!slide.heading.trim()) issues.push(`Слайд ${n}: пустой заголовок.`);
    if ([slide.heading, slide.subheading, ...slide.bullets].some((s) => filler.test(s)))
      issues.push(`Слайд ${n}: шаблонный текст.`);
    if (slide.layout !== "title" && !slide.bullets.some((s) => s.trim()))
      issues.push(`Слайд ${n}: нет содержательных пунктов.`);
    for (const source of slide.sources ?? []) {
      if (!/^https:\/\/\S+$/.test(source) || !material.includes(source))
        issues.push(`Слайд ${n}: ссылка на источник отсутствует в материалах заказа.`);
    }
    const bullets = slide.bullets.map(norm).filter(Boolean);
    if (new Set(bullets).size !== bullets.length) issues.push(`Слайд ${n}: повторяются пункты.`);
    if (slide.layout === "content") {
      const signature = norm(slide.heading + " " + slide.bullets.join(" "));
      const previous = seen.get(signature);
      if (signature && previous !== undefined) issues.push(`Слайды ${previous} и ${n}: одинаковое содержание.`);
      else if (signature) seen.set(signature, n);
    }
    const caption = slide.visual.caption;
    const ru = /[А-Яа-яЁё]/.test(context.topic);
    const cyr = (caption.match(/[А-Яа-яЁё]+/g) ?? []).length;
    const lat = (caption.match(/[A-Za-z]+/g) ?? []).length;
    if (ru ? lat >= 4 && lat > cyr * 2 && /\b(the|and|with|for|from|this|shows|chart|figure|data|of)\b/i.test(caption)
           : cyr >= 4 && cyr > lat * 2)
      issues.push(`Слайд ${n}: подпись визуала не на языке темы.`);
    if (slide.visual.type === "chart") {
      const chart = slide.visual.chart;
      if (!chart?.data.length) issues.push(`Слайд ${n}: у графика нет данных.`);
      const source = chart?.source?.trim() ?? "";
      if (norm(source).length < 8 || !norm(material).includes(norm(source)))
        issues.push(`Слайд ${n}: источник графика отсутствует в материалах заказа.`);
      if (chart?.data.some((d) => !materialNumbers.has(String(d.value))))
        issues.push(`Слайд ${n}: числа графика отсутствуют в материалах заказа.`);
      if (chart?.data.some((d) => !Number.isFinite(d.value)))
        issues.push(`Слайд ${n}: у графика некорректные значения.`);
    }
  });
  const allText = material + "\n" + deck.slides.flatMap((s) => [s.heading, ...s.bullets]).join("\n");
  const foundedYears = new Set(
    [...allText.matchAll(/(?:основан[а-яё]*|создан[а-яё]*|учрежден[а-яё]*|founded|established)[^.!?\n]{0,35}?\b(1\d{3}|20\d{2})\b/gi)]
      .map((match) => Number(match[1]))
  );
  // A single founding year can be compared safely; mixed organizations need human context.
  if (foundedYears.size === 1) {
    const year = [...foundedYears][0];
    const now = context.currentYear ?? new Date().getFullYear();
    const deckText = deck.slides.flatMap((s) => [s.heading, ...s.bullets]).join("\n");
    const claims = deckText.matchAll(/\b(\d{1,4})\s*(?:years?\s+(?:of\s+)?history|лет\s+истории|года?\s+истории)/gi);
    for (const claim of claims) {
      if (Math.abs(now - year - Number(claim[1])) > 1) {
        issues.push(`История организации: основана в ${year}, но указано ${claim[1]} лет (на ${now} год).`);
        break;
      }
    }
  }  return issues;
}

