import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionFromRequest(req);
  if (!user || user.role !== "vet") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  const url = new URL(req.url);
  const table = url.searchParams.get("table") ?? "consultations";

  const allowed = ["consultations", "users", "pets", "messages", "promo_codes", "settings", "sessions"];
  if (!allowed.includes(table)) return NextResponse.json({ error: "Invalid table" }, { status: 400 });

  let rows;
  if (table === "consultations") {
    rows = await db.prepare(`
      SELECT id, user_name, user_email, user_phone, pet_name, pet_type, concern,
        date, time, status, payment_status, amount_cents, promo_code, promo_discount,
        notes, ai_summary, ai_summary_approved, discharge_sent, discharge_sent_at,
        agreements_client_name, agreements_signed_at, agreements_json,
        stripe_payment_intent_id, stripe_refund_id,
        cancelled_at, cancelled_by, completed_at, created_at, updated_at
      FROM consultations ORDER BY created_at DESC LIMIT 500
    `).all();
  } else if (table === "users") {
    rows = await db.prepare(`
      SELECT id, email, name, phone, address, city, state, zip, role,
        stripe_customer_id, created_at, updated_at
      FROM users ORDER BY created_at DESC
    `).all();
  } else if (table === "pets") {
    rows = await db.prepare(`
      SELECT p.id, p.name, p.type, p.breed, p.weight,
        p.birthday_year, p.birthday_month, p.birthday_day, p.estimated_birthday,
        p.notes, u.name AS owner_name, u.email AS owner_email,
        p.created_at, p.updated_at
      FROM pets p
      LEFT JOIN users u ON u.id = p.user_id
      ORDER BY p.created_at DESC
    `).all();
  } else if (table === "messages") {
    rows = await db.prepare(`
      SELECT m.id, m.consultation_id, m.sender_type, m.text,
        m.read_by_vet, m.read_by_customer, m.created_at,
        c.pet_name, c.user_name
      FROM messages m
      LEFT JOIN consultations c ON c.id = m.consultation_id
      ORDER BY m.created_at DESC LIMIT 500
    `).all();
  } else if (table === "promo_codes") {
    rows = await db.prepare("SELECT * FROM promo_codes ORDER BY created_at DESC").all();
  } else if (table === "settings") {
    rows = await db.prepare("SELECT * FROM settings ORDER BY key").all();
  } else if (table === "sessions") {
    rows = await db.prepare(`
      SELECT s.id, s.user_id, u.email, u.name, s.expires_at, s.created_at
      FROM sessions s LEFT JOIN users u ON u.id = s.user_id
      ORDER BY s.created_at DESC LIMIT 200
    `).all();
  }

  return NextResponse.json({ rows: rows?.results ?? [] });
}
