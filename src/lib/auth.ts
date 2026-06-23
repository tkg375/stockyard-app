import { cookies } from "next/headers";
import { getDb } from "./db";

// __Host- prefix forces browser to only send cookie over HTTPS to the exact host (no subdomain sharing)
const SESSION_COOKIE = "__Host-session";
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const db = await getDb();
  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > unixepoch()`
    )
    .bind(sessionId)
    .first<SessionUser>();

  return row ?? null;
}

export async function createSession(userId: string): Promise<string> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL;
  await db
    .prepare(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`)
    .bind(id, userId, expiresAt)
    .run();
  return id;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const db = await getDb();
  await db.prepare(`DELETE FROM sessions WHERE id = ?`).bind(sessionId).run();
}

export async function deleteAllUserSessions(userId: string): Promise<void> {
  const db = await getDb();
  await db.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(userId).run();
}

export function sessionCookieOptions(sessionId: string) {
  return {
    name: SESSION_COOKIE,
    value: sessionId,
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL,
  };
}

export function clearCookieOptions() {
  return {
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}

export function getSessionIdFromRequest(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ?? null;
}

export async function getSessionFromRequest(request: Request): Promise<SessionUser | null> {
  const sessionId = getSessionIdFromRequest(request);
  if (!sessionId) return null;

  const db = await getDb();
  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > unixepoch()`
    )
    .bind(sessionId)
    .first<SessionUser>();

  return row ?? null;
}
