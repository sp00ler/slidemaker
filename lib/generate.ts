import path from "path";
import crypto from "crypto";
import { promises as fs } from "fs";
import {
  OrderRow,
  getOrderFiles,
  getOrderSource,
  markAwaitingManual,
  markDone,
  markError,
} from "@/lib/orders";
import {
  generateDeck,
  type Deck,
  type SourceImageInput,
} from "@/lib/anthropic";
import { extractDocx, type DocxImage } from "@/lib/docx";
import { resolveUploadPath } from "@/lib/uploads";
import { buildPptx } from "@/lib/pptx";
import { resolveDeckVisuals, type ResolvedVisual } from "@/lib/visuals";
import {
  sendAdminOrderEmail,
  sendAuthorCustomerEmail,
  sendDeckEmail,
} from "@/lib/mailer";
import { env } from "@/lib/env";
import { TARIFFS } from "@/lib/tariffs";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Удаляет .pptx старше TTL по mtime. Чистит истёкшие основные файлы и
// orphan-файлы варианта 2 (их нет в БД). mtime>TTL == ссылка уже истекла.
async function sweepOldDownloads(dir: string, ttlDays: number): Promise<void> {
  try {
    const cutoff = Date.now() - ttlDays * 24 * 60 * 60 * 1000;
    const entries = await fs.readdir(dir).catch(() => [] as string[]);
    await Promise.all(
      entries.map(async (name) => {
        if (!name.endsWith(".pptx")) return;
        const fp = path.join(dir, name);
        try {
          const st = await fs.stat(fp);
          if (st.mtimeMs < cutoff) await fs.rm(fp, { force: true });
        } catch {
          // файл исчез/недоступен — пропускаем
        }
      })
    );
  } catch {
    // чистка best-effort, не влияет на заказ
  }
}

type SlideImageEntry = { path: string; description: string | null };

type SourceMaterial = {
  text?: string;
  images: SourceImageInput[];
  // путь к записанной на диск картинке по её индексу (тот же индекс, что и в
  // images / source_image слайда); undefined — индекс пропущен.
  extractedPaths: (string | undefined)[];
};

const EMPTY_SOURCE: SourceMaterial = { images: [], extractedPaths: [] };

// История 1: читаем .docx-первоисточник заказа, достаём текст + картинки,
// картинки кладём на диск под uploads/<orderId>/ (там их найдёт buildPptx).
// Любая ошибка не валит заказ — просто работаем без источника.
async function loadSourceMaterial(order: OrderRow): Promise<SourceMaterial> {
  const src = await getOrderSource(order.id).catch(() => null);
  if (!src) return EMPTY_SOURCE;

  try {
    const buf = await fs.readFile(path.resolve(process.cwd(), src.stored_path));
    const content = await extractDocx(buf, {
      maxImages: 12,
      maxImageBytes: 5 * 1024 * 1024,
      minImageBytes: 8 * 1024,
      maxTextChars: 16000,
    });

    const extractedPaths: (string | undefined)[] = [];
    await Promise.all(
      content.images.map(async (img: DocxImage, index: number) => {
        try {
          const { dir, absolutePath, relativePath } = resolveUploadPath(
            order.id,
            `src_${index}.${img.ext}`
          );
          await fs.mkdir(dir, { recursive: true });
          await fs.writeFile(absolutePath, img.data);
          extractedPaths[index] = relativePath;
        } catch (e) {
          console.warn("source image write failed:", {
            orderId: order.id,
            index,
            error: getErrorMessage(e),
          });
        }
      })
    );

    return {
      text: content.text || undefined,
      images: content.images.map((img) => ({
        mime: img.mime,
        base64: img.data.toString("base64"),
      })),
      extractedPaths,
    };
  } catch (e) {
    console.warn("source doc extract failed, building without it:", {
      orderId: order.id,
      error: getErrorMessage(e),
    });
    return EMPTY_SOURCE;
  }
}

// По выбору модели (slide.source_image) строим карту слайд→картинка из работы.
// Один индекс используем максимум один раз.
function buildSourceSlideMap(
  deck: Deck,
  extractedPaths: (string | undefined)[]
): Map<number, SlideImageEntry> {
  const map = new Map<number, SlideImageEntry>();
  const used = new Set<number>();
  deck.slides.forEach((slide, index) => {
    if (slide.layout !== "content") return;
    const idx = slide.source_image;
    if (idx < 0 || idx >= extractedPaths.length || used.has(idx)) return;
    const relPath = extractedPaths[idx];
    if (!relPath) return;
    used.add(idx);
    map.set(index + 1, {
      path: relPath,
      description: slide.visual.caption || slide.visual.alt || null,
    });
  });
  return map;
}

// Объединяет картинки: пользовательский сториборд важнее картинок из работы.
function mergeSlideImages(
  source: Map<number, SlideImageEntry>,
  storyboard: Map<number, SlideImageEntry>
): Map<number, SlideImageEntry> {
  const merged = new Map(source);
  for (const [slideNumber, entry] of storyboard) {
    merged.set(slideNumber, entry);
  }
  return merged;
}

