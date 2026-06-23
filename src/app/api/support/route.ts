export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { checkOrigin } from "@/lib/csrf";

export async function POST(req: NextRequest) {
  const originErr = checkOrigin(req);
  if (originErr) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name, email, issue } = await req.json() as { name?: string; email?: string; issue?: string };

  if (!name?.trim() || !email?.trim() || !issue?.trim()) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }
  if (issue.trim().length < 10) {
    return NextResponse.json({ error: "Please describe your issue in more detail." }, { status: 400 });
  }

  const sent = await sendEmail({
    to: "stockyardanimalhealth@gmail.com",
    subject: `Support Request from ${name.trim()}`,
    htmlBody: `
      <h2 style="color:#1a6a6a;margin:0 0 20px 0;">Customer Support Request</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;width:30%;">Name</td><td style="padding:10px;background:#f8f8f8;">${name.trim()}</td></tr>
        <tr><td style="padding:10px;font-weight:bold;">Email</td><td style="padding:10px;"><a href="mailto:${email.trim()}">${email.trim()}</a></td></tr>
      </table>
      <div style="background:#f0f9f9;border-left:4px solid #5BC4C4;padding:16px 20px;border-radius:0 8px 8px 0;">
        <p style="margin:0 0 6px 0;font-weight:bold;color:#1a6a6a;">Issue Description:</p>
        <p style="margin:0;white-space:pre-wrap;color:#333;">${issue.trim()}</p>
      </div>
      <p style="margin-top:20px;color:#888;font-size:0.85rem;">Reply directly to this email to respond to the customer.</p>
    `,
    textBody: `Support Request\n\nName: ${name.trim()}\nEmail: ${email.trim()}\n\nIssue:\n${issue.trim()}`,
    replyTo: email.trim(),
  });

  if (!sent) return NextResponse.json({ error: "Failed to send. Please email us directly at stockyardanimalhealth@gmail.com." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
