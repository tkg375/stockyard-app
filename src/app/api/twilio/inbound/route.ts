export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

// Twilio sends inbound SMS here. We're outbound-only, so just acknowledge.
// Twilio automatically handles STOP/UNSTOP opt-out compliance at the carrier level.
export async function POST() {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { "Content-Type": "text/xml" },
  });
}
