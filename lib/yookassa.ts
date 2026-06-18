import { randomUUID } from "crypto";
import { env } from "@/lib/env";

const BASE = "https://api.yookassa.ru/v3";

function authHeader(): string {
  const id = env.YUKASSA_SHOP_ID;
  const key = env.YUKASSA_SECRET_KEY;
  return "Basic " + Buffer.from(`${id}:${key}`).toString("base64");
}

export interface YooPayment {
  id: string;
  status: string; // pending | waiting_for_capture | succeeded | canceled
  paid: boolean;
  amount: { value: string; currency: string };
  metadata?: Record<string, string>;
  confirmation?: { type: string; confirmation_url?: string };
}

export async function createPayment(params: {
  orderId: string;
  amountRub: number;
  description: string;
  returnUrl: string;
  email: string;
}): Promise<{ id: string; confirmationUrl: string }> {
  const res = await fetch(`${BASE}/payments`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Idempotence-Key": randomUUID(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: { value: params.amountRub.toFixed(2), currency: "RUB" },
      capture: true,
      confirmation: { type: "redirect", return_url: params.returnUrl },
      description: params.description,
      metadata: { order_id: params.orderId },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YooKassa createPayment ${res.status}: ${body}`);
  }

  const data = (await res.json()) as YooPayment;
  const url = data.confirmation?.confirmation_url;
  if (!url) throw new Error("YooKassa: нет confirmation_url в ответе");
  return { id: data.id, confirmationUrl: url };
}

export async function getPayment(id: string): Promise<YooPayment> {
  const res = await fetch(`${BASE}/payments/${id}`, {
    headers: { Authorization: authHeader() },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YooKassa getPayment ${res.status}: ${body}`);
  }
  return (await res.json()) as YooPayment;
}
