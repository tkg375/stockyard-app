import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { checkOrigin } from "@/lib/csrf";

export const dynamic = "force-dynamic";

async function authorize(req: NextRequest, id: string) {
  const db = await getDb();
  const row = await db.prepare("SELECT user_id, is_guest FROM consultations WHERE id = ?").bind(id).first<{ user_id: string; is_guest: number }>();
  if (!row) return null;

  // Allow guest via token param or legacy cookie
  if (row.is_guest) {
    const guestToken = new URL(req.url).searchParams.get("guest_token");
    if (guestToken) {
      const match = await db.prepare("SELECT id FROM consultations WHERE id = ? AND guest_token = ?").bind(id, guestToken).first();
      if (match) return { user: { id: "guest", role: "customer", email: "", name: "Guest" }, db };
    } else {
      const cookie = req.headers.get("cookie") ?? "";
      const cookieMatch = cookie.match(/__Host-guest=([^;]+)/);
      if (cookieMatch && cookieMatch[1].split(":")[0] === id) return { user: { id: "guest", role: "customer", email: "", name: "Guest" }, db };
    }
  }

  const user = await getSessionFromRequest(req);
  if (!user) return null;
  if (user.role !== "vet" && row.user_id !== user.id) return null;
  return { user, db };
}

// GET /api/consultations/[id]/signal?keys=offer,answer,ice_vet,ice_customer
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(req, id);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const VALID_SIGNAL_KEYS = ["offer", "answer", "ice_vet", "ice_customer", "video_rotation", "ready_vet", "ready_customer", "lobby_vet", "lobby_customer", "bye"];
  const keys = (req.nextUrl.searchParams.get("keys")?.split(",") ?? VALID_SIGNAL_KEYS)
    .filter(k => VALID_SIGNAL_KEYS.includes(k));
  if (!keys.length) return NextResponse.json({});
  const placeholders = keys.map(() => "?").join(",");
  const rows = await auth.db
    .prepare(`SELECT key, data, updated_at FROM webrtc_signals WHERE consultation_id = ? AND key IN (${placeholders})`)
    .bind(id, ...keys)
    .all<{ key: string; data: string; updated_at: number }>();

  // Lobby presence is only valid if heartbeated within the last LOBBY_FRESH_SECONDS.
  // This prevents a stale "I'm Ready" signal from a prior/abandoned session from
  // causing the other party to false-join into an empty call. We use the DB's own
  // updated_at (unixepoch) so there is a single authoritative clock — client device
  // clocks can differ by minutes and cannot be trusted for this comparison.
  const LOBBY_KEYS = new Set(["lobby_vet", "lobby_customer"]);
  const LOBBY_FRESH_SECONDS = 10;
  const nowSec = Math.floor(Date.now() / 1000);

  const result: Record<string, unknown> = {};
  for (const row of rows.results) {
    if (LOBBY_KEYS.has(row.key) && nowSec - row.updated_at > LOBBY_FRESH_SECONDS) {
      continue; // stale lobby presence — treat as absent
    }
    try { result[row.key] = JSON.parse(row.data); } catch { result[row.key] = row.data; }
  }
  return NextResponse.json(result);
}

// POST /api/consultations/[id]/signal  body: { key, data }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const auth = await authorize(req, id);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { key, data } = await req.json() as { key: string; data: unknown };
  // Role-scoped: each side may only write its own signal keys, so a guest
  // can't post an offer or impersonate vet lobby presence (and vice versa).
  const SHARED_KEYS = ["video_rotation", "bye"];
  const VALID_KEYS = new Set(
    auth.user.role === "vet"
      ? ["offer", "ice_vet", "ready_vet", "lobby_vet", ...SHARED_KEYS]
      : ["answer", "ice_customer", "ready_customer", "lobby_customer", ...SHARED_KEYS]
  );
  if (!key || !VALID_KEYS.has(key)) return NextResponse.json({ error: "Invalid signal key" }, { status: 400 });
  if (data === undefined) return NextResponse.json({ error: "Missing data" }, { status: 400 });
  if (JSON.stringify(data).length > 65536) return NextResponse.json({ error: "Signal data too large" }, { status: 413 });

  await auth.db
    .prepare(`INSERT INTO webrtc_signals (consultation_id, key, data, updated_at)
              VALUES (?, ?, ?, unixepoch())
              ON CONFLICT (consultation_id, key) DO UPDATE SET data = excluded.data, updated_at = unixepoch()`)
    .bind(id, key, JSON.stringify(data))
    .run();

  return NextResponse.json({ ok: true });
}

// DELETE /api/consultations/[id]/signal             — wipe all signals (call ended)
// DELETE /api/consultations/[id]/signal?keys=a,b,c  — wipe only the listed signal keys
//   (used to clear stale negotiation debris before a fresh session, preserving lobby_*)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const auth = await authorize(req, id);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // The vet owns session lifecycle (pre-session wipe, reconnect wipe) and may
  // delete any key; the customer may only delete its own rows so it can't
  // destroy the vet's live offer/ICE mid-negotiation.
  const VALID_SIGNAL_KEYS = auth.user.role === "vet"
    ? ["offer", "answer", "ice_vet", "ice_customer", "video_rotation", "ready_vet", "ready_customer", "lobby_vet", "lobby_customer", "bye"]
    : ["answer", "ice_customer", "ready_customer", "lobby_customer"];
  const keysParam = req.nextUrl.searchParams.get("keys");

  if (keysParam) {
    const keys = keysParam.split(",").filter(k => VALID_SIGNAL_KEYS.includes(k));
    if (keys.length) {
      const placeholders = keys.map(() => "?").join(",");
      await auth.db.prepare(`DELETE FROM webrtc_signals WHERE consultation_id = ? AND key IN (${placeholders})`).bind(id, ...keys).run();
    }
  } else if (auth.user.role === "vet") {
    await auth.db.prepare("DELETE FROM webrtc_signals WHERE consultation_id = ?").bind(id).run();
  } else {
    const placeholders = VALID_SIGNAL_KEYS.map(() => "?").join(",");
    await auth.db.prepare(`DELETE FROM webrtc_signals WHERE consultation_id = ? AND key IN (${placeholders})`).bind(id, ...VALID_SIGNAL_KEYS).run();
  }
  return NextResponse.json({ ok: true });
}
