import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sendEmail, wrapInEmailTemplate } from "@/lib/email";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

function formatDate(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}
function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"} EST`;
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-hailey-api-key");
  if (!apiKey || apiKey !== process.env.HAILEY_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { consultationId, email, date, time } = await req.json() as any;
  if (!consultationId || !email || !date || !time) {
    return NextResponse.json({ error: "consultationId, email, date, and time required" }, { status: 400 });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: "Invalid date or time format" }, { status: 400 });
  }

  const db = await getDb();

  const consult = await db.prepare(
    "SELECT id, user_name, user_email, pet_name, pet_type, concern, guest_token, status FROM consultations WHERE id = ? AND user_email = ?"
  ).bind(consultationId, email).first() as any;

  if (!consult) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  if (consult.status === "cancelled") return NextResponse.json({ error: "Cannot reschedule a cancelled appointment" }, { status: 400 });

  // Check new slot availability
  const taken = await db.prepare(
    "SELECT id FROM consultations WHERE date = ? AND time = ? AND id != ? AND status NOT IN ('cancelled')"
  ).bind(date, time, consultationId).first();
  if (taken) return NextResponse.json({ error: "That time slot is not available." }, { status: 409 });

  await db.prepare(
    "UPDATE consultations SET date = ?, time = ?, status = 'confirmed', updated_at = unixepoch() WHERE id = ?"
  ).bind(date, time, consultationId).run();

  const joinUrl = `https://stockyardanimalhealth.com/guest-join?token=${consult.guest_token}`;
  const { ctx } = await getCloudflareContext({ async: true });
  ctx.waitUntil(
    sendEmail({
      to: consult.user_email,
      subject: `Appointment Rescheduled — ${formatDate(date)}`,
      htmlBody: wrapInEmailTemplate(`
        <h2 style="color:#1a6a6a;margin:0 0 16px;">Appointment Rescheduled ✅</h2>
        <p>Hi ${consult.user_name}, your telehealth appointment has been moved to a new time.</p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
          <tr><td style="padding:8px 12px;background:#f0fafa;font-weight:600;color:#1a6a6a;width:40%;">New Date</td>
              <td style="padding:8px 12px;background:#f7fdfd;">${formatDate(date)}</td></tr>
          <tr><td style="padding:8px 12px;background:#f0fafa;font-weight:600;color:#1a6a6a;">New Time</td>
              <td style="padding:8px 12px;background:#f7fdfd;">${formatTime(time)}</td></tr>
          <tr><td style="padding:8px 12px;background:#f0fafa;font-weight:600;color:#1a6a6a;">Pet</td>
              <td style="padding:8px 12px;background:#f7fdfd;">${consult.pet_name}</td></tr>
        </table>
        <div style="text-align:center;margin:28px 0;">
          <a href="${joinUrl}" style="background:linear-gradient(135deg,#1a6a6a,#5BC4C4);color:white;padding:16px 40px;text-decoration:none;border-radius:8px;font-size:18px;font-weight:bold;display:inline-block;">Join Your Video Call →</a>
        </div>
        <p style="color:#888;font-size:13px;">Your original join link still works for the new time.</p>
      `),
      textBody: `Hi ${consult.user_name}, your appointment has been rescheduled to ${formatDate(date)} at ${formatTime(time)}. Join link: ${joinUrl}`,
    })
  );

  return NextResponse.json({ success: true, date, time });
}