function buildFileName(email: string): string {
  const safeEmail = email
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const iso = new Date().toISOString();
  const ts =
    iso.slice(0, 10).replace(/-/g, "") + "-" + iso.slice(11, 19).replace(/:/g, "");
  const token = "sm_69" + crypto.randomBytes(4).toString("hex");
  return `${safeEmail}-${ts}-${token}.pptx`;
}

// Полный цикл: текст → JSON структура → .pptx → запись в БД → письмо.
export async function processOrder(order: OrderRow): Promise<void> {
  if (TARIFFS[order.tariff as keyof typeof TARIFFS]?.manual) {
    await markAwaitingManual(order.id);

    try {
      await sendAuthorCustomerEmail(order.email, order.topic);
    } catch (e) {
      console.error("author customer email delivery failed:", {
        orderId: order.id,
        email: order.email,
        error: getErrorMessage(e),
      });
    }

    try {
      await sendAdminOrderEmail(order);
    } catch (e) {
      console.error("author admin email delivery failed:", {
        orderId: order.id,
        email: order.email,
        wishesLength: order.wishes?.length ?? 0,
        storyboardLength: order.storyboard?.length ?? 0,
        error: getErrorMessage(e),
      });
    }

    return;
  }

  const dir = path.join(process.cwd(), "public", "downloads");
  const fileName = buildFileName(order.email);
  const fileRel = `/api/download/${fileName}`;
  const outPath = path.join(dir, fileName);
  const expiresAt = new Date(Date.now() + env.DOWNLOADS_TTL_DAYS * 24 * 60 * 60 * 1000);
  let title = order.topic;
  let secondUrl: string | undefined;

  const baseParams = {
    topic: order.topic,
    style: order.style,
    slideCount: order.slide_count,
    wishes: order.wishes,
    storyboard: order.storyboard,
  };

  async function safeVisuals(deck: Deck): Promise<Map<number, ResolvedVisual> | undefined> {
    try {
      return await resolveDeckVisuals(deck);
    } catch (e) {
      console.warn("deck visuals resolve failed, building text-only:", {
        orderId: order.id,
        error: getErrorMessage(e),
      });
      return undefined;
    }
  }

  await sweepOldDownloads(dir, env.DOWNLOADS_TTL_DAYS);

  try {
    await fs.mkdir(dir, { recursive: true });
    const slideImages = new Map<number, SlideImageEntry>(
      (await getOrderFiles(order.id)).map((file) => [
        file.slide_number,
        { path: file.stored_path, description: file.description },
      ])
    );

    // История 1: материалы исходной работы (.docx) — текст + картинки.
    const source = await loadSourceMaterial(order);
    const genParams = {
      ...baseParams,
      sourceText: source.text,
      sourceImages: source.images,
    };

    // Вариант 2 запускаем сразу — параллельно варианту 1 (best-effort).
    const deck2Promise = generateDeck({
      ...genParams,
      variantHint:
        "Сделай альтернативный вариант: иная структура, порядок и подача, чтобы заметно отличался от первого.",
    }).catch((e) => {
      console.warn("order variant 2 generation failed:", {
        orderId: order.id,
        error: getErrorMessage(e),
      });
      return null;
    });

    // Вариант 1 — обязателен, с ретраем.
    let deck1: Deck | undefined;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        deck1 = await generateDeck(genParams);
        break;
      } catch (e) {
        if (attempt === 2) throw e;
        console.warn("order generation retry:", {
          orderId: order.id,
          email: order.email,
          attempt,
          error: getErrorMessage(e),
        });
      }
    }
    if (!deck1) throw new Error("Не удалось сгенерировать презентацию");
    title = deck1.title;
    const images1 = mergeSlideImages(
      buildSourceSlideMap(deck1, source.extractedPaths),
      slideImages
    );
    await buildPptx(deck1, order.style, outPath, images1, await safeVisuals(deck1));
    await markDone(order.id, fileRel);

    // Достраиваем вариант 2, если сгенерировался («2 генерации за оплату»).
    const deck2 = await deck2Promise;
    if (deck2) {
      try {
        const fileName2 = buildFileName(order.email);
        const images2 = mergeSlideImages(
          buildSourceSlideMap(deck2, source.extractedPaths),
          slideImages
        );
        await buildPptx(
          deck2,
          order.style,
          path.join(dir, fileName2),
          images2,
          await safeVisuals(deck2)
        );
        secondUrl = `${env.APP_URL}/api/download/${fileName2}`;
      } catch (e) {
        console.warn("order variant 2 build failed, delivering single deck:", {
          orderId: order.id,
          error: getErrorMessage(e),
        });
      }
    }
  } catch (e) {
    await markError(order.id).catch(() => {});
    console.error("order generation failed; manual refund required:", {
      orderId: order.id,
      email: order.email,
      error: getErrorMessage(e),
    });
    return;
  }

  try {
    await sendDeckEmail(order.email, `${env.APP_URL}${fileRel}`, title, expiresAt, secondUrl, order);
  } catch (e) {
    console.error("order email delivery failed; manual resend required:", {
      orderId: order.id,
      email: order.email,
      error: getErrorMessage(e),
    });
  }
}
