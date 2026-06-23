import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { checkOrigin } from "@/lib/csrf";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const user = await getSessionFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "vet") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    petName?: string;
    ownerName?: string;
    ownerPhone?: string;
    concern?: string;
    soap?: { subjective: string; objective: string; assessment: string; plan: string };
  };

  if (!body.petName || !body.ownerName || !body.concern) {
    return NextResponse.json({ error: "Pet name, owner name, and concern are required" }, { status: 400 });
  }
  if (body.petName.length > 100) return NextResponse.json({ error: "Pet name too long" }, { status: 400 });
  if (body.ownerName.length > 100) return NextResponse.json({ error: "Owner name too long" }, { status: 400 });
  if (body.concern.length > 1000) return NextResponse.json({ error: "Concern must be 1000 characters or fewer" }, { status: 400 });
  if (body.ownerPhone && body.ownerPhone.length > 20) return NextResponse.json({ error: "Phone too long" }, { status: 400 });

  const db = await getDb();
  const id = crypto.randomUUID();
  const now = new Date();
  const date = now.toISOString().split("T")[0];
  const hours = String(now.getHours()).padStart(2, "0");
  const mins = String(now.getMinutes()).padStart(2, "0");
  const time = `${hours}:${mins}`;
  const notesJson = body.soap ? JSON.stringify(body.soap) : null;

  await db.prepare(`
    INSERT INTO consultations
      (id, user_id, user_name, user_email, user_phone, pet_name, pet_type, concern,
       date, time, status, payment_status, notes, amount_cents)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', 'misc', ?, 0)
  `).bind(
    id,
    user.id,
    body.ownerName,
    "",
    body.ownerPhone ?? null,
    body.petName,
    "misc",
    body.concern,
    date,
    time,
    notesJson,
  ).run();

  return NextResponse.json({ id }, { status: 201 });
}
