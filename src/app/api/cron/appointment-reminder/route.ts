import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sendAppointmentNotifications, sendOverdueReminderToVet, type OverdueConsultation } from "@/lib/notifications";
import { formatInTimeZone } from "date-fns-tz";

export const dynamic = "force-dynamic";

const EST_TZ = "America/New_York";

// Called by Cloudflare Cron every minute (configured in wrangler.jsonc)
// Also callable via GET with a secret header for manual triggering
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!secret || secret.length < 32) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const enc = new TextEncoder();
  const a = enc.encode(secret);
  const b = enc.encode(provided);
  // Constant-time comparison to prevent timing attacks
  let mismatch = a.length !== b.length ? 1 : 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) mismatch |= a[i] ^ b[i];
  if (mismatch !== 0) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  // nowDate/nowTime used for overdue detection (actual current time)
  const nowDate = formatInTimeZone(now, EST_TZ, "yyyy-MM-dd");
  const nowTime = formatInTimeZone(now, EST_TZ, "HH:mm");
  // reminderDate/reminderTime used for the 15-min early reminder lookup
  const reminderTarget = new Date(now.getTime() + 15 * 60 * 1000);
  const currentDate = formatInTimeZone(reminderTarget, EST_TZ, "yyyy-MM-dd");
  const currentTime = formatInTimeZone(reminderTarget, EST_TZ, "HH:mm");

  const db = await getDb();

  const rows = await db
    .prepare(`
      SELECT * FROM consultations
      WHERE date = ? AND time = ?
        AND status NOT IN ('cancelled', 'completed')
        AND notif_reminder_sent = 0
    `)
    .bind(currentDate, currentTime)
    .all<{
      id: string; user_name: string; user_email: string; user_phone: string | null;
      pet_name: string; pet_type: string; concern: string; date: string; time: string;
      is_guest: number | null; guest_token: string | null; sms_consent: number | null;
    }>();

  // Get vet settings once (needed for both reminder types)
  const vetName = await db.prepare("SELECT value FROM settings WHERE key = 'vet_name'").first<{ value: string }>();
  const vetEmail = await db.prepare("SELECT value FROM settings WHERE key = 'vet_email'").first<{ value: string }>();
  const vetPhone = await db.prepare("SELECT value FROM settings WHERE key = 'vet_phone'").first<{ value: string }>();
  const vetSmsOptIn = await db.prepare("SELECT value FROM settings WHERE key = 'vet_sms_opt_in'").first<{ value: string }>();
  const vet = {
    name: vetName?.value ?? "Dr. McMillen",
    email: vetEmail?.value ?? "",
    phone: vetSmsOptIn?.value === "1" ? (vetPhone?.value ?? "") : "",
  };

  let notified = 0;
  for (const row of rows.results) {
    try {
      const joinUrl = row.is_guest && row.guest_token
        ? `https://stockyardanimalhealth.com/guest-join?token=${row.guest_token}`
        : undefined;

      await sendAppointmentNotifications({
        petName: row.pet_name, petType: row.pet_type, concern: row.concern,
        date: row.date, time: row.time,
        userName: row.user_name, userEmail: row.user_email,
        userPhone: row.sms_consent ? (row.user_phone ?? undefined) : undefined,
        joinUrl,
      }, vet);

      await db.prepare(`
        UPDATE consultations SET
          notif_reminder_sent = 1,
          notif_reminder_sent_at = unixepoch(),
          updated_at = unixepoch()
        WHERE id = ?
      `).bind(row.id).run();

      notified++;
    } catch {}
  }

  // ── Overdue reminders (once per day per consultation) ──────────────────────
  // An appointment is overdue if it's in the past and still pending/in_progress.
  // We resend daily: last sent timestamp must be older than start-of-today (EST).
  // Start of today in EST as unix seconds — used to detect if we've already sent today
  const todayStartEst = new Date(
    formatInTimeZone(now, EST_TZ, "yyyy-MM-dd'T'00:00:00xxx")
  ).getTime() / 1000;

  const overdueRows = await db
    .prepare(`
      SELECT c.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone
      FROM consultations c
      JOIN users u ON u.id = c.user_id
      WHERE (c.date < ? OR (c.date = ? AND c.time < ?))
        AND c.status NOT IN ('cancelled', 'completed')
        AND (c.notif_overdue_last_sent IS NULL OR c.notif_overdue_last_sent < ?)
    `)
    .bind(nowDate, nowDate, nowTime, todayStartEst)
    .all<OverdueConsultation & { id: string }>();

  if (overdueRows.results.length) {
    try {
      await sendOverdueReminderToVet(overdueRows.results, vet);
      const nowUnix = Math.floor(now.getTime() / 1000);
      for (const row of overdueRows.results) {
        await db
          .prepare("UPDATE consultations SET notif_overdue_last_sent = ?, updated_at = unixepoch() WHERE id = ?")
          .bind(nowUnix, row.id)
          .run();
      }
    } catch {}
  }

  return NextResponse.json({ checked: true, notified, overdueReminded: overdueRows.results.length });
}
