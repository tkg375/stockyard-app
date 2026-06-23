import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sendEmail, wrapInEmailTemplate } from "@/lib/email";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

function formatDate(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
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

  try {
    const { email } = await req.json() as { email: string };
    if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

    const db = await getDb();
    // Find most recent upcoming guest consultation for this email
    const row = await db.prepare(`
      SELECT id, user_name, user_email, pet_name, pet_type, concern, date, time, guest_token, status
      FROM consultations
      WHERE user_email = ? AND is_guest = 1 AND status NOT IN ('cancelled', 'completed')
      ORDER BY date DESC, time DESC LIMIT 1
    `).bind(email).first<any>();

    if (!row) return NextResponse.json({ error: "No active guest booking found for that email." }, { status: 404 });

    const joinUrl = `https://stockyardanimalhealth.com/guest-join?token=${row.guest_token}`;
    const fd = formatDate(row.date);
    const ft = formatTime(row.time);

    const { ctx } = await getCloudflareContext({ async: true });
    ctx.waitUntil(sendEmail({
      to: row.user_email,
      subject: `Your Stockyard Telehealth Link — ${fd}`,
      htmlBody: wrapInEmailTemplate(`
        <h2 style="color:#1a6a6a;margin:0 0 16px;">Here's your appointment link! 🔗</h2>
        <p style="color:#333;margin:0 0 12px;">Hi ${row.user_name}, here is your link to join your telehealth appointment:</p>
        <div style="background:#f0fafa;border-radius:10px;padding:14px 18px;margin:0 0 20px;">
          <strong>${fd} at ${ft}</strong><br>
          <span style="color:#555;">${row.pet_name} · ${row.concern}</span>
        </div>
        <div style="text-align:center;margin:28px 0;">
          <a href="${joinUrl}" style="background:linear-gradient(135deg,#1a6a6a,#5BC4C4);color:white;padding:16px 40px;text-decoration:none;border-radius:8px;font-size:18px;font-weight:bold;display:inline-block;">
            ${row.status === "pending_agreements" ? "Sign Consent Forms & Join →" : "Join My Appointment →"}
          </a>
        </div>
      `),
      textBody: `Hi ${row.user_name},\n\nHere is your appointment link:\n${joinUrl}\n\n${fd} at ${ft}\nPet: ${row.pet_name}\nConcern: ${row.concern}`,
    }));

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Error" }, { status: 500 });
  }
}
