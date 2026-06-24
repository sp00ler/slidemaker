import { NextResponse } from "next/server";
import { clearSessionCookie, deleteSession, SESSION_COOKIE } from "@/lib/auth";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const sessionId = cookies().get(SESSION_COOKIE)?.value;
  if (sessionId) {
    await deleteSession(sessionId).catch(() => {});
  }
  clearSessionCookie();
  return NextResponse.json({ ok: true });
}
