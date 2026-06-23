import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-hailey-api-key");
  if (!apiKey || apiKey !== process.env.HAILEY_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name, email } = await req.json() as any;

    const stripe = getStripe();

    const customer = await stripe.customers.create({
      name: name ?? undefined,
      email: email ?? undefined,
      metadata: { source: "hailey_widget" },
    });

    const intent = await stripe.paymentIntents.create({
      amount: 6000, // $60.00
      currency: "usd",
      customer: customer.id,
      payment_method_types: ["card"],
      metadata: { source: "hailey_widget" },
    });

    return NextResponse.json({
      clientSecret: intent.client_secret,
      stripeCustomerId: customer.id,
      publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    });
  } catch (err: any) {
    console.error("[payment-intent]", err);
    return NextResponse.json({ error: err?.message ?? "Failed to create payment intent" }, { status: 500 });
  }
}
