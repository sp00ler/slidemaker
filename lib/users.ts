import { pool } from "@/lib/db";

export interface User {
  id: string;
  email: string;
  role: "user" | "admin";
  created_at: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function upsertUserByEmail(email: string): Promise<User> {
  const normalized = normalizeEmail(email);
  const { rows } = await pool.query<User>(
    `INSERT INTO users (email)
     VALUES ($1)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING *`,
    [normalized]
  );
  return rows[0];
}

export async function getUserById(id: string): Promise<User | null> {
  const { rows } = await pool.query<User>(`SELECT * FROM users WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const { rows } = await pool.query<User>(`SELECT * FROM users WHERE email = $1`, [
    normalizeEmail(email),
  ]);
  return rows[0] ?? null;
}

export async function countUserOrders(userId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM orders WHERE user_id = $1`,
    [userId]
  );
  return Number(rows[0]?.count ?? 0);
}
