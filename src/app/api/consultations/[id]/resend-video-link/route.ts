export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { sendVideoLinkNotification } from "@/lib/notifications";
import { checkOrigin } from "@/lib/csrf";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const user = await getSessionFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  const row = await db.prepare(
    "SELECT user_id, status, pet_name, user_email, user_phone, sms_consent, guest_token FROM consultations WHERE id = ?"
  ).bind(id).first<{
    user_id: string; status: string; pet_name: string;
    user_email: string; user_phone: string | null;
    sms_consent: number | null; guest_token: string | null;
  }>();

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.role !== "vet") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (row.status !== "in_progress") return NextResponse.json({ error: "Consultation must be in progress" }, { status: 422 });

  const joinUrl = row.guest_token
    ? `https://stockyardanimalhealth.com/guest-join?token=${encodeURIComponent(row.guest_token)}`
    : "https://stockyardanimalhealth.com/manage";

  const results = await sendVideoLinkNotification(id, {
    petName: row.pet_name,
    userEmail: row.user_email,
    userPhone: row.sms_consent ? (row.user_phone ?? undefined) : undefined,
    joinUrl,
  });

  return NextResponse.json({ ok: true, results });
}
