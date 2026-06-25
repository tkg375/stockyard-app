export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { sendEmail, wrapInEmailTemplate } from "@/lib/email";
import { sendSMS } from "@/lib/sms";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { format, parse } from "date-fns";

const HAILEY_API_KEY = process.env.HAILEY_WEBHOOK_SECRET ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "https://hailey.tgordo03.workers.dev",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-hailey-api-key",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

function fmtDate(d: string) {
  try { return format(parse(d, "yyyy-MM-dd", new Date()), "EEEE, MMMM d, yyyy"); } catch { return d; }
}
function fmtTime(t: string) {
  try { return format(parse(t, "HH:mm", new Date()), "h:mm a"); } catch { return t; }
}
function h(s: string) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

const AGREEMENT_KEYS = ["telehealth","vcpr","emergency","terms","privacy","records","controlled","jurisdiction","prescription"];

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-hailey-api-key");
  if (!HAILEY_API_KEY || key !== HAILEY_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }

  try {
    const body = await req.json() as {
      name?: string; email?: string; phone?: string;
      petName?: string; petType?: string; petBreed?: string; petDob?: string;
      petWeight?: number | string; petSex?: string; petSpayedNeutered?: boolean | string;
      petColor?: string; concern?: string; date?: string; time?: string;
      pharmacyName?: string; pharmacyAddress?: string; pharmacyPhone?: string;
      paymentIntentId?: string; stripeCustomerId?: string;
      agreedKeys?: string[]; agreedAt?: number;
      smsConsent?: boolean;
    };

    if (!body.name || !body.email || !body.petName || !body.petType || !body.concern || !body.date || !body.time) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400, headers: CORS });
    }

    // Validate all agreements were accepted
    const accepted = new Set(body.agreedKeys ?? []);
    if (!AGREEMENT_KEYS.every(k => accepted.has(k))) {
      return NextResponse.json({ error: "All agreements must be accepted" }, { status: 400, headers: CORS });
    }

    // Verify payment
    if (!body.paymentIntentId) {
      return NextResponse.json({ error: "Payment required" }, { status: 400, headers: CORS });
    }

    const stripe = getStripe();
    let cardLast4: string | null = null;
    let stripePaymentIntentId: string | null = null;

    try {
      const intent = await stripe.paymentIntents.retrieve(body.paymentIntentId);
      if (intent.status !== "succeeded") {
        return NextResponse.json({ error: "Payment not completed" }, { status: 402, headers: CORS });
      }

      const db = await getDb();
      const existing = await db.prepare("SELECT id FROM consultations WHERE stripe_payment_intent_id = ?")
        .bind(intent.id).first();
      if (existing) {
        return NextResponse.json({ error: "This payment has already been used" }, { status: 400, headers: CORS });
      }

      stripePaymentIntentId = intent.id;
      const pmId = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id;
      if (pmId) {
        try { const pm = await stripe.paymentMethods.retrieve(pmId); cardLast4 = pm.card?.last4 ?? null; } catch {}
      }
    } catch (err: any) {
      return NextResponse.json({ error: err?.message ?? "Payment verification failed" }, { status: 402, headers: CORS });
    }

    const db = await getDb();

    // Check slot still available
    const slotTaken = await db.prepare(
      "SELECT id FROM consultations WHERE date = ? AND time = ? AND status NOT IN ('cancelled')"
    ).bind(body.date, body.time).first();
    if (slotTaken) {
      if (stripePaymentIntentId) {
        try { await stripe.refunds.create({ payment_intent: stripePaymentIntentId }); } catch {}
      }
      return NextResponse.json({ error: "This time slot was just booked. Please choose another time." }, { status: 409, headers: CORS });
    }

    const id = crypto.randomUUID();
    const guestToken = crypto.randomUUID();
    const phone = body.phone?.replace(/\D/g, "") || null;
    const smsConsent = body.smsConsent === true ? 1 : 0;
    const petSpayedNeutered = body.petSpayedNeutered === true || body.petSpayedNeutered === "Yes" || body.petSpayedNeutered === "yes" ? 1 : 0;
    const petWeight = body.petWeight ? Number(body.petWeight) : null;

    const agreements: Record<string, boolean> = {};
    AGREEMENT_KEYS.forEach(k => { agreements[k] = accepted.has(k); });

    await db.prepare(`
      INSERT INTO consultations
        (id, user_id, user_name, user_email, user_phone, pet_name, pet_type, pet_breed, pet_dob, pet_weight,
         pet_sex, pet_spayed_neutered, pet_color,
         concern, date, time, status, payment_status, stripe_payment_intent_id, stripe_customer_id,
         amount_cents, agreements_json, agreements_signed_at, agreements_client_name,
         pharmacy_name, pharmacy_address, pharmacy_phone,
         sms_consent, is_guest, guest_token)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'paid', ?, ?, 6000, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).bind(
      id, body.name, body.email, phone,
      body.petName, body.petType, body.petBreed ?? null, body.petDob ?? null, petWeight,
      body.petSex ?? null, petSpayedNeutered, body.petColor ?? null,
      body.concern, body.date, body.time,
      stripePaymentIntentId, body.stripeCustomerId ?? null,
      JSON.stringify(agreements), body.agreedAt ?? Math.floor(Date.now() / 1000),
      body.name,
      body.pharmacyName ?? null, body.pharmacyAddress ?? null, body.pharmacyPhone ?? null,
      smsConsent, guestToken
    ).run();

    // Send notifications
    const [vetName, vetEmail, vetPhone, vetSmsOptIn] = await Promise.all([
      db.prepare("SELECT value FROM settings WHERE key = 'vet_name'").first<{ value: string }>(),
      db.prepare("SELECT value FROM settings WHERE key = 'vet_email'").first<{ value: string }>(),
      db.prepare("SELECT value FROM settings WHERE key = 'vet_phone'").first<{ value: string }>(),
      db.prepare("SELECT value FROM settings WHERE key = 'vet_sms_opt_in'").first<{ value: string }>(),
    ]);

    const joinUrl = `https://stockyardanimalhealth.com/guest-join?token=${guestToken}`;
    const fd = fmtDate(body.date);
    const ft = fmtTime(body.time);
    const vetNameVal = vetName?.value ?? "Dr. McMillen";
    const vetEmailVal = vetEmail?.value ?? "";
    const vetPhoneVal = vetSmsOptIn?.value === "1" ? (vetPhone?.value ?? "") : "";

    const { ctx } = await getCloudflareContext({ async: true });
    ctx.waitUntil(Promise.all([
      sendEmail({
        to: body.email,
        subject: `Consultation Confirmed — ${body.petName} with ${vetNameVal}`,
        htmlBody: wrapInEmailTemplate(`
          <h2 style="color:#1a6a6a;margin:0 0 16px;">Consultation Confirmed!</h2>
          <p style="color:#333;margin:0 0 12px;">Hi ${h(body.name!)}, your appointment is booked. Here are your details:</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;width:40%;">Pet</td><td style="padding:10px;background:#f8f8f8;">${h(body.petName!)} (${h(body.petType!)})</td></tr>
            <tr><td style="padding:10px;font-weight:bold;">Date</td><td style="padding:10px;">${h(fd)}</td></tr>
            <tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;">Time</td><td style="padding:10px;background:#f8f8f8;">${h(ft)} EST</td></tr>
            <tr><td style="padding:10px;font-weight:bold;">Concern</td><td style="padding:10px;">${h(body.concern!)}</td></tr>
            <tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;">Amount Charged</td><td style="padding:10px;background:#f8f8f8;">$60.00${cardLast4 ? ` to card ending in ${cardLast4}` : ""}</td></tr>
          </table>
          <div style="text-align:center;margin:28px 0;">
            <p style="color:#555;margin:0 0 16px;">At your appointment time, use this link to join your video call with ${h(vetNameVal)}:</p>
            <a href="${joinUrl}" style="background:linear-gradient(135deg,#1a6a6a,#5BC4C4);color:white;padding:16px 40px;text-decoration:none;border-radius:8px;font-size:18px;font-weight:bold;display:inline-block;">
              Join My Appointment →
            </a>
          </div>
          <p style="font-size:0.85rem;color:#888;text-align:center;">Save this email — your join link is unique to you.</p>
        `),
        textBody: `Hi ${body.name},\n\nYour consultation is confirmed!\nPet: ${body.petName} (${body.petType})\nDate: ${fd} at ${ft} EST\nConcern: ${body.concern}\n\nJoin link: ${joinUrl}\n\nSave this email — your link is unique to you.`,
      }),
      phone && smsConsent ? sendSMS(phone, `Stockyard Animal Health: ${body.petName}'s consultation is confirmed for ${fd} at ${ft} EST. We'll text you a join link closer to your appointment. Reply STOP to opt out.`) : Promise.resolve(false),
      vetEmailVal ? sendEmail({
        to: vetEmailVal,
        subject: `New Booking (via Hailey) — ${body.petName} (${body.petType})`,
        htmlBody: wrapInEmailTemplate(`
          <h2 style="color:#1a6a6a;margin:0 0 16px;">New Booking via Hailey AI</h2>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;width:40%;">Customer</td><td style="padding:10px;background:#f8f8f8;">${h(body.name!)}</td></tr>
            <tr><td style="padding:10px;font-weight:bold;">Email</td><td style="padding:10px;">${h(body.email!)}</td></tr>
            <tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;">Phone</td><td style="padding:10px;background:#f8f8f8;">${phone ? h(phone) : "N/A"}</td></tr>
            <tr><td style="padding:10px;font-weight:bold;">Pet</td><td style="padding:10px;">${h(body.petName!)} (${h(body.petType!)})</td></tr>
            <tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;">Date</td><td style="padding:10px;background:#f8f8f8;">${h(fd)}</td></tr>
            <tr><td style="padding:10px;font-weight:bold;">Time</td><td style="padding:10px;">${h(ft)} EST</td></tr>
            <tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;">Concern</td><td style="padding:10px;background:#f8f8f8;">${h(body.concern!)}</td></tr>
          </table>
        `),
        textBody: `New Hailey booking:\n${body.name} | ${body.email} | ${phone ?? "N/A"}\nPet: ${body.petName} (${body.petType})\n${fd} at ${ft} EST\nConcern: ${body.concern}`,
      }) : Promise.resolve(false),
      vetPhoneVal ? sendSMS(vetPhoneVal, `New Hailey booking: ${body.name} — ${body.petName} (${body.petType}) on ${body.date} at ${ft} EST`) : Promise.resolve(false),
    ]).then(() =>
      db.prepare(`UPDATE consultations SET notif_confirmation_sent = 1, notif_confirmation_sent_at = unixepoch(), updated_at = unixepoch() WHERE id = ?`).bind(id).run()
    ).catch(err => console.error("[hailey/book] Notification failed for consultation", id, err)));

    return NextResponse.json({ success: true, id, guestToken, joinUrl }, { headers: CORS });
  } catch (err: any) {
    console.error("[hailey/book]", err);
    return NextResponse.json({ error: err?.message ?? "Booking failed" }, { status: 500, headers: CORS });
  }
}
