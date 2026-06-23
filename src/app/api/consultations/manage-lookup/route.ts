import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const value = searchParams.get("value")?.trim();

  if (!type || !value || (type !== "email" && type !== "phone")) {
    return NextResponse.json({ error: "Invalid search parameters" }, { status: 400 });
  }

  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "unknown";
  const allowed = await checkRateLimit(`manage-lookup:${ip}`, 10, 60);
  if (!allowed) return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });

  const db = await getDb();

  const column = type === "email" ? "user_email" : "user_phone";
  const normalizedValue = type === "phone" ? value.replace(/\D/g, "") : value.toLowerCase();

  const rows = await db.prepare(`
    SELECT id, pet_name, pet_type, concern, date, time, status, payment_status, amount_cents, user_name, guest_token, is_guest
    FROM consultations
    WHERE ${column} = ? AND status NOT IN ('cancelled', 'completed')
    ORDER BY date ASC, time ASC
    LIMIT 20
  `).bind(normalizedValue).all<{
    id: string;
    pet_name: string;
    pet_type: string;
    concern: string;
    date: string;
    time: string;
    status: string;
    payment_status: string;
    amount_cents: number | null;
    user_name: string;
  }>();

  return NextResponse.json({ consultations: rows.results });
}
