import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionFromRequest(req);
  if (!user || user.role !== "vet") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'vet_signature_b64'").first<{ value: string }>();
  return NextResponse.json({ signature: row?.value ?? null });
}

export async function POST(req: NextRequest) {
  const user = await getSessionFromRequest(req);
  if (!user || user.role !== "vet") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { signature } = await req.json() as { signature: string };
  if (!signature || !signature.startsWith("data:image/png;base64,")) {
    return NextResponse.json({ error: "Invalid signature data" }, { status: 400 });
  }
  // Sanity check size (~max 200KB base64)
  if (signature.length > 280000) return NextResponse.json({ error: "Signature too large" }, { status: 400 });

  const db = await getDb();
  await db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES ('vet_signature_b64', ?, unixepoch())
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()
  `).bind(signature).run();

  return NextResponse.json({ ok: true });
}
