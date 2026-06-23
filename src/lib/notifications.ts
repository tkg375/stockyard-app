import { sendSMS } from "./sms";
import { sendEmail, wrapInEmailTemplate } from "./email";
import { format, parse } from "date-fns";

function h(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Strip CR/LF to prevent email header injection in subject lines
function subj(s: string): string {
  return s.replace(/[\r\n]/g, "").substring(0, 200);
}

export interface ConsultationData {
  petName: string;
  petType: string;
  concern: string;
  date: string;
  time: string;
  userName: string;
  userEmail: string;
  userPhone?: string;
  amountCents?: number;
  last4?: string;
  paymentIntentId?: string;
  joinUrl?: string; // guest token URL; falls back to dashboard if omitted
}

export interface VetData {
  name: string;
  email: string;
  phone: string;
}

const MANAGE_URL = "https://stockyardanimalhealth.com/manage";
const VET_MANAGE_URL = "https://stockyardanimalhealth.com/vet-dashboard";

function formatTime(time: string): string {
  try { return format(parse(time, "HH:mm", new Date()), "h:mm a"); }
  catch { return time; }
}

function formatDate(dateStr: string): string {
  try { return format(parse(dateStr, "yyyy-MM-dd", new Date()), "EEEE, MMMM d, yyyy"); }
  catch { return dateStr; }
}

// ─── Confirmation ────────────────────────────────────────────────────────────

export async function sendConfirmationNotifications(
  c: ConsultationData,
  vet: VetData
): Promise<{ customer: boolean; vet: boolean }> {
  const ft = formatTime(c.time);
  const fd = formatDate(c.date);

  const [cs, ce, vs, ve] = await Promise.all([
    sendSMS(c.userPhone ?? "", `Stockyard Animal Health: Your consultation for ${c.petName} is confirmed for ${fd} at ${ft} EST. Dr. McMillen will connect with you soon!`),
    sendEmail({
      to: c.userEmail,
      subject: subj(`Consultation Confirmed - ${c.petName}`),
      htmlBody: wrapInEmailTemplate(`
        <h2 style="color:#1a6a6a;margin:0 0 20px 0;">Consultation Confirmed!</h2>
        <p>Thank you for booking with Dr. Meleah McMillen. Your appointment details:</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;">
          <tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;width:40%;">Customer</td><td style="padding:10px;background:#f8f8f8;">${h(c.userName)}</td></tr>
          <tr><td style="padding:10px;font-weight:bold;">Pet</td><td style="padding:10px;">${h(c.petName)} (${h(c.petType)})</td></tr>
          <tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;">Date</td><td style="padding:10px;background:#f8f8f8;">${h(fd)}</td></tr>
          <tr><td style="padding:10px;font-weight:bold;">Time</td><td style="padding:10px;">${h(ft)} EST</td></tr>
          <tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;">Concern</td><td style="padding:10px;background:#f8f8f8;">${h(c.concern)}</td></tr>
          ${c.amountCents !== undefined ? `<tr><td style="padding:10px;font-weight:bold;">Amount Charged</td><td style="padding:10px;">$${(c.amountCents / 100).toFixed(2)}</td></tr>` : ""}
          ${c.last4 ? `<tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;">Card</td><td style="padding:10px;background:#f8f8f8;">ending in ${h(c.last4)}</td></tr>` : ""}
          ${c.paymentIntentId ? `<tr><td style="padding:10px;font-weight:bold;">Payment ID</td><td style="padding:10px;font-family:monospace;font-size:13px;">${h(c.paymentIntentId)}</td></tr>` : ""}
        </table>
        <div style="background:#fff8e1;border-left:4px solid #ffc107;padding:15px;margin:20px 0;">
          <p style="margin:0;color:#856404;"><strong>Important:</strong> Please have ${h(c.petName)} ready during the video consultation.</p>
        </div>
        <div style="background:#f0f4ff;border-left:4px solid #4a6cf7;padding:20px;margin:20px 0;">
          <h3 style="color:#2d3a8c;margin:0 0 10px;">Next Steps</h3>
          <p style="margin:0 0 10px;">At your appointment time, use this link to join your video call:</p>
          <a href="${c.joinUrl ?? MANAGE_URL}" style="color:#4a6cf7;font-weight:bold;">${c.joinUrl ?? MANAGE_URL}</a>
        </div>`),
      textBody: `Consultation confirmed for ${c.petName} on ${fd} at ${ft} EST.\nConcern: ${c.concern}${c.amountCents !== undefined ? `\nAmount charged: $${(c.amountCents / 100).toFixed(2)}` : ""}${c.last4 ? ` to card ending in ${c.last4}` : ""}${c.paymentIntentId ? `\nPayment ID: ${c.paymentIntentId}` : ""}\n\nJoin your appointment here:\n${c.joinUrl ?? MANAGE_URL}`,
    }),
    sendSMS(vet.phone, `New booking: ${c.userName} - ${c.petName} (${c.petType}) on ${c.date} at ${ft} EST. Concern: ${c.concern.substring(0, 80)}`),
    sendEmail({
      to: vet.email,
      subject: subj(`New Consultation - ${c.petName} (${c.petType})`),
      htmlBody: wrapInEmailTemplate(`
        <h2 style="color:#1a6a6a;margin:0 0 20px 0;">New Consultation Booked</h2>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;">
          <tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;width:40%;">Customer</td><td style="padding:10px;background:#f8f8f8;">${h(c.userName)}</td></tr>
          <tr><td style="padding:10px;font-weight:bold;">Email</td><td style="padding:10px;">${h(c.userEmail)}</td></tr>
          <tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;">Phone</td><td style="padding:10px;background:#f8f8f8;">${h(c.userPhone ?? "N/A")}</td></tr>
          <tr><td style="padding:10px;font-weight:bold;">Pet</td><td style="padding:10px;">${h(c.petName)} (${h(c.petType)})</td></tr>
          <tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;">Date</td><td style="padding:10px;background:#f8f8f8;">${h(fd)}</td></tr>
          <tr><td style="padding:10px;font-weight:bold;">Time</td><td style="padding:10px;">${h(ft)} EST</td></tr>
        </table>
        <div style="background:#e3f2fd;border-left:4px solid #2196f3;padding:15px;margin:20px 0;">
          <p style="margin:0;color:#0d47a1;"><strong>Concern:</strong><br>${h(c.concern)}</p>
        </div>`),
      textBody: `New booking:\nCustomer: ${c.userName} | ${c.userEmail} | ${c.userPhone ?? "N/A"}\nPet: ${c.petName} (${c.petType})\nDate: ${fd} at ${ft} EST\nConcern: ${c.concern}`,
    }),
  ]);

  return { customer: cs || ce, vet: vs || ve };
}

// ─── Appointment reminder ─────────────────────────────────────────────────────

export async function sendAppointmentNotifications(
  c: ConsultationData,
  vet: VetData
): Promise<{ customer: boolean; vet: boolean }> {
  const joinUrl = c.joinUrl ?? MANAGE_URL;
  const joinLabel = c.joinUrl ? "Join My Appointment →" : "Join Your Appointment →";
  const [cs, ce, vs, ve] = await Promise.all([
    sendSMS(c.userPhone ?? "", `Stockyard Animal Health: Your consultation for ${c.petName} starts in 15 minutes! Use your join link: ${joinUrl}`),
    sendEmail({
      to: c.userEmail,
      subject: subj(`Your Appointment is Almost Here - ${c.petName}`),
      htmlBody: wrapInEmailTemplate(`
        <h2 style="color:#1a6a6a;margin:0 0 20px 0;">Almost Time for Your Appointment!</h2>
        <p>Your consultation for <strong>${h(c.petName)}</strong> starts in about 15 minutes.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;">
          <tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;width:40%;">Pet</td><td style="padding:10px;background:#f8f8f8;">${h(c.petName)} (${h(c.petType)})</td></tr>
          <tr><td style="padding:10px;font-weight:bold;">Date</td><td style="padding:10px;">${h(formatDate(c.date))}</td></tr>
          <tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;">Time</td><td style="padding:10px;background:#f8f8f8;">${h(formatTime(c.time))} EST</td></tr>
        </table>
        <div style="text-align:center;margin:30px 0;">
          <a href="${joinUrl}" style="background:linear-gradient(135deg,#1a6a6a,#5BC4C4);color:white;padding:16px 40px;text-decoration:none;border-radius:8px;font-size:20px;font-weight:bold;display:inline-block;">${joinLabel}</a>
        </div>`),
      textBody: `Your consultation for ${c.petName} starts in about 15 minutes.\n\nUse this link to join:\n${joinUrl}`,
    }),
    sendSMS(vet.phone, `Appointment NOW: ${c.userName} - ${c.petName} (${c.petType}). Phone: ${c.userPhone ?? "N/A"}. Concern: ${c.concern.substring(0, 60)}`),
    sendEmail({
      to: vet.email,
      subject: subj(`Appointment NOW - ${c.userName} / ${c.petName}`),
      htmlBody: wrapInEmailTemplate(`
        <h2 style="color:#1a6a6a;margin:0 0 20px 0;">Appointment Starting Now</h2>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;">
          <tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;width:40%;">Customer</td><td style="padding:10px;background:#f8f8f8;">${h(c.userName)}</td></tr>
          <tr><td style="padding:10px;font-weight:bold;">Phone</td><td style="padding:10px;font-size:18px;"><strong>${h(c.userPhone ?? "N/A")}</strong></td></tr>
          <tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;">Email</td><td style="padding:10px;background:#f8f8f8;">${h(c.userEmail)}</td></tr>
          <tr><td style="padding:10px;font-weight:bold;">Pet</td><td style="padding:10px;">${h(c.petName)} (${h(c.petType)})</td></tr>
        </table>
        <div style="background:#e3f2fd;border-left:4px solid #2196f3;padding:15px;margin:20px 0;">
          <p style="margin:0;color:#0d47a1;"><strong>Concern:</strong><br>${h(c.concern)}</p>
        </div>`),
      textBody: `Appointment NOW:\nCustomer: ${c.userName} | ${c.userPhone ?? "N/A"} | ${c.userEmail}\nPet: ${c.petName} (${c.petType})\nConcern: ${c.concern}`,
    }),
  ]);

  return { customer: cs || ce, vet: vs || ve };
}

// ─── Consultation started (video link) ───────────────────────────────────────

export async function sendVideoLinkNotification(
  consultationId: string,
  c: { petName: string; userEmail: string; userPhone?: string; joinUrl?: string }
): Promise<{ sms: boolean; email: boolean }> {
  const joinUrl = c.joinUrl ?? MANAGE_URL;
  const [sms, email] = await Promise.all([
    c.userPhone
      ? sendSMS(c.userPhone, `Stockyard Animal Health: Dr. McMillen is ready for ${c.petName}'s consultation! Join now: ${joinUrl}`)
      : Promise.resolve(false),
    sendEmail({
      to: c.userEmail,
      subject: subj(`Dr. McMillen is Ready — Join ${c.petName}'s Consultation Now`),
      htmlBody: wrapInEmailTemplate(`
        <h2 style="color:#1a6a6a;margin:0 0 16px 0;">Dr. McMillen is Ready for You!</h2>
        <p>Your telehealth consultation for <strong>${h(c.petName)}</strong> is starting now.</p>
        <div style="text-align:center;margin:30px 0;">
          <a href="${joinUrl}" style="background:linear-gradient(135deg,#1a6a6a,#5BC4C4);color:white;padding:18px 44px;text-decoration:none;border-radius:10px;font-size:20px;font-weight:bold;display:inline-block;">Join Video Call →</a>
        </div>
        <p style="color:#888;font-size:0.85rem;text-align:center;">If the button doesn't work, copy this link into your browser:<br><a href="${joinUrl}" style="color:#1a6a6a;">${joinUrl}</a></p>`),
      textBody: `Dr. McMillen is ready for ${c.petName}'s consultation!\n\nJoin now: ${joinUrl}`,
    }),
  ]);
  return { sms: sms as boolean, email };
}

// ─── Payment failed ───────────────────────────────────────────────────────────

export async function sendPaymentFailedNotification(c: {
  petName: string;
  petType: string;
  date: string;
  time: string;
  userName: string;
  userEmail: string;
  userPhone?: string;
}): Promise<{ sms: boolean; email: boolean }> {
  const [sms, email] = await Promise.all([
    sendSMS(c.userPhone ?? "", `Stockyard Animal Health: Your payment for ${c.petName}'s consultation on ${c.date} was declined. Please contact us at stockyardanimalhealth@gmail.com for assistance.`),
    sendEmail({
      to: c.userEmail,
      subject: subj(`Action Required: Payment Failed for ${c.petName}'s Consultation`),
      htmlBody: wrapInEmailTemplate(`
        <h2>Payment Update Required</h2>
        <p>Hi ${h(c.userName || "there")},</p>
        <p>We were unable to process your payment for your upcoming consultation:</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;">
          <tr><td style="padding:10px;border:1px solid #ddd;font-weight:bold;">Pet</td><td style="padding:10px;border:1px solid #ddd;">${h(c.petName)} (${h(c.petType)})</td></tr>
          <tr><td style="padding:10px;border:1px solid #ddd;font-weight:bold;">Date</td><td style="padding:10px;border:1px solid #ddd;">${h(c.date)}</td></tr>
          <tr><td style="padding:10px;border:1px solid #ddd;font-weight:bold;">Time</td><td style="padding:10px;border:1px solid #ddd;">${h(c.time)} EST</td></tr>
        </table>
        <p><strong>Please update your payment method as soon as possible.</strong></p>
        <p>Please contact us at <a href="mailto:stockyardanimalhealth@gmail.com" style="color:#1a6a6a;">stockyardanimalhealth@gmail.com</a> and we will work with you to resolve the payment.</p>`),
      textBody: `Hi ${c.userName},\n\nYour payment for ${c.petName} (${c.date} at ${c.time} EST) was declined.\n\nPlease contact us at stockyardanimalhealth@gmail.com and we will help resolve this.`,
    }),
  ]);
  return { sms, email };
}

// ─── Overdue appointment reminder (vet only, daily) ──────────────────────────

export interface OverdueConsultation {
  id: string;
  userName: string;
  userEmail: string;
  userPhone: string | null;
  petName: string;
  petType: string;
  concern: string;
  date: string;
  time: string;
  status: string;
}

export async function sendOverdueReminderToVet(
  consultations: OverdueConsultation[],
  vet: VetData
): Promise<boolean> {
  if (!consultations.length) return false;

  const rows = consultations.map(c => `
    <tr>
      <td style="padding:10px;border:1px solid #ddd;">${h(formatDate(c.date))} at ${h(formatTime(c.time))} EST</td>
      <td style="padding:10px;border:1px solid #ddd;">${h(c.userName)}</td>
      <td style="padding:10px;border:1px solid #ddd;">${h(c.petName)} (${h(c.petType)})</td>
      <td style="padding:10px;border:1px solid #ddd;">${h(c.concern.substring(0, 80))}${c.concern.length > 80 ? "…" : ""}</td>
      <td style="padding:10px;border:1px solid #ddd;">${h(c.userEmail)}${c.userPhone ? `<br>${h(c.userPhone)}` : ""}</td>
    </tr>`).join("");

  const count = consultations.length;
  const subject = `Action Required: ${count} Overdue Appointment${count > 1 ? "s" : ""} Awaiting Completion`;

  return sendEmail({
    to: vet.email,
    subject,
    htmlBody: wrapInEmailTemplate(`
      <h2 style="color:#c0392b;margin:0 0 10px 0;">&#9888; Overdue Appointments</h2>
      <p>The following ${count > 1 ? `${count} appointments have` : "appointment has"} passed their scheduled time and still need to be completed or cancelled.</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;">
        <thead>
          <tr style="background:#1a6a6a;color:white;">
            <th style="padding:10px;text-align:left;">Scheduled Time</th>
            <th style="padding:10px;text-align:left;">Customer</th>
            <th style="padding:10px;text-align:left;">Pet</th>
            <th style="padding:10px;text-align:left;">Concern</th>
            <th style="padding:10px;text-align:left;">Contact</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="text-align:center;margin:30px 0;">
        <a href="${VET_MANAGE_URL}" style="background-color:#c0392b;color:white;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">Go to Vet Dashboard &rarr;</a>
      </div>
      <p style="color:#888;font-size:13px;">You will receive this reminder daily until each appointment is marked complete or cancelled.</p>`),
    textBody: `OVERDUE APPOINTMENTS (${count})\n\n` +
      consultations.map(c => `• ${formatDate(c.date)} at ${formatTime(c.time)} EST — ${c.userName} | ${c.petName} (${c.petType})\n  ${c.userEmail}${c.userPhone ? ` | ${c.userPhone}` : ""}\n  ${c.concern}`).join("\n\n") +
      `\n\nManage at: ${VET_MANAGE_URL}`,
  });
}

// ─── Cancellation ────────────────────────────────────────────────────────────

export async function sendCancellationNotifications(
  c: ConsultationData & { refunded: boolean; refundId?: string | null },
  vet: VetData
): Promise<{ customer: boolean; vet: boolean }> {
  const ft = formatTime(c.time);
  const fd = formatDate(c.date);

  const paymentRows = `
    ${c.amountCents !== undefined ? `<tr><td style="padding:10px;font-weight:bold;">Amount</td><td style="padding:10px;">$${(c.amountCents / 100).toFixed(2)}</td></tr>` : ""}
    ${c.last4 ? `<tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;">Card</td><td style="padding:10px;background:#f8f8f8;">ending in ${h(c.last4)}</td></tr>` : ""}
    ${c.paymentIntentId ? `<tr><td style="padding:10px;font-weight:bold;">Payment ID</td><td style="padding:10px;font-family:monospace;font-size:13px;">${h(c.paymentIntentId)}</td></tr>` : ""}
    ${c.refundId ? `<tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;">Refund ID</td><td style="padding:10px;background:#f8f8f8;font-family:monospace;font-size:13px;">${h(c.refundId)}</td></tr>` : ""}
  `;

  const refundNote = c.refunded
    ? `<div style="background:#e8f5e9;border-left:4px solid #4caf50;padding:15px;margin:20px 0;">
        <p style="margin:0 0 8px 0;color:#2e7d32;font-weight:bold;">&#10003; Payment Cancelled &amp; Refund Initiated</p>
        <p style="margin:0;color:#2e7d32;">Your payment has been cancelled and a refund has been issued to your card ending in ${c.last4 ? h(c.last4) : "your card"}.</p>
      </div>
      <div style="background:#fff3cd;border-left:4px solid #ffc107;padding:15px;margin:20px 0;">
        <p style="margin:0;color:#856404;font-size:13px;"><strong>Please note:</strong> While your refund has been processed on our end, your bank may hold the funds for up to 10 business days before they appear in your account. This is a standard banking process and is outside of our control. If you have questions, please contact your card issuer.</p>
      </div>`
    : `<div style="background:#fff3cd;border-left:4px solid #ffc107;padding:15px;margin:20px 0;">
        <p style="margin:0;color:#856404;">Your appointment has been cancelled. No charge was applied.</p>
      </div>`;

  const [cs, ce, vs, ve] = await Promise.all([
    sendSMS(c.userPhone ?? "", `Stockyard Animal Health: Your consultation for ${c.petName} on ${fd} at ${ft} EST has been cancelled.${c.refunded ? " A refund has been issued — your bank may take up to 10 business days to process it." : ""}`),
    sendEmail({
      to: c.userEmail,
      subject: subj(`Consultation Cancelled - ${c.petName}`),
      htmlBody: wrapInEmailTemplate(`
        <h2 style="color:#c0392b;margin:0 0 20px 0;">Consultation Cancelled</h2>
        <p>Hi ${h(c.userName)}, your consultation has been cancelled. Here are the details:</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;">
          <tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;width:40%;">Customer</td><td style="padding:10px;background:#f8f8f8;">${h(c.userName)}</td></tr>
          <tr><td style="padding:10px;font-weight:bold;">Pet</td><td style="padding:10px;">${h(c.petName)} (${h(c.petType)})</td></tr>
          <tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;">Date</td><td style="padding:10px;background:#f8f8f8;">${h(fd)}</td></tr>
          <tr><td style="padding:10px;font-weight:bold;">Time</td><td style="padding:10px;">${h(ft)} EST</td></tr>
          ${paymentRows}
        </table>
        ${refundNote}
        <p>If you have any questions, please contact us at <a href="mailto:stockyardanimalhealth@gmail.com">stockyardanimalhealth@gmail.com</a>.</p>`),
      textBody: `Consultation cancelled for ${c.petName} on ${fd} at ${ft} EST.${c.amountCents !== undefined ? `\nAmount: $${(c.amountCents / 100).toFixed(2)}` : ""}${c.last4 ? ` (card ending in ${c.last4})` : ""}${c.paymentIntentId ? `\nPayment ID: ${c.paymentIntentId}` : ""}${c.refundId ? `\nRefund ID: ${c.refundId}` : ""}${c.refunded ? "\n\nA refund has been issued. Your bank may take up to 10 business days to process it." : ""}`,
    }),
    sendSMS(vet.phone, `Cancellation: ${c.userName} - ${c.petName} on ${c.date} at ${ft} EST.${c.refunded ? " Refunded." : ""}`),
    sendEmail({
      to: vet.email,
      subject: subj(`Consultation Cancelled - ${c.petName} (${c.userName})`),
      htmlBody: wrapInEmailTemplate(`
        <h2 style="color:#c0392b;margin:0 0 20px 0;">Consultation Cancelled</h2>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;">
          <tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;width:40%;">Customer</td><td style="padding:10px;background:#f8f8f8;">${h(c.userName)}</td></tr>
          <tr><td style="padding:10px;font-weight:bold;">Email</td><td style="padding:10px;">${h(c.userEmail)}</td></tr>
          <tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;">Pet</td><td style="padding:10px;background:#f8f8f8;">${h(c.petName)} (${h(c.petType)})</td></tr>
          <tr><td style="padding:10px;font-weight:bold;">Date</td><td style="padding:10px;">${h(fd)}</td></tr>
          <tr><td style="padding:10px;background:#f8f8f8;font-weight:bold;">Time</td><td style="padding:10px;background:#f8f8f8;">${h(ft)} EST</td></tr>
          ${paymentRows}
        </table>
        <p style="color:${c.refunded ? "#2e7d32" : "#856404"};font-weight:bold;">${c.refunded ? "&#10003; Payment refunded" : "No charge was applied"}</p>`),
      textBody: `Cancellation:\nCustomer: ${c.userName} | ${c.userEmail}\nPet: ${c.petName} (${c.petType})\nDate: ${fd} at ${ft} EST${c.amountCents !== undefined ? `\nAmount: $${(c.amountCents / 100).toFixed(2)}` : ""}${c.refunded ? "\nStatus: Refunded" : "\nStatus: No charge"}`,
    }),
  ]);

  return { customer: cs || ce, vet: vs || ve };
}

