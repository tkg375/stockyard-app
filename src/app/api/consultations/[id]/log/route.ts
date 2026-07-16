import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { checkOrigin } from "@/lib/csrf";
import { logCallEvent } from "@/lib/callLog";
import { sendCallTroubleNotification } from "@/lib/notifications";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Fatal camera/device errors — worth telling the vet about so she doesn't
// think the call itself is broken when it's actually a client-side permission issue.
const NOTIFIABLE_ERROR_CODES = new Set(["camera_denied", "no_camera", "camera_in_use", "not_supported", "media_error"]);

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

  if (role === "customer" && body.event === "error") {
    const detail = body.detail as { code?: unknown; message?: unknown } | undefined;
    const code = typeof detail?.code === "string" ? detail.code : "";
    const message = typeof detail?.message === "string" ? detail.message : "";
    if (NOTIFIABLE_ERROR_CODES.has(code)) {
      await notifyVetOfCallTrouble(auth.db, id, code, message);
    }
  }

  return NextResponse.json({ ok: true });
}

// Emails the vet once per (consultation, error code) the first time the customer
// hits a fatal camera/mic error, so she knows it's a client-side permission issue
// rather than the platform being broken. Throttled via 'trouble_notified' marker
// rows keyed by code — repeats of the *same* issue don't re-notify, but if the
// customer hits a *different* error (e.g. no_camera after fixing camera_denied),
// that's still worth flagging separately.
async function notifyVetOfCallTrouble(
  db: Awaited<ReturnType<typeof getDb>>,
  consultationId: string,
  code: string,
  message: string
): Promise<void> {
  const priorCodes = await db
    .prepare("SELECT detail FROM call_logs WHERE consultation_id = ? AND role = 'server' AND event = 'trouble_notified'")
    .bind(consultationId)
    .all<{ detail: string | null }>();
  const alreadyNotified = (priorCodes.results ?? []).some((r) => {
    try { return JSON.parse(r.detail ?? "{}")?.code === code; } catch { return false; }
  });
  if (alreadyNotified) return;

  const row = await db.prepare("SELECT pet_name, user_name FROM consultations WHERE id = ?").bind(consultationId)
    .first<{ pet_name: string; user_name: string }>();
  if (!row) return;

  const vetEmail = await db.prepare("SELECT value FROM settings WHERE key = 'vet_email'").first<{ value: string }>();
  if (!vetEmail?.value) return;

  const { ctx } = await getCloudflareContext({ async: true });
  ctx.waitUntil(
    sendCallTroubleNotification({
      toEmail: vetEmail.value,
      consultationId,
      petName: row.pet_name,
      userName: row.user_name,
      errorCode: code,
      errorMessage: message,
    })
      .then((ok) =>
        ok
          ? logCallEvent(db, { consultationId, role: "server", event: "trouble_notified", detail: { code } })
          : logCallEvent(db, { consultationId, role: "server", event: "trouble_notify_failed", detail: { code } })
      )
      .catch((err) => logCallEvent(db, { consultationId, role: "server", event: "trouble_notify_failed", detail: { code, error: String(err) } }))
  );
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
