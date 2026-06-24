import { redirect } from "next/navigation";
import { consumeLoginToken, createSession, setSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  const userId = token ? await consumeLoginToken(token) : null;

  if (!userId) {
    redirect("/login?error=expired");
  }

  const sessionId = await createSession(userId);
  setSessionCookie(sessionId);
  redirect("/account");
}
