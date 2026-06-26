import { NextResponse } from "next/server";
import { TARIFFS, STYLES, MIN_SLIDES, Tariff, StyleId } from "@/lib/tariffs";
import { bindUploadFilesToOrder, createOrder, claimForGeneration } from "@/lib/orders";
import { createPayment } from "@/lib/yookassa";
import { processOrder } from "@/lib/generate";
import { redeemPromo } from "@/lib/promo";
import { env } from "@/lib/env";
import { parseOptionalText } from "@/lib/checkout-validation";
import { isUuid } from "@/lib/uploads";
import { upsertUserByEmail } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_WISHES_LENGTH = 2000;
const MAX_STORYBOARD_LENGTH = 1000;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const email = String(body.email || "").trim();
    const tariffId = String(body.tariff || "") as Tariff["id"];
    const style = String(body.style || "") as StyleId;
    const topic = String(body.topic || "").trim();
    const slideCount = Number(body.slideCount);
    const uploadToken = String(body.uploadToken || "").trim();
    const promo = String(body.promo || "").trim();
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
    if (tariff.manual && !wishesResult.value) {
      return NextResponse.json(
        { error: "Опишите задачу для авторской презентации" },
        { status: 400 }
      );
    }
    if (uploadToken && !isUuid(uploadToken)) {
      return NextResponse.json({ error: "Некорректный uploadToken" }, { status: 400 });
    }
    if (!STYLES[style]) {
      return NextResponse.json({ error: "Неверный стиль" }, { status: 400 });
    }
    if (!tariff.manual && (
      !Number.isInteger(slideCount) ||
      slideCount < MIN_SLIDES ||
      slideCount > tariff.maxSlides
    )) {
      return NextResponse.json(
        { error: `Количество слайдов: от ${MIN_SLIDES} до ${tariff.maxSlides}` },
        { status: 400 }
      );
    }
    const orderSlideCount = tariff.manual ? 0 : slideCount;

    const user = await upsertUserByEmail(email);
    const order = await createOrder({
      email: user.email,
      userId: user.id,
      tariff: tariffId,
      slideCount: orderSlideCount,
      topic,
      wishes: wishesResult.value,
      storyboard: storyboardResult.value,
      style,
    });

    if (uploadToken) {
      await bindUploadFilesToOrder(order.id, uploadToken);
    }

    // Тестовый промокод: одноразовый. Атомарно гасим код — если успешно,
    // обходим оплату и повторяем ветку успешного вебхука (claim + генерация
    // в фоне). Невалидный/использованный код — ошибка, оплату НЕ создаём.
    if (promo) {
      const ok = await redeemPromo(promo, order.id);
      if (!ok) {
        return NextResponse.json(
          { error: "Промокод недействителен или уже использован" },
          { status: 400 }
        );
      }
      const claimed = await claimForGeneration(order.id);
      if (claimed) {
        processOrder(claimed).catch((err) =>
          console.error("promo generation failed:", err)
        );
      }
      return NextResponse.json({
        confirmationUrl: `${env.APP_URL}/success?order=${order.id}`,
      });
    }

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
