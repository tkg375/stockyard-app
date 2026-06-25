export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

const HAILEY_API_KEY = process.env.HAILEY_WEBHOOK_SECRET ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "https://hailey.tgordo03.workers.dev",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-hailey-api-key",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-hailey-api-key");
  if (!HAILEY_API_KEY || key !== HAILEY_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }

  try {
    const { name, email, phone } = await req.json() as { name?: string; email?: string; phone?: string };
    if (!name || !email) return NextResponse.json({ error: "name and email required" }, { status: 400, headers: CORS });

    const stripe = getStripe();
    const customer = await stripe.customers.create({
      email,
      name,
      phone: phone || undefined,
    });

    const intent = await stripe.paymentIntents.create({
      amount: 6000,
      currency: "usd",
      customer: customer.id,
      payment_method_types: ["card"],
      description: `Stockyard consultation (via Hailey)`,
      receipt_email: email,
      metadata: { source: "hailey", guestName: name },
    });

    return NextResponse.json({
      clientSecret: intent.client_secret,
      publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      amountCents: 6000,
      stripeCustomerId: customer.id,
    }, { headers: CORS });
  } catch (err: any) {
    console.error("[hailey/payment-intent]", err);
    return NextResponse.json({ error: err?.message ?? "Failed to create payment intent" }, { status: 500, headers: CORS });
  }
}
