import path from "path";
import { promises as fs } from "fs";
import { OrderRow, markDone, markError } from "@/lib/orders";
import { generateDeck } from "@/lib/anthropic";
import { buildPptx } from "@/lib/pptx";
import { sendDeckEmail } from "@/lib/mailer";
import { env } from "@/lib/env";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Полный цикл: текст → JSON структура → .pptx → запись в БД → письмо.
export async function processOrder(order: OrderRow): Promise<void> {
  const dir = path.join(process.cwd(), "public", "downloads");
  const fileRel = `/downloads/${order.id}.pptx`;
  const outPath = path.join(dir, `${order.id}.pptx`);
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
    await sendDeckEmail(order.email, `${env.APP_URL}${fileRel}`, title);
  } catch (e) {
    console.error("order email delivery failed; manual resend required:", {
      orderId: order.id,
      email: order.email,
      error: getErrorMessage(e),
    });
  }
}
