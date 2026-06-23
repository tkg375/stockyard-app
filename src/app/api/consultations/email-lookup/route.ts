import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-hailey-api-key");
  if (!apiKey || apiKey !== process.env.HAILEY_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const db = await getDb();
  const rows = await db.prepare(
    `SELECT id, user_name, pet_name, pet_type, concern, date, time, status
     FROM consultations
     WHERE user_email = ? AND status NOT IN ('cancelled','completed')
     ORDER BY date ASC, time ASC LIMIT 5`
  ).bind(email).all();

  return NextResponse.json({ consultations: rows.results });
}
