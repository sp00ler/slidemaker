import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { parseOptionalText } from "@/lib/checkout-validation";
import { processOrder } from "@/lib/generate";
import { createRegenerationOrder } from "@/lib/orders";
import { MIN_SLIDES, STYLES, StyleId, TARIFFS } from "@/lib/tariffs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WISHES_LENGTH = 500;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const orderId = String(body.orderId || "").trim();
    const topic = String(body.topic || "").trim();
    const style = String(body.style || "") as StyleId;
    const slideCount = Number(body.slideCount);
    const wishesResult = parseOptionalText(body.wishes, MAX_WISHES_LENGTH, "Пожелания");

    if (!orderId) {
      return NextResponse.json({ error: "Не указан заказ" }, { status: 400 });
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
      slideCount > TARIFFS.standard.maxSlides
    ) {
      return NextResponse.json(
        { error: `Количество слайдов: от ${MIN_SLIDES} до ${TARIFFS.standard.maxSlides}` },
        { status: 400 }
      );
    }
    if (wishesResult.error) {
      return NextResponse.json({ error: wishesResult.error }, { status: 400 });
    }

    const order = await createRegenerationOrder({
      originalOrderId: orderId,
      userId: user.id,
      email: user.email,
      tariff: "standard",
      slideCount,
      topic,
      wishes: wishesResult.value,
      storyboard: null,
      style,
    });

    if (!order) {
      return NextResponse.json(
        { error: "Повторная генерация недоступна" },
        { status: 409 }
      );
    }

    processOrder(order).catch((err) =>
      console.error("background regeneration failed:", err)
    );

    return NextResponse.json({ ok: true, orderId: order.id });
  } catch (e) {
    console.error("regenerate error:", e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
