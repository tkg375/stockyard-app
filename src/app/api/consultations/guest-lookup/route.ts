import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 });

  const db = await getDb();
  const row = await db.prepare(
    "SELECT id, user_name, user_email, pet_name, pet_type, concern, date, time, status FROM consultations WHERE guest_token = ? AND is_guest = 1"
  ).bind(token).first<any>();

  if (!row) return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  if (row.status === "cancelled") return NextResponse.json({ error: "This appointment has been cancelled" }, { status: 410 });

  return NextResponse.json({ consultation: row });
}