// ─── Discharge summary email ─────────────────────────────────────────────────

const AGREEMENT_LABELS: Record<string, string> = {
  telehealth: "Telehealth Informed Consent",
  vcpr: "VCPR & Florida Telehealth Disclosure",
  emergency: "Emergency Care Disclosure",
  terms: "Terms of Service & Payment Policy",
  privacy: "Privacy Policy",
  records: "Medical Record & Follow-Up Disclosure",
  controlled: "Controlled Substance Policy",
  jurisdiction: "Multi-State Jurisdiction Disclosure",
  prescription: "Acknowledgment of Right to Written Prescription (s. 474.224, F.S.)",
};

function buildAgreementsHtml(opts: {
  clientName: string;
  signedAt: number | null;
  agreements: Record<string, boolean>;
  petName: string;
  consultationDate: string;
}): string {
  const signedDate = opts.signedAt
    ? new Date(opts.signedAt * 1000).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" }) + " EST"
    : "Date not recorded";

  const rows = Object.entries(AGREEMENT_LABELS)
    .map(([key, label]) => {
      const agreed = opts.agreements[key] === true;
      return `<tr>
        <td style="padding:10px 14px;border-bottom:1px solid #e8f0ee;font-size:13px;color:#1a6a6a;">${label}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e8f0ee;text-align:center;font-size:14px;">${agreed ? "✓" : "✗"}</td>
      </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Signed Agreements — Stockyard Animal Health</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1a6a6a; max-width: 700px; margin: 40px auto; padding: 0 24px; }
    h1 { font-size: 20px; border-bottom: 3px solid #5BC4C4; padding-bottom: 10px; }
    h2 { font-size: 14px; color: #555; font-weight: normal; margin-top: 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th { background: #1a6a6a; color: #fff; padding: 10px 14px; text-align: left; font-size: 13px; }
    .footer { margin-top: 32px; font-size: 11px; color: #888; border-top: 1px solid #ddd; padding-top: 14px; }
  </style>
</head>
<body>
  <h1>Signed Patient Agreements</h1>
  <h2>Stockyard Animal Health LLC &nbsp;·&nbsp; Dr. Meleah McMillen, DVM (FL License #VM16794)</h2>
  <p style="font-size:13px;margin:0 0 4px 0;"><strong>Client:</strong> ${h(opts.clientName)}</p>
  <p style="font-size:13px;margin:0 0 4px 0;"><strong>Patient:</strong> ${h(opts.petName)}</p>
  <p style="font-size:13px;margin:0 0 4px 0;"><strong>Consultation Date:</strong> ${h(opts.consultationDate)}</p>
  <p style="font-size:13px;margin:0;"><strong>Agreements Signed:</strong> ${signedDate}</p>
  <table>
    <thead>
      <tr>
        <th style="width:85%;">Agreement</th>
        <th style="width:15%;text-align:center;">Accepted</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">
    This document was generated automatically by the Stockyard Animal Health telehealth platform.<br>
    The client electronically acknowledged each agreement by checking the corresponding box prior to booking.<br>
    stockyardanimalhealth@gmail.com
  </div>
</body>
</html>`;
}

export async function sendDischargeEmail(c: {
  petName: string;
  petType: string;
  userName: string;
  userEmail: string;
  userPhone?: string;
  date: string;
  time: string;
  summary: string;
  agreements?: {
    json: Record<string, boolean>;
    signedAt: number | null;
    clientName: string;
  };
}): Promise<boolean> {
  const fd = formatDate(c.date);
  const ft = formatTime(c.time);

  // Convert the markdown-style summary (bold headers, numbered lists) to HTML
  const summaryHtml = c.summary
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      if (/^\d+\./.test(trimmed)) return `<li style="margin-bottom:6px;">${h(trimmed.replace(/^\d+\.\s*/, ""))}</li>`;
      return `<p style="margin:0 0 10px 0;">${trimmed.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`;
    })
    .join("\n")
    .replace(/(<li[\s\S]*?<\/li>\n?)+/g, (match) => `<ol style="padding-left:20px;margin:0 0 14px 0;">${match}</ol>`);

  return sendEmail({
    to: c.userEmail,
    subject: subj(`Visit Summary for ${c.petName} — Stockyard Animal Health`),
    htmlBody: wrapInEmailTemplate(`
      <h2 style="color:#1a6a6a;margin:0 0 8px 0;">Visit Summary</h2>
      <p style="color:#888;margin:0 0 24px 0;font-size:0.9rem;">${h(fd)} &middot; ${h(ft)} EST &middot; ${h(c.petName)} (${h(c.petType)})</p>

      <p>Hi ${h(c.userName)},</p>
      <p>Thank you for your consultation with Dr. Meleah McMillen today. Below is a summary of ${h(c.petName)}'s visit in plain language, along with recommended next steps.</p>

      <div style="background:#f0f9f9;border-left:4px solid #5BC4C4;border-radius:0 8px 8px 0;padding:20px 24px;margin:24px 0;">
        ${summaryHtml}
      </div>

      <div style="background:#fff3cd;border-left:4px solid #ffc107;padding:14px 18px;border-radius:0 8px 8px 0;margin:20px 0;">
        <p style="margin:0;font-size:0.85rem;color:#856404;">
          <strong>Important:</strong> If ${h(c.petName)}'s condition worsens, they experience difficulty breathing, collapse, seizures, severe pain, or any other emergency — seek immediate in-person veterinary care.
          UF Small Animal Emergency: <strong>(352) 392-2235</strong> &middot;
          UF Large Animal Emergency: <strong>(352) 392-2229</strong><br>
          2089 SW 16th Ave, Gainesville, FL 32608
        </p>
      </div>

      <div style="background:#f8f8f8;border-radius:8px;padding:16px 20px;margin:20px 0;font-size:0.85rem;color:#666;">
        <p style="margin:0 0 6px 0;"><strong>Questions about this visit?</strong></p>
        <p style="margin:0;">Contact Stockyard Animal Health at
          <a href="mailto:stockyardanimalhealth@gmail.com" style="color:#1a6a6a;">stockyardanimalhealth@gmail.com</a>.
          You can also manage your appointments at
          <a href="https://stockyardanimalhealth.com/manage" style="color:#1a6a6a;">stockyardanimalhealth.com/manage</a>.
        </p>
      </div>

      <p style="font-size:0.8rem;color:#aaa;margin:24px 0 0;">
        This summary was prepared by Dr. Meleah McMillen, DVM (FL License #VM16794) and approved before sending.
        Stockyard Animal Health LLC &middot; stockyardanimalhealth@gmail.com
      </p>`),
    textBody: `Visit Summary for ${c.petName} — ${fd}\n\n${c.summary}\n\n---\nIf ${c.petName}'s condition worsens or you have an emergency, contact:\nUF Small Animal Emergency: (352) 392-2235\nUF Large Animal Emergency: (352) 392-2229\n2089 SW 16th Ave, Gainesville, FL 32608\n\nQuestions? stockyardanimalhealth@gmail.com\nManage your appointment: https://stockyardanimalhealth.com/manage`,
    attachment: c.agreements ? {
      filename: `Signed_Agreements_${c.petName.replace(/\s+/g, "_")}_${c.date}.html`,
      contentType: "text/html",
      content: Buffer.from(buildAgreementsHtml({
        clientName: c.agreements.clientName,
        signedAt: c.agreements.signedAt,
        agreements: c.agreements.json,
        petName: c.petName,
        consultationDate: formatDate(c.date),
      })).toString("base64"),
    } : undefined,
  });
}

