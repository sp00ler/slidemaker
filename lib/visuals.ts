import type { Deck, Visual } from "@/lib/anthropic";
import { deflateSync } from "node:zlib";

// Исполняющий слой визуалов из spec модели:
//  - diagram  → Mermaid через kroki.io (без локального chromium)
//  - chart    → структурно, нативный addChart в pptx.ts
//  - photo    → Pexels API (за env PEXELS_API_KEY)
//  - image    → image-модель (за env, пока заглушка)
//  - none     → пропуск
// Приоритет на стороне pptx: загрузка пользователя важнее AI-визуала.

export type ResolvedVisual =
  | {
      kind: "image";
      data: string;
      alt: string;
      caption: string;
      sourceType?: "photo" | "diagram" | "image";
    } // data = data:URL base64
  | {
      kind: "chart";
      chart: NonNullable<Visual["chart"]>;
      alt: string;
      caption: string;
    };

const FETCH_TIMEOUT_MS = 8000;
const MERMAID_TIMEOUT_MS = 20_000; // Allow time for Kroki's cold render.

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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

async function fetchPngDataUrl(url: string, init?: RequestInit): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MERMAID_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:image/png;base64,${buf.toString("base64")}`;
  } finally {
    clearTimeout(timer);
  }
}

function buildMermaidSource(v: Visual, accent?: string): string {
  const color =
    accent && /^#?[0-9a-fA-F]{6}$/.test(accent.trim())
      ? `#${accent.trim().replace(/^#/, "")}`
      : "#1F3A5F";
  const init = {
    theme: "base",
    fontFamily: "Arial",
    themeVariables: {
      primaryColor: "#F7F8FA",
      primaryBorderColor: color,
      primaryTextColor: "#1A1A1A",
      lineColor: color,
      fontFamily: "Arial",
      fontSize: "22px",
    },
  };
  return `%%{init: ${JSON.stringify(init)}}%%\n${v.mermaid}`;
}

async function mermaidToImage(v: Visual, accent?: string): Promise<ResolvedVisual | null> {
  if (!v.mermaid.trim()) return null;
  const code = buildMermaidSource(v, accent);
  const makeImage = (data: string): ResolvedVisual => ({
    kind: "image",
    data,
    alt: v.alt,
    caption: v.caption,
    sourceType: "diagram",
  });

  try {
    const data = await fetchPngDataUrl("https://kroki.io/mermaid/png", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: code,
    });
    if (data) return makeImage(data);
  } catch {
    // Try the secondary renderer after transport, status, or body-read failure.
  }

  const payload = JSON.stringify({ code, mermaid: { theme: "base" } });
  const encoded = deflateSync(Buffer.from(payload, "utf8")).toString("base64url");
  try {
    const data = await fetchPngDataUrl(`https://mermaid.ink/img/pako:${encoded}?type=png`);
    return data ? makeImage(data) : null;
  } catch {
    return null;
  }
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
    sourceType: "photo",
  };
}

// Генерация картинки OpenAI Images (gpt-image-1). Включается при OPENAI_API_KEY.
const IMAGE_GEN_TIMEOUT_MS = 60000; // генерация медленнее обычного fetch

// Жёстко приклеенный style-suffix — не полагаемся только на то, что модель
// сама впишет ограничения стиля в image_prompt (замечание QA: "иишные",
// тёмные картинки на светлой колоде).
function buildImagePrompt(v: Visual, accent?: string): string {
  const style =
    "Style: light background, flat/minimal editorial illustration, no photorealism, " +
    "no dark or moody lighting, clean simple shapes" +
    (accent ? `, color palette built around ${accent}` : "") +
    ".";
  return `${v.image_prompt.trim()}. ${style}`;
}

async function generatedImage(v: Visual, accent?: string): Promise<ResolvedVisual | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !v.image_prompt.trim()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_GEN_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: buildImagePrompt(v, accent),
        size: "1536x1024", // landscape под слайд
        quality: process.env.OPENAI_IMAGE_QUALITY || "medium", // low|medium|high — цена/качество
        n: 1,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { b64_json?: string }[] };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) return null;
    return {
      kind: "image",
      data: `data:image/png;base64,${b64}`,
      alt: v.alt,
      caption: v.caption,
      sourceType: "image",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveVisual(v: Visual, accent?: string): Promise<ResolvedVisual | null> {
  switch (v.type) {
    case "diagram":
      return mermaidToImage(v, accent);
    case "chart":
      return v.chart && v.chart.data.length > 0
        ? { kind: "chart", chart: v.chart, alt: v.alt, caption: v.caption }
        : null;
    case "photo":
      return photoToImage(v);
    case "image":
      return generatedImage(v, accent);
    default:
      return null;
  }
}

export function isAllowedAcademicVisual(visual: ResolvedVisual): boolean {
  return visual.kind !== "image" || visual.sourceType !== "image";
}

// Резолвит визуалы для content-слайдов параллельно. Любая ошибка/таймаут
// отдельного визуала не валит заказ — слайд просто остаётся текстовым.
export async function resolveDeckVisuals(
  deck: Deck
): Promise<Map<number, ResolvedVisual>> {
  const out = new Map<number, ResolvedVisual>();
  const accent = deck.palette?.accent;
  await Promise.all(
    deck.slides.map(async (slide, index) => {
      if (slide.layout !== "content") return;
      try {
        const resolved = await resolveVisual(slide.visual, accent);
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
