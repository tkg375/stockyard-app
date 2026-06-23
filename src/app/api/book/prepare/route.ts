export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { checkOrigin } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "unknown";
  const allowed = await checkRateLimit(`book-prepare:${ip}`, 20, 3600);
  if (!allowed) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });

  const body = await req.json() as {
    name?: string; email?: string; phone?: string;
    petName?: string; petType?: string;
    concern?: string; date?: string; time?: string; promoCode?: string;
  };

  if (!body.name || !body.email || !body.petName || !body.petType || !body.concern || !body.date || !body.time) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  if (!/^\d{2}:\d{2}$/.test(body.time)) return NextResponse.json({ error: "Invalid time" }, { status: 400 });

  const db = await getDb();

  const slotTaken = await db.prepare(
    "SELECT id FROM consultations WHERE date = ? AND time = ? AND status NOT IN ('cancelled')"
  ).bind(body.date, body.time).first();
  if (slotTaken) return NextResponse.json({ error: "This time slot is no longer available." }, { status: 409 });

  let promoDiscount = 0;
  let promoType = "";
  if (body.promoCode) {
    const promo = await db.prepare("SELECT discount, type FROM promo_codes WHERE code = ? AND active = 1")
      .bind(body.promoCode.toUpperCase())
      .first<{ discount: number; type: string }>();
    if (promo) { promoDiscount = promo.discount; promoType = promo.type; }
  }

  const basePrice = 6000;
  let amountCents = basePrice;
  if (promoType === "percent") amountCents = Math.max(0, Math.round(basePrice * (1 - promoDiscount / 100)));
  else if (promoType === "fixed") amountCents = Math.max(0, basePrice - promoDiscount * 100);

  if (amountCents === 0) return NextResponse.json({ free: true, amountCents: 0 });

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: body.email,
    name: body.name,
    phone: body.phone || undefined,
  });

  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: "usd",
    customer: customer.id,
    payment_method_types: ["card"],
    description: `Stockyard consultation — ${body.petName} (${body.petType})`,
    receipt_email: body.email,
    metadata: { guestName: body.name, petName: body.petName },
  });

  return NextResponse.json({ clientSecret: intent.client_secret, amountCents, stripeCustomerId: customer.id });
}
