export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getSessionIdFromRequest, deleteSession, clearCookieOptions } from "@/lib/auth";
import { checkOrigin } from "@/lib/csrf";


export async function POST(req: NextRequest) {
  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sessionId = getSessionIdFromRequest(req);
  if (sessionId) await deleteSession(sessionId);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(clearCookieOptions());
  return res;
}
