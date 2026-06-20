import { NextResponse } from "next/server";
import { TARIFFS, STYLES, MIN_SLIDES, Tariff, StyleId } from "@/lib/tariffs";
import { createOrder } from "@/lib/orders";
import { createPayment } from "@/lib/yookassa";
import { env } from "@/lib/env";
import { parseOptionalText } from "@/lib/checkout-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_WISHES_LENGTH = 500;
const MAX_STORYBOARD_LENGTH = 1000;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const email = String(body.email || "").trim();
    const tariffId = String(body.tariff || "") as Tariff["id"];
    const style = String(body.style || "") as StyleId;
    const topic = String(body.topic || "").trim();
    const slideCount = Number(body.slideCount);
    const wishesResult = parseOptionalText(body.wishes, MAX_WISHES_LENGTH, "Пожелания");
    const storyboardResult = parseOptionalText(
      body.storyboard,
      MAX_STORYBOARD_LENGTH,
      "Сториборд"
    );

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
    if (wishesResult.error) {
      return NextResponse.json({ error: wishesResult.error }, { status: 400 });
    }
    if (storyboardResult.error) {
      return NextResponse.json({ error: storyboardResult.error }, { status: 400 });
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
      wishes: wishesResult.value,
      storyboard: storyboardResult.value,
      style,
    });

    const { confirmationUrl } = await createPayment({
      orderId: order.id,
      amountRub: tariff.price,
      description: `Презентация: ${topic.slice(0, 100)}`,
      returnUrl: `${env.APP_URL}/success?order=${order.id}`,
      email,
    });

    return NextResponse.json({ confirmationUrl });
  } catch (e) {
    console.error("checkout error:", e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
