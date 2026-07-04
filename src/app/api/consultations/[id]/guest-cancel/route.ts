export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { checkOrigin } from "@/lib/csrf";
import { sendCancellationNotifications } from "@/lib/notifications";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { checkRateLimit } from "@/lib/rateLimit";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "unknown";
  const allowed = await checkRateLimit(`guest-cancel:${ip}`, 5, 60);
  if (!allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const { id } = await params;
  const body = await req.json() as { email?: string; phone?: string };
  const email = body.email?.trim().toLowerCase();
  const phone = body.phone?.trim().replace(/\D/g, "");

  if (!email && !phone) {
    return NextResponse.json({ error: "Email or phone required to verify identity" }, { status: 400 });
  }

  const db = await getDb();
  const row = await db.prepare("SELECT * FROM consultations WHERE id = ?").bind(id).first<{
    user_id: string | null; status: string; payment_status: string;
    stripe_payment_intent_id: string | null; stripe_payment_method_id: string | null;
    user_name: string; user_email: string; user_phone: string | null;
    pet_name: string; pet_type: string; date: string; time: string;
    amount_cents: number | null; concern: string;
  }>();

  if (!row) return NextResponse.json({ error: "Consultation not found" }, { status: 404 });

  // Verify ownership via email or phone
  const emailMatch = email && row.user_email.toLowerCase() === email;
  const phoneMatch = phone && row.user_phone?.replace(/\D/g, "") === phone;
  if (!emailMatch && !phoneMatch) {
    return NextResponse.json({ error: "Identity verification failed" }, { status: 403 });
  }

  if (row.status === "cancelled") return NextResponse.json({ ok: true, refunded: row.payment_status === "refunded" });
  if (row.status === "completed") return NextResponse.json({ error: "Cannot cancel a completed consultation" }, { status: 422 });
  if (row.status === "in_progress") return NextResponse.json({ error: "Cannot cancel a consultation that has already started" }, { status: 422 });

  // Atomically claim the cancellation before touching Stripe, so this
  // endpoint racing with the authenticated /cancel endpoint (or a duplicate
  // guest-cancel double-click) can't both attempt to refund the same intent.
  const claim = await db.prepare(`
    UPDATE consultations SET status = 'cancelled', cancelled_at = unixepoch(), cancelled_by = 'guest', updated_at = unixepoch()
    WHERE id = ? AND status NOT IN ('cancelled', 'completed', 'in_progress')
  `).bind(id).run();
  if (claim.meta.changes === 0) {
    const current = await db.prepare("SELECT status, payment_status FROM consultations WHERE id = ?").bind(id).first<{ status: string; payment_status: string }>();
    if (current?.status === "cancelled") return NextResponse.json({ ok: true, refunded: current.payment_status === "refunded" });
    if (current?.status === "in_progress") return NextResponse.json({ error: "Cannot cancel a consultation that has already started" }, { status: 422 });
    return NextResponse.json({ error: "Cannot cancel a completed consultation" }, { status: 422 });
  }

  let refunded = false;
  let refundId: string | null = null;

  if (row.payment_status === "paid" && row.stripe_payment_intent_id) {
    try {
      const pi = await getStripe().paymentIntents.retrieve(row.stripe_payment_intent_id);
      if (pi.status !== "canceled" && pi.status !== "requires_payment_method") {
        const refund = await getStripe().refunds.create({
          payment_intent: row.stripe_payment_intent_id,
          reason: "requested_by_customer",
        });
        refunded = true;
        refundId = refund.id;
      }
    } catch (err) {
      await db.prepare(`UPDATE consultations SET payment_status = 'refund_failed', updated_at = unixepoch() WHERE id = ?`).bind(id).run();
      const msg = err instanceof Error ? err.message : "Refund failed";
      console.error(`Refund failed for guest-cancelled consultation ${id}:`, err);
      return NextResponse.json({ error: `Cancelled, but could not process refund: ${msg}` }, { status: 502 });
    }
  }

  await db.prepare(`
    UPDATE consultations SET
      payment_status = ?,
      stripe_refund_id = ?,
      updated_at = unixepoch()
    WHERE id = ?
  `).bind(refunded ? "refunded" : "voided", refundId, id).run();

  let cardLast4: string | null = null;
  if (row.stripe_payment_intent_id) {
    try {
      const intent = await getStripe().paymentIntents.retrieve(row.stripe_payment_intent_id);
      const pmId = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id;
      if (pmId) {
        const pm = await getStripe().paymentMethods.retrieve(pmId);
        cardLast4 = pm.card?.last4 ?? null;
      }
    } catch { /* non-critical */ }
  }

  const vetEmail = await db.prepare("SELECT value FROM settings WHERE key = 'vet_email'").first<{ value: string }>();
  const vetPhone = await db.prepare("SELECT value FROM settings WHERE key = 'vet_phone'").first<{ value: string }>();
  const vetName = await db.prepare("SELECT value FROM settings WHERE key = 'vet_name'").first<{ value: string }>();
  const vetSmsOptIn = await db.prepare("SELECT value FROM settings WHERE key = 'vet_sms_opt_in'").first<{ value: string }>();

  const { ctx } = await getCloudflareContext({ async: true });
  ctx.waitUntil(
    sendCancellationNotifications({
      petName: row.pet_name,
      petType: row.pet_type,
      concern: row.concern,
      date: row.date,
      time: row.time,
      userName: row.user_name,
      userEmail: row.user_email,
      userPhone: row.user_phone ?? undefined,
      amountCents: row.amount_cents ?? undefined,
      last4: cardLast4 ?? undefined,
      paymentIntentId: row.stripe_payment_intent_id ?? undefined,
      refunded,
      refundId,
    }, {
      name: vetName?.value ?? "Dr. McMillen",
      email: vetEmail?.value ?? "",
      phone: vetSmsOptIn?.value === "1" ? (vetPhone?.value ?? "") : "",
    }).catch((err) => console.error("Cancellation notification failed for consultation", id, err))
  );

  return NextResponse.json({
    ok: true,
    message: refunded ? "Cancelled and refund issued" : "Cancelled successfully",
    refunded,
  });
}
