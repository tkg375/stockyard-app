import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sendEmail, wrapInEmailTemplate } from "@/lib/email";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

function formatDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}
function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"} EST`;
}

export async function POST(req: NextRequest) {
  // Verify Hailey API key
  const apiKey = req.headers.get("x-hailey-api-key");
  if (!apiKey || apiKey !== process.env.HAILEY_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name, email, phone, petName, petType, concern, date, time, agreedKeys, agreedAt } = await req.json() as any;
    const preSignedAgreements = Array.isArray(agreedKeys) && agreedKeys.length > 0;

    if (!name || !email || !petName || !concern || !date || !time) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Validate date/time
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      return NextResponse.json({ error: "Invalid date or time format" }, { status: 400 });
    }

    const db = await getDb();

    // Check slot availability
    const taken = await db.prepare(
      "SELECT id FROM consultations WHERE date = ? AND time = ? AND status NOT IN ('cancelled')"
    ).bind(date, time).first();
    if (taken) {
      return NextResponse.json({ error: "That time slot is no longer available." }, { status: 409 });
    }

    const id = crypto.randomUUID();
    const guestToken = crypto.randomUUID();

    await db.prepare(`
      INSERT INTO consultations
        (id, user_id, user_name, user_email, user_phone, pet_name, pet_type, concern,
         date, time, status, payment_status, amount_cents, is_guest, guest_token,
         agreements_json, created_at, updated_at)
      VALUES (?, 'guest', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'guest', 0, 1, ?,
              ?, unixepoch(), unixepoch())
    `).bind(
      id, name, email, phone ?? null, petName, petType ?? "Other", concern, date, time,
      preSignedAgreements ? 'confirmed' : 'pending_agreements',
      guestToken,
      preSignedAgreements ? JSON.stringify({ keys: agreedKeys, signedAt: agreedAt }) : '{}'
    ).run();

    const joinUrl = `https://stockyardanimalhealth.com/guest-join?token=${guestToken}`;
    const fd = formatDate(date);
    const ft = formatTime(time);

    // Get vet settings for confirmation email to vet
    const vetName = await db.prepare("SELECT value FROM settings WHERE key = 'vet_name'").first<{ value: string }>();
    const vetEmail = await db.prepare("SELECT value FROM settings WHERE key = 'vet_email'").first<{ value: string }>();

    const { ctx } = await getCloudflareContext({ async: true });
    ctx.waitUntil(Promise.all([
      // Email to guest
      sendEmail({
        to: email,
        subject: `Your Stockyard Telehealth Appointment is Confirmed — ${fd}`,
        htmlBody: wrapInEmailTemplate(`
          <h2 style="color:#1a6a6a;margin:0 0 16px;">Appointment Confirmed! 🎉</h2>
          <p style="color:#333;margin:0 0 12px;">Hi ${name}, your telehealth appointment has been scheduled.</p>
          <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
            <tr><td style="padding:8px 12px;background:#f0fafa;font-weight:600;color:#1a6a6a;border-radius:6px 0 0 6px;width:40%;">Date</td>
                <td style="padding:8px 12px;background:#f7fdfd;color:#333;">${fd}</td></tr>
            <tr><td style="padding:8px 12px;background:#f0fafa;font-weight:600;color:#1a6a6a;">Time</td>
                <td style="padding:8px 12px;background:#f7fdfd;color:#333;">${ft}</td></tr>
            <tr><td style="padding:8px 12px;background:#f0fafa;font-weight:600;color:#1a6a6a;">Pet</td>
                <td style="padding:8px 12px;background:#f7fdfd;color:#333;">${petName} (${petType ?? ""})</td></tr>
            <tr><td style="padding:8px 12px;background:#f0fafa;font-weight:600;color:#1a6a6a;">Concern</td>
                <td style="padding:8px 12px;background:#f7fdfd;color:#333;">${concern}</td></tr>
          </table>
          ${preSignedAgreements
            ? `<p style="color:#333;margin:0 0 20px;">You're all set! Use the button below to join your video call at your scheduled time.</p>
               <div style="text-align:center;margin:28px 0;">
                 <a href="${joinUrl}" style="background:linear-gradient(135deg,#1a6a6a,#5BC4C4);color:white;padding:16px 40px;text-decoration:none;border-radius:8px;font-size:18px;font-weight:bold;display:inline-block;">Join Your Video Call →</a>
               </div>
               <p style="color:#888;font-size:13px;margin:0;">Save this email — this is your unique link to join the call at ${ft}.</p>`
            : `<p style="color:#333;margin:0 0 20px;"><strong>One more step:</strong> Before your call you must review and sign our telehealth consent forms. This only takes a minute.</p>
               <div style="text-align:center;margin:28px 0;">
                 <a href="${joinUrl}" style="background:linear-gradient(135deg,#1a6a6a,#5BC4C4);color:white;padding:16px 40px;text-decoration:none;border-radius:8px;font-size:18px;font-weight:bold;display:inline-block;">Review &amp; Sign Consent Forms →</a>
               </div>
               <p style="color:#888;font-size:13px;margin:0;">This link is unique to your appointment. Keep your email handy — you'll use it to join your call.</p>`
          }
        `),
        textBody: `Hi ${name},\n\nYour telehealth appointment is confirmed for ${fd} at ${ft}.\nPet: ${petName}\nConcern: ${concern}\n\nBefore your call, please sign the required consent forms here:\n${joinUrl}\n\nSee you then!\nStockyard Animal Health`,
      }),
      // Email to vet
      vetEmail?.value ? sendEmail({
        to: vetEmail.value,
        subject: `New Guest Booking — ${petName} (${petType}) — ${fd} at ${ft}`,
        htmlBody: wrapInEmailTemplate(`
          <h2 style="color:#1a6a6a;margin:0 0 16px;">New Guest Booking via Hailey AI</h2>
          <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
            <tr><td style="padding:8px 12px;background:#f0fafa;font-weight:600;color:#1a6a6a;width:40%;">Client</td>
                <td style="padding:8px 12px;background:#f7fdfd;">${name}</td></tr>
            <tr><td style="padding:8px 12px;background:#f0fafa;font-weight:600;color:#1a6a6a;">Email</td>
                <td style="padding:8px 12px;background:#f7fdfd;">${email}</td></tr>
            <tr><td style="padding:8px 12px;background:#f0fafa;font-weight:600;color:#1a6a6a;">Phone</td>
                <td style="padding:8px 12px;background:#f7fdfd;">${phone ?? "N/A"}</td></tr>
            <tr><td style="padding:8px 12px;background:#f0fafa;font-weight:600;color:#1a6a6a;">Pet</td>
                <td style="padding:8px 12px;background:#f7fdfd;">${petName} (${petType ?? ""})</td></tr>
            <tr><td style="padding:8px 12px;background:#f0fafa;font-weight:600;color:#1a6a6a;">Date</td>
                <td style="padding:8px 12px;background:#f7fdfd;">${fd} at ${ft}</td></tr>
            <tr><td style="padding:8px 12px;background:#f0fafa;font-weight:600;color:#1a6a6a;">Concern</td>
                <td style="padding:8px 12px;background:#f7fdfd;">${concern}</td></tr>
            <tr><td style="padding:8px 12px;background:#f0fafa;font-weight:600;color:${preSignedAgreements ? '#059669' : '#ea580c'};">Status</td>
                <td style="padding:8px 12px;background:#f7fdfd;color:${preSignedAgreements ? '#059669' : '#ea580c'};font-weight:600;">${preSignedAgreements ? 'Confirmed — agreements signed via Hailey' : 'Awaiting consent forms'}</td></tr>
          </table>
          <div style="text-align:center;margin:28px 0;">
            <a href="https://stockyardanimalhealth.com/vet-dashboard" style="background-color:#1a6a6a;color:white;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">View Vet Dashboard →</a>
          </div>
        `),
        textBody: `New guest booking via Hailey AI.\nClient: ${name} | ${email} | ${phone ?? "N/A"}\nPet: ${petName} (${petType ?? ""})\n${fd} at ${ft}\nConcern: ${concern}\nStatus: ${preSignedAgreements ? 'Confirmed — agreements signed via Hailey' : 'Awaiting consent forms'}`,
      }) : Promise.resolve(),
    ]));

    return NextResponse.json({ consultationId: id, guestToken }, { status: 201 });
  } catch (err: any) {
    console.error("[guest booking]", err);
    return NextResponse.json({ error: err?.message ?? "Booking failed" }, { status: 500 });
  }
}
