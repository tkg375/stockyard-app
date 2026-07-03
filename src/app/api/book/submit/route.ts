export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { checkOrigin } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rateLimit";
import { sendEmail, wrapInEmailTemplate } from "@/lib/email";
import { sendSMS } from "@/lib/sms";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { format, parse } from "date-fns";

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
  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "unknown";
  const allowed = await checkRateLimit(`book-submit:${ip}`, 5, 3600);
  if (!allowed) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });

  const body = await req.json() as {
    name?: string; email?: string; phone?: string;
    petName?: string; petType?: string; petBreed?: string; petDob?: string; petWeight?: number;
    petSex?: string; petSpayedNeutered?: boolean; petColor?: string;
    concern?: string; date?: string; time?: string;
    promoCode?: string; stripeCustomerId?: string; paymentIntentId?: string;
    pharmacyName?: string; pharmacyAddress?: string; pharmacyPhone?: string;
    agreements?: Record<string, boolean>;
    agreementsSignedAt?: number;
    smsConsent?: boolean;
  };

  if (!body.name || !body.email || !body.petName || !body.petType || !body.concern || !body.date || !body.time) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!body.petBreed?.trim() || !/[a-zA-Z]/.test(body.petBreed)) {
    return NextResponse.json({ error: "Please enter a valid pet breed" }, { status: 400 });
  }
  if (body.petWeight === undefined || body.petWeight === null || isNaN(Number(body.petWeight)) || Number(body.petWeight) <= 0) {
    return NextResponse.json({ error: "Please enter a valid pet weight" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  if (!/^\d{2}:\d{2}$/.test(body.time)) return NextResponse.json({ error: "Invalid time" }, { status: 400 });
  if (body.concern.length > 1000) return NextResponse.json({ error: "Concern must be under 1000 characters" }, { status: 400 });

  const agreements = body.agreements ?? {};
  if (!AGREEMENT_KEYS.every(k => agreements[k] === true)) {
    return NextResponse.json({ error: "All agreements must be accepted" }, { status: 400 });
  }

  // Validate appointment time is in the future
  const easternNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const appt = new Date(`${body.date}T${body.time}:00`);
  if (appt.getTime() - easternNow.getTime() <= 30 * 60 * 1000) {
    return NextResponse.json({ error: "Cannot book a time in the past." }, { status: 400 });
  }

  const db = await getDb();

  // Resolve promo
  let promoDiscount = 0;
  let promoType = "";
  let validatedPromoCode: string | null = null;
  if (body.promoCode) {
    const promo = await db.prepare("SELECT discount, type FROM promo_codes WHERE code = ? AND active = 1")
      .bind(body.promoCode.toUpperCase()).first<{ discount: number; type: string }>();
    if (promo) { promoDiscount = promo.discount; promoType = promo.type; validatedPromoCode = body.promoCode.toUpperCase(); }
  }

  const basePrice = 6000;
  let amountCents = basePrice;
  if (promoType === "percent") amountCents = Math.max(0, Math.round(basePrice * (1 - promoDiscount / 100)));
  else if (promoType === "fixed") amountCents = Math.max(0, basePrice - promoDiscount * 100);

  // Verify payment
  let stripePaymentIntentId: string | null = null;
  let cardLast4: string | null = null;
  const paymentStatus = amountCents > 0 ? "paid" : "free";

  if (amountCents > 0) {
    if (!body.paymentIntentId) return NextResponse.json({ error: "Payment required" }, { status: 400 });
    try {
      const intent = await getStripe().paymentIntents.retrieve(body.paymentIntentId);
      if (intent.status !== "succeeded") return NextResponse.json({ error: "Payment not completed." }, { status: 402 });
      if (intent.amount !== amountCents) return NextResponse.json({ error: "Payment amount mismatch." }, { status: 400 });

      // Prevent reuse
      const existing = await db.prepare("SELECT id FROM consultations WHERE stripe_payment_intent_id = ?")
        .bind(intent.id).first();
      if (existing) return NextResponse.json({ error: "This payment has already been used." }, { status: 400 });

      stripePaymentIntentId = intent.id;

      const pmId = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id;
      if (pmId) {
        try { const pm = await getStripe().paymentMethods.retrieve(pmId); cardLast4 = pm.card?.last4 ?? null; } catch {}
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Payment verification failed";
      return NextResponse.json({ error: msg }, { status: 402 });
    }
  }

  // Final slot check after payment
  const slotTaken = await db.prepare(
    "SELECT id FROM consultations WHERE date = ? AND time = ? AND status NOT IN ('cancelled')"
  ).bind(body.date, body.time).first();
  if (slotTaken) {
    if (stripePaymentIntentId) {
      try { await getStripe().refunds.create({ payment_intent: stripePaymentIntentId }); } catch {}
    }
    return NextResponse.json({ error: "This time slot was just booked. Please choose another time." }, { status: 409 });
  }

  const id = crypto.randomUUID();
  const guestToken = crypto.randomUUID();
  const phone = body.phone?.trim().replace(/\D/g, "") || null;
  const smsConsent = body.smsConsent === true ? 1 : 0;

  try {
    await db.prepare(`
      INSERT INTO consultations
        (id, user_id, user_name, user_email, user_phone, pet_name, pet_type, pet_breed, pet_dob, pet_weight,
         pet_sex, pet_spayed_neutered, pet_color,
         concern, date, time, status, payment_status, stripe_payment_intent_id, stripe_customer_id,
         amount_cents, promo_code, promo_discount, promo_type,
         agreements_json, agreements_signed_at, agreements_client_name,
         pharmacy_name, pharmacy_address, pharmacy_phone,
         sms_consent, is_guest, guest_token)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).bind(
      id, body.name, body.email, phone,
      body.petName, body.petType, body.petBreed ?? null, body.petDob ?? null, body.petWeight ?? null,
      body.petSex ?? null, body.petSpayedNeutered ? 1 : 0, body.petColor ?? null,
      body.concern, body.date, body.time,
      paymentStatus, stripePaymentIntentId, body.stripeCustomerId ?? null,
      amountCents, validatedPromoCode, promoDiscount || null, promoType || null,
      JSON.stringify(agreements), body.agreementsSignedAt ?? Math.floor(Date.now() / 1000),
      body.name,
      body.pharmacyName ?? null, body.pharmacyAddress ?? null, body.pharmacyPhone ?? null,
      smsConsent, guestToken
    ).run();
  } catch (dbErr) {
    if (stripePaymentIntentId) {
      try { await getStripe().refunds.create({ payment_intent: stripePaymentIntentId }); } catch {}
    }
    console.error("Consultation insert failed:", dbErr);
    return NextResponse.json({ error: "Booking failed. You have not been charged." }, { status: 500 });
  }

  // Fetch vet info and send notifications
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
    // Customer confirmation email
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
          ${amountCents > 0 ? `<tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;">Amount Charged</td><td style="padding:10px;background:#f8f8f8;">$${(amountCents / 100).toFixed(2)}${cardLast4 ? ` to card ending in ${cardLast4}` : ""}</td></tr>` : ""}
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
    // SMS to customer (only if they opted in)
    phone && smsConsent ? sendSMS(phone, `Stockyard Animal Health: ${body.petName}'s consultation is confirmed for ${fd} at ${ft} EST. We'll text you a join link closer to your appointment. Reply STOP to opt out.`) : Promise.resolve(false),
    // Vet notification email
    vetEmailVal ? sendEmail({
      to: vetEmailVal,
      subject: `New Booking (Guest) — ${body.petName} (${body.petType})`,
      htmlBody: wrapInEmailTemplate(`
        <h2 style="color:#1a6a6a;margin:0 0 16px;">New Guest Booking</h2>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;width:40%;">Customer</td><td style="padding:10px;background:#f8f8f8;">${h(body.name!)}</td></tr>
          <tr><td style="padding:10px;font-weight:bold;">Email</td><td style="padding:10px;">${h(body.email!)}</td></tr>
          <tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;">Phone</td><td style="padding:10px;background:#f8f8f8;">${body.phone ? h(body.phone) : "N/A"}</td></tr>
          <tr><td style="padding:10px;font-weight:bold;">Pet</td><td style="padding:10px;">${h(body.petName!)} (${h(body.petType!)})</td></tr>
          <tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;">Date</td><td style="padding:10px;background:#f8f8f8;">${h(fd)}</td></tr>
          <tr><td style="padding:10px;font-weight:bold;">Time</td><td style="padding:10px;">${h(ft)} EST</td></tr>
          <tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;">Concern</td><td style="padding:10px;background:#f8f8f8;">${h(body.concern!)}</td></tr>
        </table>
      `),
      textBody: `New guest booking:\n${body.name} | ${body.email} | ${body.phone ?? "N/A"}\nPet: ${body.petName} (${body.petType})\n${fd} at ${ft} EST\nConcern: ${body.concern}`,
    }) : Promise.resolve(false),
    // Vet SMS
    vetPhoneVal ? sendSMS(vetPhoneVal, `New guest booking: ${body.name} — ${body.petName} (${body.petType}) on ${body.date} at ${ft} EST`) : Promise.resolve(false),
  ]).then(() =>
    db.prepare(`UPDATE consultations SET notif_confirmation_sent = 1, notif_confirmation_sent_at = unixepoch(), updated_at = unixepoch() WHERE id = ?`).bind(id).run()
  ).catch(err => console.error("Notification failed for consultation", id, err)));

  return NextResponse.json({ id, guestToken }, { status: 201 });
}
