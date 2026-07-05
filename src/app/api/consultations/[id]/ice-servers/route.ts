export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { logCallEvent } from "@/lib/callLog";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const db = await getDb();
  const row = await db.prepare("SELECT user_id, is_guest FROM consultations WHERE id = ?").bind(id).first<{ user_id: string; is_guest: number }>();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Allow guests via guest_token param or legacy cookie
  if (row.is_guest) {
    const guestToken = new URL(req.url).searchParams.get("guest_token");
    if (guestToken) {
      const match = await db.prepare("SELECT id FROM consultations WHERE id = ? AND guest_token = ?").bind(id, guestToken).first();
      if (!match) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    } else {
      const cookie = req.headers.get("cookie") ?? "";
      const cookieMatch = cookie.match(/__Host-guest=([^;]+)/);
      if (!cookieMatch || cookieMatch[1].split(":")[0] !== id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Guests authorized — skip role check below
  } else {
    const user = await getSessionFromRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "vet" && row.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const keyId = process.env.CF_TURN_KEY_ID;
  const apiToken = process.env.CF_TURN_API_TOKEN;

  // STUN-only degradation is the right call (a call on a friendly NAT still
  // works), but it must be observable: without a log row, a TURN outage is
  // indistinguishable from "the customer's network is hostile" when
  // diagnosing failed calls after the fact.
  const stunFallback = async (reason: string) => {
    await logCallEvent(db, { consultationId: id, role: "server", event: "turn_fallback", detail: { reason } });
    return NextResponse.json({ iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }] });
  };

  if (!keyId || !apiToken) {
    return stunFallback("turn_keys_not_configured");
  }

  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: 86400 }),
      }
    );

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error("[ice-servers] CF TURN error", res.status, err);
      return stunFallback(`cf_api_${res.status}`);
    }

    const data = await res.json() as { iceServers: unknown[] };
    return NextResponse.json({ iceServers: data.iceServers });
  } catch (err) {
    console.error("[ice-servers] fetch error", err);
    return stunFallback("cf_api_fetch_error");
  }
}
