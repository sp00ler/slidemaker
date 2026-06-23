import { pool } from "@/lib/db";

export type OrderStatus =
  | "pending"
  | "generating"
  | "awaiting_manual"
  | "done"
  | "error";

export interface OrderRow {
  id: string;
  email: string;
  tariff: string;
  slide_count: number;
  topic: string;
  wishes: string | null;
  storyboard: string | null;
  style: string;
  status: OrderStatus;
  file_path: string | null;
  created_at: string;
}

export async function createOrder(data: {
  email: string;
  tariff: string;
  slideCount: number;
  topic: string;
  wishes: string | null;
  storyboard: string | null;
  style: string;
}): Promise<OrderRow> {
  const { rows } = await pool.query<OrderRow>(
    `INSERT INTO orders (email, tariff, slide_count, topic, wishes, storyboard, style, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
     RETURNING *`,
    [
      data.email,
      data.tariff,
      data.slideCount,
      data.topic,
      data.wishes,
      data.storyboard,
      data.style,
    ]
  );
  return rows[0];
}

export async function getOrder(id: string): Promise<OrderRow | null> {
  const { rows } = await pool.query<OrderRow>(
    `SELECT * FROM orders WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

// Атомарный «захват» заказа для генерации: только один вызов получит строку
// (защита от повторных вебхуков ЮКассы).
export async function claimForGeneration(id: string): Promise<OrderRow | null> {
  const { rows } = await pool.query<OrderRow>(
    `UPDATE orders SET status = 'generating'
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [id]
  );
  return rows[0] ?? null;
}

export async function markDone(id: string, filePath: string): Promise<void> {
  await pool.query(
    `UPDATE orders SET status = 'done', file_path = $2 WHERE id = $1`,
    [id, filePath]
  );
}

export async function markAwaitingManual(id: string): Promise<void> {
  await pool.query(`UPDATE orders SET status = 'awaiting_manual' WHERE id = $1`, [id]);
}

export async function markError(id: string): Promise<void> {
  await pool.query(`UPDATE orders SET status = 'error' WHERE id = $1`, [id]);
}

export async function bindUploadFilesToOrder(
  orderId: string,
  uploadToken: string
): Promise<void> {
  await pool.query(
    `UPDATE order_files SET order_id = $1
     WHERE upload_token = $2 AND order_id IS NULL`,
    [orderId, uploadToken]
  );
}

export async function getOrderFiles(
  orderId: string
): Promise<Array<{ slide_number: number; stored_path: string; description: string | null }>> {
  const { rows } = await pool.query<{
    slide_number: number;
    stored_path: string;
    description: string | null;
  }>(
    `SELECT slide_number, stored_path, description
     FROM order_files
     WHERE order_id = $1 AND kind = 'slide'
     ORDER BY slide_number ASC`,
    [orderId]
  );
  return rows;
}

// История 1: путь к исходной работе (.docx), если она прикреплена к заказу.
export async function getOrderSource(
  orderId: string
): Promise<{ stored_path: string } | null> {
  const { rows } = await pool.query<{ stored_path: string }>(
    `SELECT stored_path FROM order_files
     WHERE order_id = $1 AND kind = 'source'
     LIMIT 1`,
    [orderId]
  );
  return rows[0] ?? null;
}
