export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { createSession, sessionCookieOptions } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkOrigin } from "@/lib/csrf";


export async function POST(req: NextRequest) {
  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  const allowed = await checkRateLimit(`login:${ip}`, 10, 900); // 10 attempts per 15 min
  if (!allowed) return NextResponse.json({ error: "Too many login attempts. Please try again later." }, { status: 429 });

  const { email, password } = await req.json() as { email?: string; password?: string };
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const db = await getDb();
  const user = await db
    .prepare("SELECT id, email, name, role, password_hash FROM users WHERE email = ?")
    .bind(email.toLowerCase())
    .first<{ id: string; email: string; name: string; role: string; password_hash: string }>();

  if (!user) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  // Account migrated from Firebase — password was never transferred
  if (user.password_hash === "__FIREBASE_MIGRATED__") {
    return NextResponse.json({
      error: "migrated",
      message: "Your account was recently migrated. Please use \"Forgot Password\" to set a new password before logging in.",
    }, { status: 401 });
  }

  if (!(await bcrypt.compare(password, user.password_hash))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  // Upgrade legacy low-cost hashes transparently (never downgrade)
  const rounds = bcrypt.getRounds(user.password_hash);
  if (rounds < 10) {
    const upgraded = await bcrypt.hash(password, 10);
    await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(upgraded, user.id).run();
  }

  const sessionId = await createSession(user.id);
  const opts = sessionCookieOptions(sessionId);
  const res = NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  res.cookies.set(opts);
  return res;
}
