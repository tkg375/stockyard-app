import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.redirect("https://stockyardanimalhealth.com/favicon.svg", { status: 301 });
}
