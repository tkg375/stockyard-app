import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { sendConfirmationNotifications } from "@/lib/notifications";
import { getStripe } from "@/lib/stripe";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { checkOrigin } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  const rows = user.role === "vet"
    ? await db.prepare(`
        SELECT c.*,
          (SELECT COUNT(*) FROM messages m WHERE m.consultation_id = c.id AND m.read_by_vet = 0 AND m.sender_type = 'customer') AS unread_messages
        FROM consultations c ORDER BY c.date DESC, c.time DESC LIMIT 100
      `).all()
    : await db.prepare(`
        SELECT c.*,
          (SELECT COUNT(*) FROM messages m WHERE m.consultation_id = c.id AND m.read_by_customer = 0 AND m.sender_type = 'vet') AS unread_messages
        FROM consultations c WHERE c.user_id = ? ORDER BY c.date DESC, c.time DESC
      `).bind(user.id).all();

  return NextResponse.json({ consultations: rows.results });
}

export async function POST(req: NextRequest) {
  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const user = await getSessionFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    petId?: string;
    concern?: string;
    date?: string;
    time?: string;
    promoCode?: string;
    paymentIntentId?: string;
    agreements?: Record<string, boolean>;
    agreementsSignedAt?: number;
    agreementsClientName?: string;
    pharmacyName?: string | null;
    pharmacyAddress?: string | null;
    pharmacyPhone?: string | null;
    pharmacyFax?: string | null;
    pharmacyEmail?: string | null;
  };

  if (!body.petId || !body.concern || !body.date || !body.time) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Validate all agreements are accepted
  const requiredAgreements = ["telehealth","vcpr","emergency","terms","privacy","records","controlled","jurisdiction","prescription"];
  const agreements = body.agreements ?? {};
  if (!requiredAgreements.every((k) => agreements[k] === true)) {
    return NextResponse.json({ error: "All agreements must be accepted before booking." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  if (!/^\d{2}:\d{2}$/.test(body.time)) return NextResponse.json({ error: "Invalid time format" }, { status: 400 });

  // Reject bookings in the past (dates/times are Eastern)
  const now = new Date();
  const easternNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const appointment = new Date(`${body.date}T${body.time}:00`);
  if (appointment.getTime() - easternNow.getTime() <= 30 * 60 * 1000) {
    return NextResponse.json({ error: "Cannot book a time in the past." }, { status: 400 });
  }
  if (body.concern.length > 1000) {
    return NextResponse.json({ error: "Concern must be 1000 characters or fewer" }, { status: 400 });
  }
  if (body.promoCode && body.promoCode.length > 50) return NextResponse.json({ error: "Invalid promo code" }, { status: 400 });

  // Rate limit bookings per user to prevent calendar spam
  const bookingAllowed = await checkRateLimit(`book:${user.id}`, 10, 3600);
  if (!bookingAllowed) return NextResponse.json({ error: "Too many bookings. Please try again later." }, { status: 429 });

  const db = await getDb();

  // Look up pet
  const pet = await db.prepare("SELECT id, name, type FROM pets WHERE id = ? AND user_id = ?")
    .bind(body.petId, user.id)
    .first<{ id: string; name: string; type: string }>();
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  // Look up user phone
  const userRow = await db.prepare("SELECT phone, stripe_customer_id FROM users WHERE id = ?")
    .bind(user.id)
    .first<{ phone: string | null; stripe_customer_id: string | null }>();

  // Validate promo code if provided
  let promoDiscount = 0;
  let promoType = "";
  let validatedPromoCode: string | null = null;

  if (body.promoCode) {
    const promo = await db.prepare("SELECT discount, type FROM promo_codes WHERE code = ? AND active = 1")
      .bind(body.promoCode.toUpperCase())
      .first<{ discount: number; type: string }>();
    if (promo && (promo.type === "percent" || promo.type === "fixed")) {
      promoDiscount = promo.discount;
      promoType = promo.type;
      validatedPromoCode = body.promoCode.toUpperCase();
    }
  }

  // Calculate final price
  const basePrice = 6000; // $60.00 in cents
  let amountCents = basePrice;
  if (promoType === "percent") {
    amountCents = Math.max(0, Math.round(basePrice * (1 - promoDiscount / 100)));
  } else if (promoType === "fixed") {
    amountCents = Math.max(0, basePrice - promoDiscount * 100);
  }

  // Verify payment
  let stripePaymentIntentId: string | null = null;
  let stripeCustomerId = userRow?.stripe_customer_id ?? null;
  let paymentStatus = "paid";
  let cardLast4: string | null = null;

  if (amountCents > 0) {
    if (!body.paymentIntentId) {
      return NextResponse.json({ error: "Payment required" }, { status: 400 });
    }
    try {
      const intent = await getStripe().paymentIntents.retrieve(body.paymentIntentId);
      if (intent.status !== "succeeded") {
        return NextResponse.json({ error: "Payment not completed. Please try again." }, { status: 402 });
      }
      // Verify amount matches to prevent tampering
      if (intent.amount !== amountCents) {
        return NextResponse.json({ error: "Payment amount mismatch." }, { status: 400 });
      }
      // Verify the payment intent belongs to this user's Stripe customer — both must be present and match
      const intentCustomer = typeof intent.customer === "string" ? intent.customer : intent.customer?.id;
      if (!intentCustomer || !stripeCustomerId || intentCustomer !== stripeCustomerId) {
        return NextResponse.json({ error: "Payment verification failed." }, { status: 400 });
      }
      // Prevent reuse: check no existing consultation has already claimed this payment intent
      const existing = await db.prepare("SELECT id FROM consultations WHERE stripe_payment_intent_id = ?")
        .bind(intent.id).first();
      if (existing) {
        return NextResponse.json({ error: "This payment has already been used." }, { status: 400 });
      }
      stripePaymentIntentId = intent.id;
      stripeCustomerId = intentCustomer;

      // Fetch card last4 for the receipt email
      const pmId = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id;
      if (pmId) {
        try {
          const pm = await getStripe().paymentMethods.retrieve(pmId);
          cardLast4 = pm.card?.last4 ?? null;
        } catch { /* non-critical */ }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Payment verification failed";
      return NextResponse.json({ error: msg }, { status: 402 });
    }
  }

  // Re-verify slot availability after payment — refund immediately if slot was taken in the race window
  const slotTaken = await db.prepare(
    "SELECT id FROM consultations WHERE date = ? AND time = ? AND status NOT IN ('cancelled')"
  ).bind(body.date, body.time).first();
  if (slotTaken) {
    if (stripePaymentIntentId) {
      try { await getStripe().refunds.create({ payment_intent: stripePaymentIntentId }); } catch { /* best-effort */ }
    }
    return NextResponse.json({ error: "This time slot was just booked by someone else. Please choose another time." }, { status: 409 });
  }

  // Create consultation record
  const id = crypto.randomUUID();
  try {
    await db.prepare(`
      INSERT INTO consultations
        (id, user_id, user_name, user_email, user_phone, pet_id, pet_name, pet_type, concern,
         date, time, status, payment_status, stripe_customer_id, stripe_payment_intent_id,
         amount_cents, promo_code, promo_discount, promo_type,
         agreements_json, agreements_signed_at, agreements_client_name,
         pharmacy_name, pharmacy_address, pharmacy_phone, pharmacy_fax, pharmacy_email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, user.id, user.name, user.email, userRow?.phone ?? null,
      pet.id, pet.name, pet.type, body.concern, body.date, body.time,
      paymentStatus, stripeCustomerId, stripePaymentIntentId,
      amountCents, validatedPromoCode, promoDiscount || null, promoType || null,
      JSON.stringify(body.agreements), body.agreementsSignedAt ?? Math.floor(Date.now() / 1000),
      body.agreementsClientName ?? user.name,
      body.pharmacyName ?? null, body.pharmacyAddress ?? null,
      body.pharmacyPhone ?? null, body.pharmacyFax ?? null, body.pharmacyEmail ?? null
    ).run();
  } catch (dbErr) {
    // Payment succeeded but DB failed — refund so customer isn't charged for a lost booking
    if (stripePaymentIntentId) {
      try {
        await getStripe().refunds.create({ payment_intent: stripePaymentIntentId });
      } catch { /* best-effort refund */ }
    }
    console.error("Consultation insert failed:", dbErr);
    return NextResponse.json({ error: "Booking failed due to a server error. You have not been charged." }, { status: 500 });
  }

  // Send notifications via waitUntil so the Worker stays alive after the response
  const vetName = await db.prepare("SELECT value FROM settings WHERE key = 'vet_name'").first<{ value: string }>();
  const vetEmail = await db.prepare("SELECT value FROM settings WHERE key = 'vet_email'").first<{ value: string }>();
  const vetPhone = await db.prepare("SELECT value FROM settings WHERE key = 'vet_phone'").first<{ value: string }>();
  const vetSmsOptIn = await db.prepare("SELECT value FROM settings WHERE key = 'vet_sms_opt_in'").first<{ value: string }>();

  const { ctx } = await getCloudflareContext({ async: true });
  ctx.waitUntil(
    sendConfirmationNotifications({
      petName: pet.name,
      petType: pet.type,
      concern: body.concern,
      date: body.date,
      time: body.time,
      userName: user.name,
      userEmail: user.email,
      userPhone: userRow?.phone ?? undefined,
      amountCents,
      last4: cardLast4 ?? undefined,
      paymentIntentId: stripePaymentIntentId ?? undefined,
    }, {
      name: vetName?.value ?? "Dr. McMillen",
      email: vetEmail?.value ?? "",
      phone: vetSmsOptIn?.value === "1" ? (vetPhone?.value ?? "") : "",
    }).then(async () => {
      await db.prepare(`UPDATE consultations SET notif_confirmation_sent = 1, notif_confirmation_sent_at = unixepoch(), updated_at = unixepoch() WHERE id = ?`).bind(id).run();
    }).catch((err) => console.error("Confirmation notification failed for consultation", id, err))
  );

  return NextResponse.json({ id }, { status: 201 });
}
