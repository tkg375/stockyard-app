import type { Metadata } from "next";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Privacy Policy — Stockyard Animal Health",
  description: "Read the Stockyard Animal Health privacy policy. Learn how we collect, use, and protect your personal information and veterinary records.",
  alternates: { canonical: "https://stockyardanimalhealth.com/privacy-policy" },
  robots: { index: false, follow: false },
};

export default function PrivacyPolicyPage() {
  return (
    <div className="marketing-page">
      <SiteNav />
      <main>
        <header className="hero" style={{ minHeight: "30vh" }}>
          <div className="container" style={{ flex: 1, display: "flex", alignItems: "center" }}>
            <div className="hero-content">
              <h1>Privacy Policy</h1>
              <p className="hero-tagline">Last updated: May 25, 2026</p>
            </div>
          </div>
        </header>

        <section style={{ padding: "72px 0" }}>
          <div className="container" style={{ maxWidth: "760px" }}>
            <div style={{ lineHeight: 1.8, color: "#333", background: "#fff", borderRadius: "16px", padding: "40px", border: "1px solid #c5e5e5", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>1. Information We Collect</h2>
              <p style={{ marginBottom: "16px" }}>We collect information you provide directly, including your name, email address, phone number, physical address, and information about your animals. We also collect:</p>
              <ul style={{ paddingLeft: "24px", marginBottom: "24px" }}>
                <li>Payment information processed securely through Stripe</li>
                <li>Photos, videos, or descriptions of your animal&apos;s condition submitted during the booking process or consultation</li>
                <li>Electronic acknowledgment records, including the date, time, and name associated with agreements you accept during booking</li>
                <li>Consultation notes and SOAP records created by Dr. McMillen during or after your appointment</li>
                <li>Usage data collected through our platform</li>
              </ul>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>2. Electronic Consent and Agreement Records</h2>
              <p style={{ marginBottom: "24px" }}>Prior to each consultation, you will be asked to review and electronically acknowledge a series of required disclosures and agreements, including our Telehealth Consent, VCPR Disclosure, Emergency Care Acknowledgment, and others. Your acknowledgments — including your full name, the date and time of acceptance, and the specific agreements accepted — are recorded and stored securely in our system. These records are retained as part of your consultation file and may be attached to your discharge documentation.</p>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>3. How We Use Your Information</h2>
              <p style={{ marginBottom: "16px" }}>We use your information to:</p>
              <ul style={{ paddingLeft: "24px", marginBottom: "24px" }}>
                <li>Provide veterinary telemedicine consultation services</li>
                <li>Process payments and manage your booking</li>
                <li>Send appointment confirmations, reminders, and discharge summaries via email</li>
                <li>Generate AI-assisted discharge summaries reviewed and approved by Dr. McMillen before delivery (see Section 7)</li>
                <li>Communicate with you about your consultations and follow-up care</li>
                <li>Maintain required records of electronic agreements and consent</li>
                <li>Improve our platform and services</li>
                <li>Comply with legal obligations under Florida law</li>
              </ul>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>4. Information Sharing</h2>
              <p style={{ marginBottom: "24px" }}>We do not sell, trade, or rent your personal information to third parties. We may share information with trusted service providers who assist us in operating our platform — such as payment processors (Stripe), email delivery services (Amazon SES), and AI processing services (Google Gemini) — under strict confidentiality obligations. AI services are used solely to generate discharge summary drafts; no data is retained by the AI provider for training purposes beyond their standard policies. We may also disclose information when required by law.</p>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>5. Medical Records and Photos</h2>
              <p style={{ marginBottom: "24px" }}>Consultation notes, SOAP records, and animal health information stored on our platform are treated as confidential veterinary medical records. Photos and videos of your animal submitted during booking or consultation are used solely to support Dr. McMillen&apos;s clinical assessment. We retain these records to support continuity of care. You may request a copy of your records at any time by contacting us at stockyardanimalhealth@gmail.com.</p>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>6. Data Security</h2>
              <p style={{ marginBottom: "24px" }}>We implement industry-standard security measures to protect your personal information. All payment processing is handled by Stripe, a PCI DSS compliant payment processor. Video consultations are conducted over encrypted connections. All data is stored on Cloudflare&apos;s infrastructure using encrypted connections. However, no method of transmission over the internet is 100% secure, and telehealth communications carry inherent transmission risks. By using our services, you acknowledge and accept these risks.</p>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>7. AI-Generated Discharge Summaries</h2>
              <p style={{ marginBottom: "24px" }}>Following your consultation, Dr. McMillen may use an AI-assisted tool to generate a plain-language discharge summary based on the clinical notes from your appointment. This draft is reviewed, edited if necessary, and personally approved by Dr. McMillen before it is sent to you. The AI tool does not make clinical decisions and does not have access to your personal account — it only processes the clinical notes entered by Dr. McMillen. The approved discharge summary is sent to you via email and stored as part of your consultation record. The AI tool does not have access to your personal information beyond what is contained in those clinical notes.</p>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>8. SMS / Text Message Communications</h2>
              <p style={{ marginBottom: "16px" }}>If you opt in to SMS communications at the time of booking, Stockyard Animal Health may send you text messages related to your care, including:</p>
              <ul style={{ paddingLeft: "24px", marginBottom: "16px" }}>
                <li>Appointment confirmations and reminders</li>
                <li>Follow-up care notifications</li>
                <li>Account and booking updates</li>
              </ul>
              <p style={{ marginBottom: "16px" }}><strong>Consent:</strong> By checking the SMS opt-in box during registration, you expressly consent to receive text messages from Stockyard Animal Health at the phone number you provided. Consent is not a condition of purchase or use of our services.</p>
              <p style={{ marginBottom: "16px" }}><strong>Message frequency:</strong> Message frequency varies based on your appointment activity, typically 1–4 messages per appointment.</p>
              <p style={{ marginBottom: "16px" }}><strong>Message &amp; data rates:</strong> Standard message and data rates may apply depending on your mobile carrier plan.</p>
              <p style={{ marginBottom: "16px" }}><strong>Opt-out:</strong> You may opt out at any time by replying <strong>STOP</strong> to any text message you receive from us. After opting out, you will receive one final confirmation message and no further texts will be sent.</p>
              <p style={{ marginBottom: "16px" }}><strong>Help:</strong> For assistance, reply <strong>HELP</strong> to any message or contact us at <strong>stockyardanimalhealth@gmail.com</strong>.</p>
              <p style={{ marginBottom: "16px" }}><strong>No marketing texts:</strong> We do not send promotional or marketing text messages. All messages are transactional and directly related to your veterinary care.</p>
              <p style={{ marginBottom: "16px" }}><strong>No sharing:</strong> Your phone number and SMS consent status will never be sold or shared with third parties for marketing purposes.</p>
              <p style={{ marginBottom: "24px" }}>For more information, see our <a href="/sms-consent" style={{ color: "#1a6a6a" }}>SMS Consent Policy</a>.</p>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>9. Cookies</h2>
              <p style={{ marginBottom: "24px" }}>We use cookies and similar tracking technologies to maintain your session and improve your experience. You can control cookie settings through your browser settings.</p>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>10. Your Rights</h2>
              <p style={{ marginBottom: "24px" }}>You have the right to access, correct, or request deletion of your personal information. You may also request a copy of your signed agreement records or consultation history. To exercise these rights, please contact us at stockyardanimalhealth@gmail.com.</p>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>11. Children&apos;s Privacy</h2>
              <p style={{ marginBottom: "24px" }}>Our services are not directed to children under 13 years of age. We do not knowingly collect personal information from children under 13.</p>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>12. Changes to This Policy</h2>
              <p style={{ marginBottom: "24px" }}>We may update this Privacy Policy from time to time. We will notify you of any significant changes by email or through our platform. Your continued use of our services after such changes constitutes your acceptance of the updated policy.</p>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>13. Contact Us</h2>
              <p>If you have any questions about this Privacy Policy, please contact us at <strong>stockyardanimalhealth@gmail.com</strong>.</p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
