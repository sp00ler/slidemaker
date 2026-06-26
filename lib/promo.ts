import { pool } from "@/lib/db";

// Атомарный «погас» промокода: только один вызов выиграет гонку
// (UPDATE ... WHERE used=false RETURNING). Защита от повторных кликов/запросов.
// Возвращает true, если код существовал и был свободен (теперь сгорел).
export async function redeemPromo(code: string, orderId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE promo_codes
     SET used = true, used_at = now(), order_id = $2
     WHERE code = $1 AND used = false`,
    [code, orderId]
  );
  return (rowCount ?? 0) > 0;
}
