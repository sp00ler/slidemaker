import { NextResponse } from "next/server";
import { createLoginToken, hasRecentLoginToken } from "@/lib/auth";
import { env } from "@/lib/env";
import { sendLoginEmail } from "@/lib/mailer";
import { upsertUserByEmail } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const OK_RESPONSE = {
  ok: true,
  message: "Если email есть в системе, письмо отправлено.",
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim();

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(OK_RESPONSE);
  }

  try {
    const user = await upsertUserByEmail(email);
    if (!(await hasRecentLoginToken(user.id))) {
      const token = await createLoginToken(user.id);
      await sendLoginEmail(user.email, `${env.APP_URL}/login/verify?token=${token}`);
    }
  } catch (e) {
    console.error("login request error:", e);
  }

  return NextResponse.json(OK_RESPONSE);
}
