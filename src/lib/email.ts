import { AwsClient } from "aws4fetch";

const FROM_EMAIL = "hello@stockyardanimalhealth.com";
const REPLY_TO_EMAIL = "stockyardanimalhealth@gmail.com";
const FROM_NAME = "Stockyard Animal Health";

interface EmailOptions {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  replyTo?: string;
  attachment?: {
    filename: string;
    contentType: string;
    content: string; // base64-encoded
  };
}

function getAwsClient(): AwsClient {
  return new AwsClient({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
    region: process.env.AWS_REGION ?? "us-east-1",
    service: "email",
  });
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const { to, subject, htmlBody, textBody, attachment, replyTo } = options;
  if (!to) return false;

  // Use SendRawEmail when an attachment is present, otherwise use the simple API
  if (attachment) {
    return sendRawEmail({ to, subject, htmlBody, textBody, attachment, replyTo: replyTo ?? REPLY_TO_EMAIL });
  }

  const body = new URLSearchParams({
    Action: "SendEmail",
    Version: "2010-12-01",
    "Source": `${FROM_NAME} <${FROM_EMAIL}>`,
    "Destination.ToAddresses.member.1": to,
    "ReplyToAddresses.member.1": replyTo ?? REPLY_TO_EMAIL,
    "Message.Subject.Data": subject,
    "Message.Subject.Charset": "UTF-8",
    "Message.Body.Html.Data": htmlBody,
    "Message.Body.Html.Charset": "UTF-8",
    "Message.Body.Text.Data": textBody,
    "Message.Body.Text.Charset": "UTF-8",
  });

  try {
    const region = process.env.AWS_REGION ?? "us-east-1";
    const res = await getAwsClient().fetch(
      `https://email.${region}.amazonaws.com/`,
      { method: "POST", body: body.toString(), headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[sendEmail] SES error", res.status, errText);
    }
    return res.ok;
  } catch (err) {
    console.error("[sendEmail] fetch error", err);
    return false;
  }
}

async function sendRawEmail(options: Required<EmailOptions>): Promise<boolean> {
  const { to, subject, htmlBody, textBody, attachment } = options;
  const boundary = `----=_Part_${Date.now().toString(36)}`;
  const altBoundary = `----=_Alt_${Date.now().toString(36)}`;

  const rawMessage = [
    `From: ${FROM_NAME} <${FROM_EMAIL}>`,
    `To: ${to}`,
    `Reply-To: ${REPLY_TO_EMAIL}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    "",
    `--${altBoundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    textBody,
    "",
    `--${altBoundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    htmlBody,
    "",
    `--${altBoundary}--`,
    "",
    `--${boundary}`,
    `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
    `Content-Disposition: attachment; filename="${attachment.filename}"`,
    "Content-Transfer-Encoding: base64",
    "",
    // Split base64 into 76-char lines per MIME spec
    attachment.content.match(/.{1,76}/g)?.join("\r\n") ?? attachment.content,
    "",
    `--${boundary}--`,
  ].join("\r\n");

  const body = new URLSearchParams({
    Action: "SendRawEmail",
    Version: "2010-12-01",
    "Destinations.member.1": to,
    "RawMessage.Data": Buffer.from(rawMessage).toString("base64"),
  });

  try {
    const region = process.env.AWS_REGION ?? "us-east-1";
    const res = await getAwsClient().fetch(
      `https://email.${region}.amazonaws.com/`,
      { method: "POST", body: body.toString(), headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[sendRawEmail] SES error", res.status, errText);
    }
    return res.ok;
  } catch (err) {
    console.error("[sendRawEmail] fetch error", err);
    return false;
  }
}

export function wrapInEmailTemplate(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f0fafa;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
    <tr>
      <td style="padding:28px 40px;background:linear-gradient(135deg,#1a6a6a 0%,#5BC4C4 60%,#E8427A 100%);text-align:center;">
        <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:800;letter-spacing:-0.5px;">Stockyard Animal Health</h1>
        <p style="color:rgba(255,255,255,0.85);margin:5px 0 0 0;font-size:13px;">Professional Veterinary Telemedicine</p>
      </td>
    </tr>
    <tr><td style="padding:36px 40px;">${content}</td></tr>
    <tr>
      <td style="padding:20px 40px;background-color:#f0fafa;text-align:center;font-size:12px;color:#666;border-top:1px solid #c5e5e5;">
        <p style="margin:0;color:#1a6a6a;font-weight:600;">Stockyard Animal Health</p>
        <p style="margin:5px 0 0 0;">Professional Veterinary Telemedicine for Florida</p>
        <p style="margin:8px 0 0 0;">Mon–Fri: 5:30 PM–11:00 PM EST &nbsp;|&nbsp; Sat–Sun: 9:00 AM–11:00 PM EST</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
