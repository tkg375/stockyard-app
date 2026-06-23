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

  const { consultationId, email } = await req.json() as any;
  if (!consultationId || !email) return NextResponse.json({ error: "consultationId and email required" }, { status: 400 });

  const db = await getDb();

  const consult = await db.prepare(
    "SELECT id, user_name, user_email, pet_name, pet_type, date, time, status FROM consultations WHERE id = ? AND user_email = ?"
  ).bind(consultationId, email).first() as any;

  if (!consult) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  if (consult.status === "cancelled") return NextResponse.json({ error: "Already cancelled" }, { status: 400 });

  await db.prepare("UPDATE consultations SET status = 'cancelled', updated_at = unixepoch() WHERE id = ?")
    .bind(consultationId).run();

  const { ctx } = await getCloudflareContext({ async: true });
  ctx.waitUntil(
    sendEmail({
      to: consult.user_email,
      subject: `Appointment Cancelled — ${formatDate(consult.date)}`,
      htmlBody: wrapInEmailTemplate(`
        <h2 style="color:#1a6a6a;margin:0 0 16px;">Appointment Cancelled</h2>
        <p>Hi ${consult.user_name}, your telehealth appointment has been cancelled.</p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
          <tr><td style="padding:8px 12px;background:#f0fafa;font-weight:600;color:#1a6a6a;width:40%;">Date</td>
              <td style="padding:8px 12px;background:#f7fdfd;">${formatDate(consult.date)}</td></tr>
          <tr><td style="padding:8px 12px;background:#f0fafa;font-weight:600;color:#1a6a6a;">Time</td>
              <td style="padding:8px 12px;background:#f7fdfd;">${formatTime(consult.time)}</td></tr>
          <tr><td style="padding:8px 12px;background:#f0fafa;font-weight:600;color:#1a6a6a;">Pet</td>
              <td style="padding:8px 12px;background:#f7fdfd;">${consult.pet_name}</td></tr>
        </table>
        <p style="color:#888;font-size:13px;">If you'd like to reschedule, just visit our website and chat with Hailey again.</p>
      `),
      textBody: `Hi ${consult.user_name}, your appointment on ${formatDate(consult.date)} at ${formatTime(consult.time)} has been cancelled.`,
    })
  );

  return NextResponse.json({ success: true });
}
