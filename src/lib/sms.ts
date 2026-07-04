function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (phone.startsWith("+")) return phone;
  return `+${digits}`;
}

function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

export async function sendSMS(phone: string, message: string): Promise<boolean> {
  if (!phone || !isValidPhone(phone)) return false;

  const accountSid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const apiKeySid = process.env.TWILIO_API_KEY_SID ?? "";
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET ?? "";
  const from = process.env.TWILIO_FROM_NUMBER ?? "";

  if (!accountSid || !apiKeySid || !apiKeySecret || !from) return false;

  const formatted = formatPhoneNumber(phone);
  const credentials = btoa(`${apiKeySid}:${apiKeySecret}`);

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: formatted, From: from, Body: message }).toString(),
      }
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[sendSMS] Twilio error", res.status, errText);
    }
    return res.ok;
  } catch (err) {
    console.error("[sendSMS] fetch error", err);
    return false;
  }
}
