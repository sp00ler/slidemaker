import path from "path";
import crypto from "crypto";
import { promises as fs } from "fs";
import {
  OrderRow,
  getOrderFiles,
  markAwaitingManual,
  markDone,
  markError,
} from "@/lib/orders";
import { generateDeck, type Deck } from "@/lib/anthropic";
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
    const slideImages = new Map(
      (await getOrderFiles(order.id)).map((file) => [
        file.slide_number,
        { path: file.stored_path, description: file.description },
      ])
    );

    // Вариант 2 запускаем сразу — параллельно варианту 1 (best-effort).
    const deck2Promise = generateDeck({
      ...baseParams,
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
        deck1 = await generateDeck(baseParams);
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
    await buildPptx(deck1, order.style, outPath, slideImages, await safeVisuals(deck1));
    await markDone(order.id, fileRel);

    // Достраиваем вариант 2, если сгенерировался («2 генерации за оплату»).
    const deck2 = await deck2Promise;
    if (deck2) {
      try {
        const fileName2 = buildFileName(order.email);
        await buildPptx(
          deck2,
          order.style,
          path.join(dir, fileName2),
          slideImages,
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
    await sendDeckEmail(order.email, `${env.APP_URL}${fileRel}`, title, expiresAt, secondUrl);
  } catch (e) {
    console.error("order email delivery failed; manual resend required:", {
      orderId: order.id,
      email: order.email,
      error: getErrorMessage(e),
    });
  }
}
