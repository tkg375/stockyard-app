export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email")?.trim().toLowerCase();
  if (!email) return NextResponse.json({ pharmacy: null });

  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "unknown";
  const allowed = await checkRateLimit(`pharmacy-lookup:${ip}`, 20, 60);
  if (!allowed) return NextResponse.json({ pharmacy: null });

  const db = await getDb();
  const row = await db.prepare(`
    SELECT pharmacy_name, pharmacy_address, pharmacy_phone, pharmacy_fax, pharmacy_email
    FROM consultations
    WHERE user_email = ? AND pharmacy_name IS NOT NULL
    ORDER BY created_at DESC LIMIT 1
  `).bind(email).first<{
    pharmacy_name: string;
    pharmacy_address: string | null;
    pharmacy_phone: string | null;
    pharmacy_fax: string | null;
    pharmacy_email: string | null;
  }>();

  if (!row) return NextResponse.json({ pharmacy: null });
  return NextResponse.json({ pharmacy: row });
}
