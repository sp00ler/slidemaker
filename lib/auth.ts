import crypto from "crypto";
import { cookies } from "next/headers";
import { pool } from "@/lib/db";
import { getUserById, type User } from "@/lib/users";

export const SESSION_COOKIE = "sm_session";
const LOGIN_TOKEN_TTL_MS = 30 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type SessionRow = {
  id: string;
  user_id: string;
  expires_at: string;
  created_at: string;
};

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export async function createLoginToken(userId: string): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  await pool.query(
    `INSERT INTO login_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, hashToken(rawToken), new Date(Date.now() + LOGIN_TOKEN_TTL_MS)]
  );
  return rawToken;
}

export async function hasRecentLoginToken(userId: string): Promise<boolean> {
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM login_tokens
       WHERE user_id = $1 AND created_at > now() - interval '60 seconds'
     ) AS "exists"`,
    [userId]
  );
  return Boolean(rows[0]?.exists);
}

export async function consumeLoginToken(rawToken: string): Promise<string | null> {
  const { rows } = await pool.query<{ id: string; user_id: string }>(
    `UPDATE login_tokens
     SET used_at = now()
     WHERE used_at IS NULL
       AND id = (
         SELECT id FROM login_tokens
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
         ORDER BY created_at ASC
         LIMIT 1
       )
     RETURNING id, user_id`,
    [hashToken(rawToken)]
  );
  return rows[0]?.user_id ?? null;
}

export async function createSession(userId: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO sessions (user_id, expires_at)
     VALUES ($1, $2)
     RETURNING id`,
    [userId, new Date(Date.now() + SESSION_TTL_MS)]
  );
  return rows[0].id;
}

export async function getSession(sessionId: string): Promise<SessionRow | null> {
  const { rows } = await pool.query<SessionRow>(
    `SELECT * FROM sessions WHERE id = $1 AND expires_at > now()`,
    [sessionId]
  );
  return rows[0] ?? null;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await pool.query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
}

export function setSessionCookie(sessionId: string): void {
  cookies().set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(): void {
  cookies().set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getCurrentUser(): Promise<User | null> {
  const sessionId = cookies().get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;
  const session = await getSession(sessionId);
  if (!session) return null;
  return getUserById(session.user_id);
}
