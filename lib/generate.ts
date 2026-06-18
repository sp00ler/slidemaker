import path from "path";
import { promises as fs } from "fs";
import { OrderRow, markDone, markError } from "@/lib/orders";
import { generateDeck } from "@/lib/anthropic";
import { buildPptx } from "@/lib/pptx";
import { sendDeckEmail } from "@/lib/mailer";
import { env } from "@/lib/env";

// Полный цикл: текст → JSON структура → .pptx → запись в БД → письмо.
export async function processOrder(order: OrderRow): Promise<void> {
  try {
    const deck = await generateDeck({
      topic: order.topic,
      style: order.style,
      slideCount: order.slide_count,
    });

    const dir = path.join(process.cwd(), "public", "downloads");
    await fs.mkdir(dir, { recursive: true });

    const fileRel = `/downloads/${order.id}.pptx`;
    const outPath = path.join(dir, `${order.id}.pptx`);
    await buildPptx(deck, order.style, outPath);

    await markDone(order.id, fileRel);

    await sendDeckEmail(order.email, `${env.APP_URL}${fileRel}`, deck.title);
  } catch (e) {
    console.error(`processOrder(${order.id}) failed:`, e);
    await markError(order.id).catch(() => {});
    throw e;
  }
}
