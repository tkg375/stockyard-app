import type { Metadata } from "next";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Terms and Conditions — Stockyard Animal Health",
  description: "Read the Stockyard Animal Health terms and conditions governing use of our Florida veterinary telemedicine platform.",
  alternates: { canonical: "https://stockyardanimalhealth.com/terms" },
  robots: { index: false, follow: false },
};

export default function TermsPage() {
  return (
    <div className="marketing-page">
      <SiteNav />
      <main>
        <header className="hero" style={{ minHeight: "30vh" }}>
          <div className="container" style={{ flex: 1, display: "flex", alignItems: "center" }}>
            <div className="hero-content">
              <h1>Terms and Conditions</h1>
              <p className="hero-tagline">Last updated: May 25, 2026</p>
            </div>
          </div>
        </header>

        <section style={{ padding: "72px 0" }}>
          <div className="container" style={{ maxWidth: "760px" }}>
            <div style={{ lineHeight: 1.8, color: "#333", background: "#fff", borderRadius: "16px", padding: "40px", border: "1px solid #c5e5e5", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>1. Acceptance of Terms</h2>
              <p style={{ marginBottom: "24px" }}>By booking or using the Stockyard Animal Health telemedicine platform, you agree to these Terms and Conditions. If you do not agree, please do not use our services.</p>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>2. Nature of Services</h2>
              <p style={{ marginBottom: "16px" }}>Stockyard Animal Health provides veterinary telemedicine consultations via live video with Dr. Meleah McMillen, DVM, a licensed Florida veterinarian (FL License #VM16794), in compliance with Florida Statute §474.2021 (Telehealth). Our services include:</p>
              <ul style={{ paddingLeft: "24px", marginBottom: "16px" }}>
                <li>Live audiovisual consultations for animal health concerns</li>
                <li>Personalized care plans and recommendations</li>
                <li>Guidance on treatment and medication options</li>
                <li>AI-assisted plain-language discharge summaries reviewed and approved by Dr. McMillen</li>
              </ul>
              <p style={{ marginBottom: "24px" }}><strong>Important:</strong> Telemedicine consultations are NOT a substitute for emergency veterinary care. If your animal is experiencing a life-threatening emergency, contact your nearest emergency veterinary clinic immediately.</p>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>3. Geographic Limitation</h2>
              <p style={{ marginBottom: "24px" }}>Our services are available only to clients whose animals are physically located in the State of Florida at the time of consultation, in compliance with Florida veterinary telemedicine regulations (§474.2021, F.S.). By booking a consultation, you confirm that your animal is located in Florida.</p>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>4. Electronic Agreements at Booking</h2>
              <p style={{ marginBottom: "24px" }}>Prior to each consultation, you must review and electronically acknowledge all required disclosures and agreements presented during the booking process. These include, but are not limited to, our Telehealth Consent, VCPR Disclosure, Emergency Care Acknowledgment, Terms of Service, Privacy Policy, Medical Records Authorization, Controlled Substance Limitations, Multi-State Jurisdiction Notice, and Acknowledgment of the Right to a Written Prescription. Your name, date, and time of acceptance are recorded for each agreement. You may not proceed with booking unless all required acknowledgments are completed. A copy of your signed agreements is attached to your discharge email for your records.</p>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>5. Veterinarian-Client-Patient Relationship (VCPR)</h2>
              <p style={{ marginBottom: "24px" }}>Under Florida law (§474.2021, F.S.), a valid Veterinarian-Client-Patient Relationship (VCPR) may be established via live, synchronous audiovisual communication. During your consultation, Dr. McMillen will conduct a real-time video examination to establish or maintain a VCPR as required. Certain clinical situations may require an in-person examination before Dr. McMillen can provide specific recommendations or prescriptions; she will advise you if this applies to your animal.</p>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>6. Prescription Rights</h2>
              <p style={{ marginBottom: "24px" }}>In accordance with §474.224, Florida Statutes, you have the right to receive a written prescription for any medication Dr. McMillen prescribes, rather than being required to purchase medication through Stockyard Animal Health. Written prescriptions may be filled at any licensed pharmacy of your choice. To request a written prescription, please indicate this preference during your consultation or contact us at stockyardanimalhealth@gmail.com.</p>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>7. Controlled Substance Limitations</h2>
              <p style={{ marginBottom: "24px" }}>Controlled substances (as defined by Florida and federal law) cannot be prescribed via telehealth. If Dr. McMillen determines that a controlled substance may be clinically appropriate for your animal, she will advise you that an in-person examination at a licensed veterinary facility is required before any such prescription can be issued. This policy is consistent with applicable state and federal regulations.</p>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>8. AI-Generated Discharge Summaries</h2>
              <p style={{ marginBottom: "24px" }}>Following your consultation, Dr. McMillen may use an AI-assisted drafting tool (powered by Google Gemini) to generate a plain-language discharge summary based on her clinical notes. All AI-generated content is reviewed, edited if necessary, and personally approved by Dr. McMillen before it is sent to you. The discharge summary is informational and does not replace the clinical judgment of a licensed veterinarian. By using our services, you acknowledge and consent to this process.</p>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>9. Payment Terms</h2>
              <p style={{ marginBottom: "24px" }}>Consultations are priced at $60 per session. Payment is required at the time of booking. We accept major credit and debit cards processed securely through Stripe. Prices are subject to change with notice.</p>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>10. Cancellation and Refund Policy</h2>
              <p style={{ marginBottom: "24px" }}>Cancellations made at least 24 hours before the scheduled consultation will receive a full refund. Cancellations within 24 hours of the scheduled time are non-refundable. No-shows are non-refundable. Dr. McMillen reserves the right to reschedule consultations due to emergency circumstances.</p>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>11. User Responsibilities</h2>
              <p style={{ marginBottom: "16px" }}>You agree to:</p>
              <ul style={{ paddingLeft: "24px", marginBottom: "24px" }}>
                <li>Provide accurate and complete information about yourself and your animals</li>
                <li>Confirm that your animal is physically located in Florida at the time of consultation</li>
                <li>Ensure a stable internet connection and functioning camera/microphone during consultations</li>
                <li>Be present and available at your scheduled appointment time</li>
                <li>Complete all required electronic acknowledgments prior to booking</li>
                <li>Follow any recommendations provided in good faith and contact emergency care when appropriate</li>
                <li>Keep your appointment join link private and do not share it with others</li>
              </ul>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>12. Limitation of Liability</h2>
              <p style={{ marginBottom: "24px" }}>Stockyard Animal Health and Dr. Meleah McMillen shall not be liable for any indirect, incidental, or consequential damages arising from the use of our services, including but not limited to technical failures, transmission interruptions, or outcomes based on incomplete information. Our liability is limited to the amount paid for the consultation in question.</p>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>13. Intellectual Property</h2>
              <p style={{ marginBottom: "24px" }}>All content on our platform, including text, graphics, and care plan templates, is the property of Stockyard Animal Health and may not be reproduced without written permission.</p>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>14. Governing Law</h2>
              <p style={{ marginBottom: "24px" }}>These Terms shall be governed by the laws of the State of Florida. Any disputes shall be resolved in the courts of Florida.</p>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>15. SMS / Text Message Communications</h2>
              <p style={{ marginBottom: "16px" }}>By providing your phone number and checking the SMS opt-in box during registration, you expressly consent to receive transactional text messages from Stockyard Animal Health, including appointment reminders, booking confirmations, and care-related notifications.</p>
              <ul style={{ paddingLeft: "24px", marginBottom: "16px" }}>
                <li><strong>Consent is not required</strong> to purchase or use our services.</li>
                <li><strong>Message frequency</strong> varies based on your appointments, typically 1–4 messages per appointment.</li>
                <li><strong>Message &amp; data rates</strong> may apply.</li>
                <li>Reply <strong>STOP</strong> to unsubscribe at any time. You will receive one confirmation message and no further texts.</li>
                <li>Reply <strong>HELP</strong> for assistance, or contact us at stockyardanimalhealth@gmail.com.</li>
                <li>We do not send promotional or marketing SMS messages.</li>
                <li>Your phone number will never be sold or shared with third parties for marketing.</li>
              </ul>
              <p style={{ marginBottom: "24px" }}>See our <a href="/sms-consent" style={{ color: "#1a6a6a" }}>SMS Consent Policy</a> and <a href="/privacy-policy" style={{ color: "#1a6a6a" }}>Privacy Policy</a> for full details.</p>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "#1a6a6a", marginBottom: "12px" }}>16. Changes to Terms</h2>
              <p>We reserve the right to modify these Terms at any time. Changes will be effective upon posting to our platform. Continued use of our services constitutes acceptance of the updated Terms.</p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
