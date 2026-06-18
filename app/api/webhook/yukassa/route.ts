import { NextResponse } from "next/server";
import { getPayment } from "@/lib/yookassa";
import { claimForGeneration } from "@/lib/orders";
import { processOrder } from "@/lib/generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ЮКасса шлёт уведомление при смене статуса платежа.
// Тело не доверяем — перепроверяем статус через API по id платежа.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: true });

  try {
    const event: string | undefined = body?.event;
    const paymentId: string | undefined = body?.object?.id;

    if (event === "payment.succeeded" && paymentId) {
      const payment = await getPayment(paymentId);

      if (payment.status === "succeeded") {
        const orderId = payment.metadata?.order_id;
        if (orderId) {
          // Атомарный захват: переживёт повторные доставки вебхука.
          const order = await claimForGeneration(orderId);
          if (order) {
            // Генерация в фоне — сервер persistent (next start), отвечаем 200 сразу.
            processOrder(order).catch((err) =>
              console.error("background generation failed:", err)
            );
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    // Возвращаем 500 — ЮКасса повторит доставку позже.
    console.error("webhook error:", e);
    return NextResponse.json({ error: "retry" }, { status: 500 });
  }
}
