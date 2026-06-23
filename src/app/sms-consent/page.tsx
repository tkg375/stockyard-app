import type { Metadata } from "next";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "SMS Consent Policy — Stockyard Animal Health",
  description: "Learn how Stockyard Animal Health collects SMS consent and what text messages we send to clients.",
  alternates: { canonical: "https://stockyardanimalhealth.com/sms-consent" },
};

const section = (title: string, content: React.ReactNode) => (
  <div style={{ marginBottom: "28px" }}>
    <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.4rem", color: "#1a6a6a", marginBottom: "10px" }}>{title}</h2>
    {content}
  </div>
);

export default function SmsConsentPage() {
  return (
    <div className="marketing-page">
      <SiteNav />
      <main>
        <header className="hero" style={{ minHeight: "28vh" }}>
          <div className="container" style={{ flex: 1, display: "flex", alignItems: "center" }}>
            <div className="hero-content">
              <h1>SMS Consent Policy</h1>
              <p className="hero-tagline">Last updated: June 3, 2026</p>
            </div>
          </div>
        </header>

        <section style={{ padding: "72px 0" }}>
          <div className="container" style={{ maxWidth: "760px" }}>
            <div style={{ lineHeight: 1.8, color: "#333", background: "#fff", borderRadius: "16px", padding: "40px", border: "1px solid #c5e5e5", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>

              <p style={{ marginBottom: "28px", fontSize: "15px" }}>
                This SMS Consent Policy explains how <strong>Stockyard Animal Health</strong> collects consent to send text messages, what types of messages we send, and how you can opt out. This page serves as the proof of opt-in consent for our SMS program.
              </p>

              {section("Program Description", (
                <p style={{ marginBottom: 0 }}>
                  Stockyard Animal Health (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) sends transactional SMS messages to clients who have voluntarily opted in. These messages are related exclusively to your veterinary care and account activity — we do not send promotional or marketing text messages.
                </p>
              ))}

              {section("How We Collect Consent", (
                <>
                  <p style={{ marginBottom: "12px" }}>SMS consent is collected during the booking process on our website at <strong>stockyardanimalhealth.com/book</strong>. During booking, clients are presented with the following opt-in checkbox:</p>
                  <div style={{ background: "#f0fafa", border: "1px solid #b2dede", borderRadius: "10px", padding: "16px 20px", margin: "12px 0", fontSize: "14px" }}>
                    <strong>Opt-in language shown to users:</strong>
                    <p style={{ margin: "10px 0 0" }}>
                      &ldquo;I agree to receive appointment reminders and care notifications from Stockyard Animal Health via text message to the phone number provided. Message &amp; data rates may apply. Message frequency varies. Reply STOP to opt out or HELP for help. See our SMS Consent Policy, Privacy Policy, and Terms.&rdquo;
                    </p>
                  </div>
                  <p style={{ marginBottom: 0 }}>The checkbox is unchecked by default. Consent is entirely voluntary and is not required to book a consultation or use our services. The date and time of consent are recorded at booking.</p>
                </>
              ))}

              {section("Types of Messages We Send", (
                <>
                  <p style={{ marginBottom: "10px" }}>Clients who opt in may receive the following types of text messages:</p>
                  <ul style={{ paddingLeft: "24px", marginBottom: 0 }}>
                    <li>Appointment confirmation messages after booking a consultation</li>
                    <li>Appointment reminder messages before a scheduled consultation</li>
                    <li>Follow-up care notifications after a consultation</li>
                    <li>Account or booking status updates</li>
                  </ul>
                </>
              ))}

              {section("Message Frequency", (
                <p style={{ marginBottom: 0 }}>
                  Message frequency varies based on your appointment activity. Clients typically receive 1–4 text messages per appointment (confirmation, reminder, and follow-up).
                </p>
              ))}

              {section("Message & Data Rates", (
                <p style={{ marginBottom: 0 }}>
                  Standard message and data rates may apply depending on your mobile carrier and plan. Stockyard Animal Health does not charge for text messages beyond your carrier&apos;s standard rates.
                </p>
              ))}

              {section("How to Opt Out", (
                <>
                  <p style={{ marginBottom: "10px" }}>You may opt out of SMS messages at any time using any of the following methods:</p>
                  <ul style={{ paddingLeft: "24px", marginBottom: "10px" }}>
                    <li>Reply <strong>STOP</strong> to any text message from us</li>
                    <li>Contact us at <strong>stockyardanimalhealth@gmail.com</strong> to update your preferences</li>
                    <li>Contact us at <strong>stockyardanimalhealth@gmail.com</strong> and request to be removed</li>
                  </ul>
                  <p style={{ marginBottom: 0 }}>After opting out, you will receive one final confirmation message. No further SMS messages will be sent unless you opt in again.</p>
                </>
              ))}

              {section("Help", (
                <p style={{ marginBottom: 0 }}>
                  For assistance with SMS messages, reply <strong>HELP</strong> to any text message you receive, or contact us at <strong>stockyardanimalhealth@gmail.com</strong> or through our platform.
                </p>
              ))}

              {section("Sample Messages", (
                <div style={{ background: "#f8f8f8", border: "1px solid #ddd", borderRadius: "10px", padding: "16px 20px", fontSize: "14px" }}>
                  <p style={{ margin: "0 0 10px" }}><strong>Appointment confirmation:</strong><br />
                  Stockyard Animal Health: Your appointment with Dr. McMillen is confirmed for [Date] at [Time]. Reply STOP to opt out or HELP for help.</p>
                  <p style={{ margin: "0 0 10px" }}><strong>Appointment reminder:</strong><br />
                  Stockyard Animal Health: Reminder — your consultation with Dr. McMillen is tomorrow at [Time]. Join at stockyardanimalhealth.com. Reply STOP to opt out.</p>
                  <p style={{ margin: "0" }}><strong>Opt-in confirmation:</strong><br />
                  Stockyard Animal Health: You&apos;re confirmed for appointment reminders. Reply STOP to unsubscribe or HELP for help. Msg &amp; data rates may apply.</p>
                </div>
              ))}

              {section("No Sharing or Selling", (
                <p style={{ marginBottom: 0 }}>
                  Your phone number and SMS consent status will never be sold, rented, or shared with third parties for marketing or promotional purposes. Phone numbers are used solely to deliver the transactional messages described above.
                </p>
              ))}

              {section("Contact", (
                <p style={{ marginBottom: 0 }}>
                  For questions about this SMS Consent Policy, contact us at <strong>stockyardanimalhealth@gmail.com</strong>.
                  <br /><br />
                  See also: <a href="/privacy-policy" style={{ color: "#1a6a6a" }}>Privacy Policy</a> · <a href="/terms" style={{ color: "#1a6a6a" }}>Terms and Conditions</a>
                </p>
              ))}

            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
