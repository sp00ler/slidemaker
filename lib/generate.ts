import path from "path";
import crypto from "crypto";
import { promises as fs } from "fs";
import { OrderRow, markAwaitingManual, markDone, markError } from "@/lib/orders";
import { generateDeck } from "@/lib/anthropic";
import { buildPptx } from "@/lib/pptx";
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

  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const deck = await generateDeck({
          topic: order.topic,
          style: order.style,
          slideCount: order.slide_count,
        });
        title = deck.title;

        await fs.mkdir(dir, { recursive: true });
        await buildPptx(deck, order.style, outPath);
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

    await markDone(order.id, fileRel);
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
    await sendDeckEmail(order.email, `${env.APP_URL}${fileRel}`, title, expiresAt);
  } catch (e) {
    console.error("order email delivery failed; manual resend required:", {
      orderId: order.id,
      email: order.email,
      error: getErrorMessage(e),
    });
  }
}