// ─── Message notification ─────────────────────────────────────────────────────

export async function sendMessageNotification(opts: {
  toEmail: string;
  toType: "vet" | "customer";
  senderName: string;
  petName: string;
  messageText: string;
}): Promise<boolean> {
  const preview = opts.messageText.length > 100 ? opts.messageText.substring(0, 100) + "..." : opts.messageText;
  const dashUrl = opts.toType === "vet" ? VET_MANAGE_URL : MANAGE_URL;
  const subject = subj(opts.toType === "vet"
    ? `New Message from ${opts.senderName} about ${opts.petName}`
    : `Dr. McMillen replied about ${opts.petName}`);
  const heading = opts.toType === "vet" ? "New Message Received" : "New Message from Dr. McMillen";

  return sendEmail({
    to: opts.toEmail,
    subject,
    htmlBody: wrapInEmailTemplate(`
      <h2 style="color:#1a6a6a;margin:0 0 20px 0;">${heading}</h2>
      <div style="background:#f8f8f8;padding:15px 20px;border-radius:8px;margin:20px 0;border-left:4px solid #5BC4C4;">
        <p style="margin:0;font-style:italic;">"${h(preview)}"</p>
      </div>
      <div style="text-align:center;margin:30px 0;">
        <a href="${dashUrl}" style="background-color:#2c5530;color:white;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">View &amp; Reply</a>
      </div>`),
    textBody: `${heading}\n\n"${preview}"\n\nView and reply at: ${dashUrl}`,
  });
}
