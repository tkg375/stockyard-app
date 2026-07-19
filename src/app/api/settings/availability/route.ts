import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import { checkOrigin } from "@/lib/csrf";

export const dynamic = "force-dynamic";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function generateSlots(start: string, end: string): string[] {
  const slots: string[] = [];
  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);
  const startMin = startH * 60 + startM;
  const endMin = endH * 60 + endM;
  for (let m = startMin; m < endMin; m += 10) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
  return slots;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");

  if (searchParams.get("public")) {
    // Public, read-only summary for marketing pages — weekly hours only, no blockedDates.
    const db = await getDb();
    const row = await db
      .prepare("SELECT value FROM settings WHERE key = 'availability'")
      .first<{ value: string }>();
    if (!row) return NextResponse.json({ weeklySchedule: {} }, { headers: CORS });
    try {
      const availability = JSON.parse(row.value) as { weeklySchedule?: unknown };
      return NextResponse.json({ weeklySchedule: availability.weeklySchedule ?? {} }, { headers: CORS });
    } catch {
      return NextResponse.json({ weeklySchedule: {} }, { headers: CORS });
    }
  }

  if (date) {
    // Validate date format before using it
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ slots: [] });
    }

    // Public endpoint — no auth required
    const db = await getDb();
    const row = await db
      .prepare("SELECT value FROM settings WHERE key = 'availability'")
      .first<{ value: string }>();

    if (!row) return NextResponse.json({ slots: [] });

    let availability: { weeklySchedule: Record<string, { enabled: boolean; start: string; end: string }>; blockedDates: string[] };
    try {
      availability = JSON.parse(row.value);
    } catch {
      return NextResponse.json({ slots: [] });
    }

    // Check blocked dates
    if ((availability.blockedDates ?? []).includes(date)) {
      return NextResponse.json({ slots: [], blocked: true });
    }

    // Map date to day key
    const [year, month, day] = date.split("-").map(Number);
    const jsDay = new Date(year, month - 1, day).getDay(); // 0=sun
    const dayKey = DAY_KEYS[jsDay];

    // Support two storage formats:
    // New: weeklySchedule["sun"] = { enabled, start, end }
    // Legacy: weeklySchedule["0"] = ["09:00", "09:30", ...]
    const dayConfigNew = availability.weeklySchedule?.[dayKey];
    const dayConfigLegacy = availability.weeklySchedule?.[String(jsDay)];

    let allSlots: string[];
    if (dayConfigNew) {
      // New format takes precedence when present
      allSlots = dayConfigNew.enabled ? generateSlots(dayConfigNew.start, dayConfigNew.end) : [];
    } else if (Array.isArray(dayConfigLegacy)) {
      // Legacy format — slots are stored explicitly
      allSlots = dayConfigLegacy as string[];
    } else {
      return NextResponse.json({ slots: [] });
    }

    // Fetch booked times for that date
    const booked = await db
      .prepare(
        "SELECT time FROM consultations WHERE date = ? AND status NOT IN ('cancelled')"
      )
      .bind(date)
      .all<{ time: string }>();

    const bookedSet = new Set((booked.results ?? []).map((r) => r.time));

    // Filter out past dates/slots (schedule is Eastern time)
    const easternNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const todayEastern = easternNow.toLocaleDateString("en-CA"); // YYYY-MM-DD
    const available = allSlots.filter((s) => {
      if (bookedSet.has(s)) return false;
      if (date < todayEastern) return false;
      if (date === todayEastern) {
        const [h, m] = s.split(":").map(Number);
        const slotEastern = new Date(easternNow);
        slotEastern.setHours(h, m, 0, 0);
        return slotEastern.getTime() - easternNow.getTime() > 30 * 60 * 1000;
      }
      return true;
    });

    return NextResponse.json({ slots: available }, { headers: CORS });
  }

  // Auth-gated: vet only
  const user = await getSessionFromRequest(req);
  if (!user || user.role !== "vet") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = await getDb();
  const row = await db
    .prepare("SELECT value FROM settings WHERE key = 'availability'")
    .first<{ value: string }>();
  let availability;
  try {
    availability = row ? JSON.parse(row.value) : { weeklySchedule: {}, blockedDates: [] };
  } catch {
    availability = { weeklySchedule: {}, blockedDates: [] };
  }
  return NextResponse.json({ availability });
}

export async function POST(req: NextRequest) {
  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const user = await getSessionFromRequest(req);
  if (!user || user.role !== "vet")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    weeklySchedule?: Record<string, { enabled?: boolean; start?: string; end?: string }>;
    blockedDates?: string[];
  };

  // Validate shape before storing
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid availability data" }, { status: 400 });
  }
  if (body.blockedDates !== undefined && !Array.isArray(body.blockedDates)) {
    return NextResponse.json({ error: "Invalid blockedDates" }, { status: 400 });
  }

  const db = await getDb();
  await db
    .prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES ('availability', ?, unixepoch()) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()"
    )
    .bind(JSON.stringify(body))
    .run();
  return NextResponse.json({ ok: true });
}
