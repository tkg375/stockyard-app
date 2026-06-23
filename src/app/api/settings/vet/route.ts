import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { checkOrigin } from "@/lib/csrf";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionFromRequest(req);
  if (!user || user.role !== "vet") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = await getDb();
  const rows = await db.prepare("SELECT key, value FROM settings WHERE key IN ('vet_name', 'vet_email', 'vet_phone', 'vet_sms_opt_in', 'vet_sms_opt_in_at')").all<{ key: string; value: string }>();
  const settings: Record<string, string> = {};
  for (const r of rows.results) settings[r.key.replace("vet_", "")] = r.value;
  return NextResponse.json({ settings });
}

export async function POST(req: NextRequest) {
  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const user = await getSessionFromRequest(req);
  if (!user || user.role !== "vet") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name, email, phone, smsOptIn } = await req.json() as { name?: string; email?: string; phone?: string; smsOptIn?: boolean };
  if (!name || !email || !phone) return NextResponse.json({ error: "All fields required" }, { status: 400 });
  if (name.length > 100 || email.length > 254 || phone.length > 20) {
    return NextResponse.json({ error: "One or more fields exceed the maximum allowed length" }, { status: 400 });
  }

  const db = await getDb();
  const upsert = (key: string, value: string) =>
    db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, unixepoch()) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()")
      .bind(key, value).run();

  const ops = [upsert("vet_name", name), upsert("vet_email", email), upsert("vet_phone", phone)];
  if (smsOptIn !== undefined) {
    ops.push(upsert("vet_sms_opt_in", smsOptIn ? "1" : "0"));
    if (smsOptIn) ops.push(upsert("vet_sms_opt_in_at", new Date().toISOString()));
  }
  await Promise.all(ops);
  return NextResponse.json({ ok: true });
}
