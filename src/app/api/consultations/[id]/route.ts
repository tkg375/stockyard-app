import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { checkOrigin } from "@/lib/csrf";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await getSessionFromRequest(req);

  const db = await getDb();
  const row = await db.prepare(`
    SELECT c.*,
      p.breed AS pet_breed,
      p.weight AS pet_weight,
      p.birthday_year, p.birthday_month, p.birthday_day, p.estimated_birthday
    FROM consultations c
    LEFT JOIN pets p ON p.id = c.pet_id
    WHERE c.id = ?
  `).bind(id).first();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const c = row as { user_id: string; is_guest: number };

  // Allow guest access via guest_token query param or __Host-guest cookie
  if (!user) {
    if (c.is_guest === 1) {
      const guestToken = new URL(req.url).searchParams.get("guest_token");
      if (guestToken) {
        const match = await db.prepare("SELECT id FROM consultations WHERE id = ? AND guest_token = ?").bind(id, guestToken).first();
        if (match) return NextResponse.json({ consultation: row });
      }
      // Fallback: legacy cookie-based access
      const cookie = req.headers.get("cookie") ?? "";
      const cookieMatch = cookie.match(/__Host-guest=([^;]+)/);
      const guestVal = cookieMatch?.[1];
      if (guestVal) {
        const [guestConsultId] = guestVal.split(":");
        if (guestConsultId === id) return NextResponse.json({ consultation: row });
      }
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.role !== "vet" && c.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ consultation: row });
}

// PATCH for vet to update fields (status, payment_status, daily_room_url, etc.)
export async function PATCH(req: NextRequest, { params }: Params) {
  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const user = await getSessionFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "vet") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as Record<string, string | number | null>;
  // stripe_payment_intent_id and stripe_refund_id intentionally excluded — set only by payment code paths
  const allowed = ["status", "payment_status", "daily_room_url", "notes", "completed_at", "pharmacy_name", "pharmacy_address", "pharmacy_phone", "pharmacy_fax", "pharmacy_email"];
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];

  for (const key of allowed) {
    if (key in body) {
      sets.push(`${key} = ?`);
      vals.push(body[key]);
    }
  }

  if (!sets.length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  sets.push("updated_at = unixepoch()");
  vals.push(id);

  const db2 = await getDb();
  const exists = await db2.prepare("SELECT id FROM consultations WHERE id = ?").bind(id).first();
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db2.prepare(`UPDATE consultations SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  return NextResponse.json({ ok: true });
}
