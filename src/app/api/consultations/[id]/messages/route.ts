import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { sendMessageNotification } from "@/lib/notifications";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { checkOrigin } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await getSessionFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  const consultation = await db.prepare("SELECT user_id FROM consultations WHERE id = ?").bind(id).first<{ user_id: string }>();
  if (!consultation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.role !== "vet" && consultation.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db.prepare("SELECT * FROM messages WHERE consultation_id = ? ORDER BY created_at ASC").bind(id).all();

  // Mark messages as read
  if (user.role === "vet") {
    await db.prepare("UPDATE messages SET read_by_vet = 1 WHERE consultation_id = ? AND read_by_vet = 0").bind(id).run();
  } else {
    await db.prepare("UPDATE messages SET read_by_customer = 1 WHERE consultation_id = ? AND read_by_customer = 0").bind(id).run();
  }

  return NextResponse.json({ messages: rows.results });
}

export async function POST(req: NextRequest, { params }: Params) {
  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const user = await getSessionFromRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const msgAllowed = await checkRateLimit(`msg:${user.id}:${id}`, 30, 3600);
  if (!msgAllowed) return NextResponse.json({ error: "Too many messages. Please slow down." }, { status: 429 });

  const { text } = await req.json() as { text?: string };
  if (!text?.trim()) return NextResponse.json({ error: "Message text is required" }, { status: 400 });
  if (text.trim().length > 2000) return NextResponse.json({ error: "Message must be 2000 characters or fewer" }, { status: 400 });

  const db = await getDb();
  const consultation = await db.prepare("SELECT * FROM consultations WHERE id = ?").bind(id).first<{
    user_id: string; user_email: string; user_name: string; pet_name: string;
    status: string; completed_at: number | null;
  }>();
  if (!consultation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.role !== "vet" && consultation.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Customers can only message up to 24 hours after a completed consultation
  if (user.role !== "vet" && consultation.status === "completed" && consultation.completed_at) {
    const hoursSinceCompletion = (Math.floor(Date.now() / 1000) - consultation.completed_at) / 3600;
    if (hoursSinceCompletion > 24) {
      return NextResponse.json({ error: "Messaging is closed. The 24-hour follow-up window has passed." }, { status: 403 });
    }
  }

  const msgId = crypto.randomUUID();
  const senderType = user.role === "vet" ? "vet" : "customer";

  await db.prepare(
    `INSERT INTO messages (id, consultation_id, sender_id, sender_type, text) VALUES (?, ?, ?, ?, ?)`
  ).bind(msgId, id, user.id, senderType, text.trim()).run();

  // Send notification to the other party
  const { ctx } = await getCloudflareContext({ async: true });
  if (senderType === "customer") {
    const vetEmail = await db.prepare("SELECT value FROM settings WHERE key = 'vet_email'").first<{ value: string }>();
    if (vetEmail?.value) {
      ctx.waitUntil(sendMessageNotification({
        toEmail: vetEmail.value,
        toType: "vet",
        senderName: user.name,
        petName: consultation.pet_name,
        messageText: text,
      }).catch(() => {}));
    }
  } else {
    ctx.waitUntil(sendMessageNotification({
      toEmail: consultation.user_email,
      toType: "customer",
      senderName: "Dr. McMillen",
      petName: consultation.pet_name,
      messageText: text,
    }).catch(() => {}));
  }

  return NextResponse.json({ id: msgId }, { status: 201 });
}
