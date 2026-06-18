import { NextResponse } from "next/server";
import { TARIFFS, STYLES, MIN_SLIDES, Tariff, StyleId } from "@/lib/tariffs";
import { createOrder } from "@/lib/orders";
import { createPayment } from "@/lib/yookassa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const email = String(body.email || "").trim();
    const tariffId = String(body.tariff || "") as Tariff["id"];
    const style = String(body.style || "") as StyleId;
    const topic = String(body.topic || "").trim();
    const slideCount = Number(body.slideCount);

    const tariff = TARIFFS[tariffId];
    if (!tariff) {
      return NextResponse.json({ error: "Неверный тариф" }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Неверный email" }, { status: 400 });
    }
    if (topic.length < 3 || topic.length > 300) {
      return NextResponse.json(
        { error: "Тема должна быть от 3 до 300 символов" },
        { status: 400 }
      );
    }
    if (!STYLES[style]) {
      return NextResponse.json({ error: "Неверный стиль" }, { status: 400 });
    }
    if (
      !Number.isInteger(slideCount) ||
      slideCount < MIN_SLIDES ||
      slideCount > tariff.maxSlides
    ) {
      return NextResponse.json(
        { error: `Количество слайдов: от ${MIN_SLIDES} до ${tariff.maxSlides}` },
        { status: 400 }
      );
    }

    const order = await createOrder({
      email,
      tariff: tariffId,
      slideCount,
      topic,
      style,
    });

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const { confirmationUrl } = await createPayment({
      orderId: order.id,
      amountRub: tariff.price,
      description: `Презентация: ${topic.slice(0, 100)}`,
      returnUrl: `${appUrl}/success?order=${order.id}`,
      email,
    });

    return NextResponse.json({ confirmationUrl });
  } catch (e) {
    console.error("checkout error:", e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
