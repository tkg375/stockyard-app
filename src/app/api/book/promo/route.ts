export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { checkOrigin } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ valid: false, error: "Forbidden" }, { status: 403 });

  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "unknown";
  const allowed = await checkRateLimit(`book-promo:${ip}`, 20, 3600);
  if (!allowed) return NextResponse.json({ valid: false, error: "Too many attempts." }, { status: 429 });

  const { code } = await req.json() as { code?: string };
  if (!code || typeof code !== "string" || !code.trim() || code.trim().length > 50) {
    return NextResponse.json({ valid: false, error: "Invalid promo code" });
  }

  const db = await getDb();
  const promo = await db.prepare(
    "SELECT code, discount, type, description, max_uses, uses_count, expires_at FROM promo_codes WHERE code = ? AND active = 1"
  ).bind(code.trim().toUpperCase()).first<{ code: string; discount: number; type: string; description: string; max_uses: number | null; uses_count: number; expires_at: number | null }>();

  if (!promo) return NextResponse.json({ valid: false, error: "Invalid or expired promo code" });
  if (promo.expires_at !== null && promo.expires_at <= Math.floor(Date.now() / 1000)) {
    return NextResponse.json({ valid: false, error: "Invalid or expired promo code" });
  }
  if (promo.max_uses !== null && promo.uses_count >= promo.max_uses) {
    return NextResponse.json({ valid: false, error: "This promo code has reached its usage limit" });
  }
  return NextResponse.json({ valid: true, code: promo.code, discount: promo.discount, type: promo.type, description: promo.description });
}
