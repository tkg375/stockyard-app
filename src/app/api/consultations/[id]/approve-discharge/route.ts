import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { checkOrigin } from "@/lib/csrf";
import { sendDischargeEmail } from "@/lib/notifications";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const user = await getSessionFromRequest(req);
  if (!user || user.role !== "vet") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { summary?: string };
  if (!body.summary?.trim()) return NextResponse.json({ error: "Summary is required." }, { status: 400 });

  const db = await getDb();
  const row = await db.prepare(
    "SELECT id, pet_name, pet_type, user_name, user_email, user_phone, date, time, concern, agreements_json, agreements_signed_at, agreements_client_name FROM consultations WHERE id = ?"
  ).bind(id).first<{
    id: string; pet_name: string; pet_type: string;
    user_name: string; user_email: string; user_phone: string | null;
    date: string; time: string; concern: string;
    agreements_json: string | null;
    agreements_signed_at: number | null;
    agreements_client_name: string | null;
  }>();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let agreementsData: { json: Record<string, boolean>; signedAt: number | null; clientName: string } | undefined;
  if (row.agreements_json) {
    try {
      agreementsData = {
        json: JSON.parse(row.agreements_json),
        signedAt: row.agreements_signed_at,
        clientName: row.agreements_client_name ?? row.user_name,
      };
    } catch { /* non-critical */ }
  }

  const now = Math.floor(Date.now() / 1000);
  await db.prepare(`
    UPDATE consultations
    SET ai_summary = ?, ai_summary_approved = 1, discharge_sent = 1, discharge_sent_at = ?, updated_at = unixepoch()
    WHERE id = ?
  `).bind(body.summary.trim(), now, id).run();

  const sent = await sendDischargeEmail({
    petName: row.pet_name,
    petType: row.pet_type,
    userName: row.user_name,
    userEmail: row.user_email,
    userPhone: row.user_phone ?? undefined,
    date: row.date,
    time: row.time,
    summary: body.summary.trim(),
    agreements: agreementsData,
  });

  return NextResponse.json({ ok: true, emailSent: sent });
}
