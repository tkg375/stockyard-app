export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { sendVideoLinkNotification } from "@/lib/notifications";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { checkOrigin } from "@/lib/csrf";
import { logCallEvent } from "@/lib/callLog";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const user = await getSessionFromRequest(req);
  if (!user || user.role !== "vet") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = await getDb();
  const row = await db.prepare("SELECT * FROM consultations WHERE id = ?").bind(id).first<{
    status: string; pet_name: string; user_email: string; user_phone: string | null;
    notif_video_link_sent: number; sms_consent: number | null; guest_token: string | null;
  }>();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.status === "in_progress") {
    await logCallEvent(db, { consultationId: id, role: "server", event: "start_called", detail: { alreadyInProgress: true } });
    return NextResponse.json({ ok: true, message: "Already in progress" });
  }

  await db.prepare(`UPDATE consultations SET status = 'in_progress', updated_at = unixepoch() WHERE id = ?`).bind(id).run();
  await logCallEvent(db, { consultationId: id, role: "server", event: "vet_started", detail: { willNotify: !row.notif_video_link_sent } });

  if (!row.notif_video_link_sent) {
    const joinUrl = row.guest_token
      ? `https://stockyardanimalhealth.com/guest-join?token=${encodeURIComponent(row.guest_token)}`
      : "https://stockyardanimalhealth.com/manage";
    const { ctx } = await getCloudflareContext({ async: true });
    ctx.waitUntil(
      sendVideoLinkNotification(id, {
        petName: row.pet_name,
        userEmail: row.user_email,
        userPhone: row.sms_consent ? (row.user_phone ?? undefined) : undefined,
        joinUrl,
      })
        .then((r) =>
          db.prepare(`UPDATE consultations SET notif_video_link_sent = 1, notif_video_link_sent_at = unixepoch() WHERE id = ?`).bind(id).run()
            .then(() => logCallEvent(db, { consultationId: id, role: "server", event: "notification_sent", detail: { email: r.email, sms: r.sms, smsConsent: !!row.sms_consent } }))
        )
        .catch((err) => logCallEvent(db, { consultationId: id, role: "server", event: "notification_failed", detail: { error: String(err) } }))
    );
  }

  return NextResponse.json({ ok: true });
}
