import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { parseOptionalText } from "@/lib/checkout-validation";
import { processOrder } from "@/lib/generate";
import { bindUploadFilesToOrder, createRegenerationOrder } from "@/lib/orders";
import { isUuid } from "@/lib/uploads";
import { MIN_SLIDES, STYLES, StyleId, TARIFFS } from "@/lib/tariffs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WISHES_LENGTH = 500;
const MAX_STORYBOARD_LENGTH = 1000;

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
    const uploadToken = String(body.uploadToken || "").trim();
    const wishesResult = parseOptionalText(body.wishes, MAX_WISHES_LENGTH, "Пожелания");
    const storyboardResult = parseOptionalText(
      body.storyboard,
      MAX_STORYBOARD_LENGTH,
      "Сценарий"
    );

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
    if (storyboardResult.error) {
      return NextResponse.json({ error: storyboardResult.error }, { status: 400 });
    }
    if (uploadToken && !isUuid(uploadToken)) {
      return NextResponse.json({ error: "Некорректный uploadToken" }, { status: 400 });
    }

    const order = await createRegenerationOrder({
      originalOrderId: orderId,
      userId: user.id,
      email: user.email,
      tariff: "standard",
      slideCount,
      topic,
      wishes: wishesResult.value,
      storyboard: storyboardResult.value,
      style,
    });

    if (!order) {
      return NextResponse.json(
        { error: "Повторная генерация недоступна" },
        { status: 409 }
      );
    }

    // Привязываем загруженный .docx/картинки к новому заказу до генерации.
    if (uploadToken) {
      await bindUploadFilesToOrder(order.id, uploadToken);
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
