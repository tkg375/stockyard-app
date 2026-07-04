export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { getDb } from "@/lib/db";
import { sendPaymentFailedNotification } from "@/lib/notifications";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { checkOrigin } from "@/lib/csrf";


export async function POST(req: NextRequest) {
  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const user = await getSessionFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { paymentMethodId, consultationId } = await req.json() as {
    paymentMethodId?: string; consultationId?: string;
  };

  if (!paymentMethodId || !consultationId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const db = await getDb();

  // Look up consultation — verify ownership and get server-side amount
  const consultation = await db.prepare(
    "SELECT amount_cents, stripe_customer_id, user_id, payment_status FROM consultations WHERE id = ?"
  ).bind(consultationId).first<{ amount_cents: number; stripe_customer_id: string | null; user_id: string; payment_status: string }>();

  if (!consultation) return NextResponse.json({ error: "Consultation not found" }, { status: 404 });
  if (user.role !== "vet" && consultation.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (consultation.payment_status === "paid") {
    return NextResponse.json({ error: "Consultation is already paid" }, { status: 409 });
  }

  const amount = consultation.amount_cents;
  const customerId = consultation.stripe_customer_id;
  if (!customerId) return NextResponse.json({ error: "No Stripe customer on file" }, { status: 400 });

  let paymentIntent;
  try {
    paymentIntent = await getStripe().paymentIntents.create({
      amount,
      currency: "usd",
      customer: customerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      receipt_email: user.email,
      metadata: { consultationId },
    }, {
      // Retrying this request (e.g. after a network blip) must not create a
      // second charge — scope the key to this consultation's one payment attempt.
      idempotencyKey: `book-charge-${consultationId}`,
    });
  } catch {
    // The Stripe call itself failed — no charge was made. Safe to mark failed and notify.
    await db.prepare(`
      UPDATE consultations SET payment_status = 'failed', updated_at = unixepoch() WHERE id = ?
    `).bind(consultationId).run();

    const row = await db.prepare("SELECT * FROM consultations WHERE id = ?").bind(consultationId).first<{
      pet_name: string; pet_type: string; date: string; time: string;
      user_name: string; user_email: string; user_phone: string | null;
      notif_payment_failed_sent: number;
    }>();

    if (row && !row.notif_payment_failed_sent) {
      const { ctx } = await getCloudflareContext({ async: true });
      ctx.waitUntil(
        sendPaymentFailedNotification({
          petName: row.pet_name, petType: row.pet_type, date: row.date,
          time: row.time, userName: row.user_name, userEmail: row.user_email,
          userPhone: row.user_phone ?? undefined,
        }).then(() => db.prepare(`UPDATE consultations SET notif_payment_failed_sent = 1 WHERE id = ?`).bind(consultationId).run())
          .catch(() => {})
      );
    }

    return NextResponse.json({ error: "Payment failed" }, { status: 402 });
  }

  // Charge succeeded. From here, never report failure to the customer or send
  // a "payment failed" notification — a DB hiccup below is an internal
  // bookkeeping problem, not a payment problem. The webhook handler will
  // reconcile payment_status once stripe_payment_intent_id is recorded.
  const recordCharge = () => db.prepare(`
    UPDATE consultations SET
      payment_status = 'paid',
      stripe_payment_intent_id = ?,
      updated_at = unixepoch()
    WHERE id = ?
  `).bind(paymentIntent!.id, consultationId).run();

  try {
    await recordCharge();
  } catch (dbErr) {
    console.error(`[payment-intent] Charge ${paymentIntent.id} succeeded but DB update failed for consultation ${consultationId}, retrying:`, dbErr);
    try {
      await recordCharge();
    } catch (dbErr2) {
      console.error(`[payment-intent] Retry also failed for consultation ${consultationId} — attempting to at least record the payment intent id for webhook reconciliation:`, dbErr2);
      try {
        await db.prepare(`UPDATE consultations SET stripe_payment_intent_id = ?, updated_at = unixepoch() WHERE id = ?`)
          .bind(paymentIntent.id, consultationId).run();
      } catch (dbErr3) {
        console.error(`[payment-intent] CRITICAL: consultation ${consultationId} charged (${paymentIntent.id}) but no DB record could be written — needs manual reconciliation:`, dbErr3);
      }
    }
  }

  return NextResponse.json({ ok: true, paymentIntentId: paymentIntent.id, status: paymentIntent.status });
}
