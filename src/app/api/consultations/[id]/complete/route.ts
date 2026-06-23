export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { checkOrigin } from "@/lib/csrf";


type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const user = await getSessionFromRequest(req);
  if (!user || user.role !== "vet") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = await getDb();
  const row = await db.prepare("SELECT id FROM consultations WHERE id = ?").bind(id).first();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.prepare(`UPDATE consultations SET status = 'completed', completed_at = unixepoch(), updated_at = unixepoch() WHERE id = ?`).bind(id).run();
  return NextResponse.json({ ok: true });
}
