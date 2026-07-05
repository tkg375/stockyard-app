export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const body = await req.text();
  let event;
  try {
    // constructEventAsync uses Web Crypto — compatible with Cloudflare Workers
    event = await getStripe().webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    console.error("[stripe/webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const db = await getDb();

  // Idempotency: claim this event before doing any work. INSERT OR IGNORE is
  // atomic, so two concurrent redeliveries of the same event can't both pass
  // a check-then-act race the way a SELECT-then-INSERT would.
  const claimed = await db
    .prepare("INSERT OR IGNORE INTO processed_webhook_events (event_id, processed_at) VALUES (?, unixepoch())")
    .bind(event.id)
    .run();
  if (claimed.meta.changes === 0) return NextResponse.json({ received: true });

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object;
        await db.prepare(`
          UPDATE consultations SET payment_status = 'paid', updated_at = unixepoch()
          WHERE stripe_payment_intent_id = ? AND payment_status != 'paid'
        `).bind(pi.id).run();
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        await db.prepare(`
          UPDATE consultations SET payment_status = 'failed', updated_at = unixepoch()
          WHERE stripe_payment_intent_id = ?
        `).bind(pi.id).run();
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object;
        const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
        if (piId) {
          await db.prepare(`
            UPDATE consultations SET payment_status = 'refunded', updated_at = unixepoch()
            WHERE stripe_payment_intent_id = ?
          `).bind(piId).run();
        }
        break;
      }
      case "charge.dispute.created": {
        const dispute = event.data.object;
        const piId = typeof dispute.payment_intent === "string" ? dispute.payment_intent : null;
        if (piId) {
          await db.prepare(`
            UPDATE consultations SET payment_status = 'disputed', updated_at = unixepoch()
            WHERE stripe_payment_intent_id = ?
          `).bind(piId).run();
        }
        break;
      }
    }
  } catch (err) {
    // The event is already claimed above, so if we swallow this failure the
    // payment-status update is lost forever — Stripe's retry would hit the
    // idempotency check and skip it. Release the claim and return 500 so
    // Stripe redelivers and the next attempt reprocesses from scratch.
    console.error(`[stripe/webhook] Processing failed for event ${event.id} (${event.type}), releasing claim for retry:`, err);
    try {
      await db.prepare("DELETE FROM processed_webhook_events WHERE event_id = ?").bind(event.id).run();
    } catch (releaseErr) {
      console.error(`[stripe/webhook] CRITICAL: could not release claim for event ${event.id} — this event will never be reprocessed:`, releaseErr);
    }
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
