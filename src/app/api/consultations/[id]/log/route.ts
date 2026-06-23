import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { checkOrigin } from "@/lib/csrf";
import { logCallEvent } from "@/lib/callLog";

export const dynamic = "force-dynamic";

// Verify the caller may act on this consultation (guest via token/cookie, or vet/owner).
// Returns the resolved role, or null if unauthorized.
async function authorizeRole(req: NextRequest, id: string): Promise<{ role: "vet" | "customer"; db: Awaited<ReturnType<typeof getDb>> } | null> {
  const db = await getDb();
  const row = await db.prepare("SELECT user_id, is_guest FROM consultations WHERE id = ?").bind(id).first<{ user_id: string; is_guest: number }>();
  if (!row) return null;

  if (row.is_guest) {
    const guestToken = new URL(req.url).searchParams.get("guest_token");
    if (guestToken) {
      const match = await db.prepare("SELECT id FROM consultations WHERE id = ? AND guest_token = ?").bind(id, guestToken).first();
      if (match) return { role: "customer", db };
    } else {
      const cookie = req.headers.get("cookie") ?? "";
      const cookieMatch = cookie.match(/__Host-guest=([^;]+)/);
      if (cookieMatch && cookieMatch[1].split(":")[0] === id) return { role: "customer", db };
    }
  }

  const user = await getSessionFromRequest(req);
  if (!user) return null;
  if (user.role === "vet") return { role: "vet", db };
  if (row.user_id === user.id) return { role: "customer", db };
  return null;
}

// POST /api/consultations/[id]/log   body: { role, event, detail? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const auth = await authorizeRole(req, id);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { role?: string; event?: string; detail?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad body" }, { status: 400 }); }
  if (!body.event || typeof body.event !== "string") return NextResponse.json({ error: "Missing event" }, { status: 400 });

  // Trust the server-resolved role over whatever the client claims, but keep 'server' out.
  const role = auth.role;

  await logCallEvent(auth.db, {
    consultationId: id,
    role,
    event: body.event,
    detail: body.detail,
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true });
}

// GET /api/consultations/[id]/log   — vet-only: view recent diagnostic events for a call
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionFromRequest(req);
  if (!user || user.role !== "vet") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "200", 10) || 200, 1000);
  const rows = await db
    .prepare("SELECT role, event, detail, user_agent, created_at FROM call_logs WHERE consultation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?")
    .bind(id, limit)
    .all();

  return NextResponse.json({ logs: rows.results ?? [] });
}
