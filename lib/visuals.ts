import type { Deck, Visual } from "@/lib/anthropic";

// Исполняющий слой визуалов из spec модели:
//  - diagram  → Mermaid через kroki.io (без локального chromium)
//  - chart    → структурно, нативный addChart в pptx.ts
//  - photo    → Pexels API (за env PEXELS_API_KEY)
//  - image    → image-модель (за env, пока заглушка)
//  - none     → пропуск
// Приоритет на стороне pptx: загрузка пользователя важнее AI-визуала.

export type ResolvedVisual =
  | { kind: "image"; data: string; alt: string; caption: string } // data = data:URL base64
  | {
      kind: "chart";
      chart: NonNullable<Visual["chart"]>;
      alt: string;
      caption: string;
    };

const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function bufferToDataUrl(res: Response, mime: string): Promise<string> {
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function mermaidToImage(v: Visual): Promise<ResolvedVisual | null> {
  if (!v.mermaid.trim()) return null;
  const res = await fetchWithTimeout("https://kroki.io/mermaid/png", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: v.mermaid,
  });
  if (!res.ok) return null;
  return {
    kind: "image",
    data: await bufferToDataUrl(res, "image/png"),
    alt: v.alt,
    caption: v.caption,
  };
}

async function photoToImage(v: Visual): Promise<ResolvedVisual | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key || !v.search_query.trim()) return null;

  const search = await fetchWithTimeout(
    `https://api.pexels.com/v1/search?per_page=1&orientation=landscape&query=${encodeURIComponent(
      v.search_query
    )}`,
    { headers: { Authorization: key } }
  );
  if (!search.ok) return null;
  const json = (await search.json()) as {
    photos?: { src?: { large?: string } }[];
  };
  const url = json.photos?.[0]?.src?.large;
  if (!url) return null;

  const img = await fetchWithTimeout(url);
  if (!img.ok) return null;
  return {
    kind: "image",
    data: await bufferToDataUrl(img, "image/jpeg"),
    alt: v.alt,
    caption: v.caption,
  };
}

// Генерация картинки image-моделью. Включается, когда заведёшь провайдера и ключ.
async function generatedImage(_v: Visual): Promise<ResolvedVisual | null> {
  // TODO: подключить image-модель (Stability/OpenAI/Imagen) за env-ключом.
  // Возвращай { kind: "image", data: dataUrl, alt, caption }.
  return null;
}

export async function resolveVisual(v: Visual): Promise<ResolvedVisual | null> {
  switch (v.type) {
    case "diagram":
      return mermaidToImage(v);
    case "chart":
      return v.chart && v.chart.data.length > 0
        ? { kind: "chart", chart: v.chart, alt: v.alt, caption: v.caption }
        : null;
    case "photo":
      return photoToImage(v);
    case "image":
      return generatedImage(v);
    default:
      return null;
  }
}

// Резолвит визуалы для content-слайдов параллельно. Любая ошибка/таймаут
// отдельного визуала не валит заказ — слайд просто остаётся текстовым.
export async function resolveDeckVisuals(
  deck: Deck
): Promise<Map<number, ResolvedVisual>> {
  const out = new Map<number, ResolvedVisual>();
  await Promise.all(
    deck.slides.map(async (slide, index) => {
      if (slide.layout !== "content") return;
      try {
        const resolved = await resolveVisual(slide.visual);
        if (resolved) out.set(index + 1, resolved);
      } catch (e) {
        console.warn("visual resolve failed:", {
          slide: index + 1,
          type: slide.visual.type,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })
  );
  return out;
}
