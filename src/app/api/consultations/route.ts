import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  const rows = user.role === "vet"
    ? await db.prepare(`
        SELECT c.*,
          (SELECT COUNT(*) FROM messages m WHERE m.consultation_id = c.id AND m.read_by_vet = 0 AND m.sender_type = 'customer') AS unread_messages
        FROM consultations c ORDER BY c.date DESC, c.time DESC LIMIT 100
      `).all()
    : await db.prepare(`
        SELECT c.*,
          (SELECT COUNT(*) FROM messages m WHERE m.consultation_id = c.id AND m.read_by_customer = 0 AND m.sender_type = 'vet') AS unread_messages
        FROM consultations c WHERE c.user_id = ? ORDER BY c.date DESC, c.time DESC
      `).bind(user.id).all();

  return NextResponse.json({ consultations: rows.results });
}
