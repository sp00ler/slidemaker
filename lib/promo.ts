import { pool } from "@/lib/db";

export type PromoRedeemResult = {
  redeemed: boolean;
  discountPercent: number;
};

// Атомарный «погас» промокода: только один вызов выиграет гонку
// (UPDATE ... WHERE used=false RETURNING). Защита от повторных кликов/запросов.
export async function redeemPromo(
  code: string,
  orderId: string
): Promise<PromoRedeemResult> {
  const { rows } = await pool.query<{ discount_percent: number }>(
    `UPDATE promo_codes
     SET used = true, used_at = now(), order_id = $2
     WHERE code = $1 AND used = false
     RETURNING discount_percent`,
    [code, orderId]
  );

  const discountPercent = rows[0]?.discount_percent;
  return {
    redeemed: typeof discountPercent === "number",
    discountPercent: discountPercent ?? 0,
  };
}