import type { Metadata } from "next";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "About Dr. Meleah McMillen — Florida Veterinary Telemedicine",
  description: "Meet Dr. Meleah McMillen, DVM — a licensed Florida veterinarian offering expert telemedicine consultations for horses, cattle, goats, chickens, dogs, cats, and more.",
  alternates: { canonical: "https://stockyardanimalhealth.com/about" },
  openGraph: {
    title: "About Dr. Meleah McMillen — Stockyard Animal Health",
    description: "Licensed Florida veterinarian offering telemedicine for farm animals and companions. $60 flat rate, 7 days a week.",
    url: "https://stockyardanimalhealth.com/about",
  },
};

export default function AboutPage() {
  return (
    <div className="marketing-page">
      <SiteNav />
      <main>
        {/* Hero */}
        <header className="hero" style={{ minHeight: "40vh" }}>
          <div className="container" style={{ flex: 1, display: "flex", alignItems: "center" }}>
            <div className="hero-content">
              <h1>About Dr. McMillen</h1>
              <p className="hero-tagline">
                A licensed Florida veterinarian with deep roots in rural animal care,
                and a genuine passion for the animals and families she serves.
              </p>
            </div>
          </div>
        </header>

        {/* Bio Section */}
        <section style={{ padding: "72px 0" }}>
          <div className="container">
            <div className="bio-layout">
              <div className="bio-photo-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/dr-mcmillen.jpg" alt="Dr. Meleah McMillen, DVM" />
                <div className="card-body">
                  <h3>Dr. Meleah McMillen</h3>
                  <p className="title">Licensed Florida Veterinarian</p>
                  <div className="credential"><span className="icon">🎓</span> Doctor of Veterinary Medicine</div>
                  <div className="credential"><span className="icon">📍</span> Serving all of Florida</div>
                  <div className="credential"><span className="icon">🐴</span> Large &amp; Small Animal Specialist</div>
                  <div className="credential"><span className="icon">💻</span> Licensed for Telemedicine</div>
                </div>
              </div>

              <div style={{ background: "rgba(255,255,255,0.55)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", borderRadius: "16px", padding: "32px", border: "1px solid rgba(255,255,255,0.35)" }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, color: "#1a6a6a", marginBottom: "16px" }}>Florida&apos;s Trusted Rural Veterinarian</h2>
                <p style={{ color: "#333", lineHeight: 1.8, marginBottom: "16px" }}>Dr. Meleah McMillen built her career around the animals and communities that traditional veterinary practices so often overlook. Rural Florida is home to hundreds of thousands of farm animals — horses, cattle, goats, pigs, sheep, and more — whose owners frequently struggle to access timely, affordable veterinary care.</p>
                <p style={{ color: "#333", lineHeight: 1.8, marginBottom: "16px" }}>Dr. McMillen understands that reality personally. Growing up surrounded by farm life gave her a deep appreciation for what it means to be responsible for animals that work, that feed your family, or that have simply become part of it. That upbringing shaped both her career path and her approach to veterinary medicine.</p>
                <blockquote style={{ borderLeft: "4px solid #5BC4C4", paddingLeft: "20px", margin: "24px 0", background: "rgba(91,196,196,0.1)", borderRadius: "0 8px 8px 0", padding: "16px 20px", fontStyle: "italic", color: "#1a6a6a" }}>
                  &ldquo;I became a vet because I believe every animal deserves access to good medical care — not just the ones close to a clinic. Telemedicine is how I make that possible.&rdquo;
                </blockquote>
                <p style={{ color: "#333", lineHeight: 1.8, marginBottom: "16px" }}>After completing her Doctor of Veterinary Medicine degree, Dr. McMillen focused her practice on large and mixed animal medicine — the horses with mysterious lameness, the cow that stopped eating, the goat kid that wasn&apos;t thriving. She&apos;s comfortable in the barn, in the field, and now — via video — in yours.</p>
                <p style={{ color: "#333", lineHeight: 1.8, marginBottom: "16px" }}>Stockyard Animal Health was founded to solve a specific problem: too many Florida farmers and rural families couldn&apos;t access a vet when they needed one. Not because good vets didn&apos;t exist, but because farm calls were expensive, clinic hours didn&apos;t match farm schedules, and driving 60 miles to a clinic with a sick horse simply wasn&apos;t practical.</p>
                <p style={{ color: "#333", lineHeight: 1.8 }}>When your animal needs more than telemedicine can provide, Dr. McMillen will tell you plainly — what&apos;s going on, how urgent it is, and what to say to a local vet. You&apos;ll never leave a consultation without direction.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Values */}
        <section style={{ padding: "72px 0" }}>
          <div className="container">
            <h2 className="section-title" style={{ textAlign: "center", marginBottom: "8px" }}>What Guides Dr. McMillen&apos;s Practice</h2>
            <p className="section-subtitle" style={{ textAlign: "center" }}>The principles behind every consultation she conducts.</p>
            <div className="values-grid">
              <div className="value-card">
                <div className="icon">🤝</div>
                <h4>Honest Communication</h4>
                <p>Dr. McMillen tells you what she sees and what she thinks — clearly, without jargon. If something is serious, she says so. If it can be managed at home, she tells you that too. No hedging, no upselling.</p>
              </div>
              <div className="value-card">
                <div className="icon">🌾</div>
                <h4>Respect for Rural Life</h4>
                <p>She understands that you have a farm to run, animals that depend on you, and a schedule that doesn&apos;t always cooperate. Her availability is built around yours — evenings and full weekends, no exceptions.</p>
              </div>
              <div className="value-card">
                <div className="icon">🔬</div>
                <h4>Evidence-Based Medicine</h4>
                <p>Every diagnosis and recommendation is grounded in veterinary science. Dr. McMillen keeps current with continuing education across large and small animal medicine so you get guidance that reflects best practices.</p>
              </div>
              <div className="value-card">
                <div className="icon">💰</div>
                <h4>Accessible, Affordable Care</h4>
                <p>Veterinary care shouldn&apos;t be a luxury. $60 is a price Dr. McMillen set deliberately — enough to be sustainable, reasonable enough to make proper veterinary guidance available to every Florida farmer and pet owner.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Expertise */}
        <section style={{ padding: "72px 0", background: "#f0fafa" }}>
          <div className="container">
            <h2 className="section-title" style={{ textAlign: "center", marginBottom: "8px" }}>Areas of Clinical Expertise</h2>
            <p className="section-subtitle" style={{ textAlign: "center" }}>Dr. McMillen has broad experience across species and conditions, with particular depth in the following areas.</p>
            <div className="expertise-grid">
              <div className="expertise-card">
                <h4><span>🐴</span> Equine Medicine</h4>
                <ul>
                  <li>Lameness evaluation &amp; gait analysis</li>
                  <li>Dermatological conditions</li>
                  <li>Colic triage &amp; urgency assessment</li>
                  <li>Senior horse pain management</li>
                  <li>Wound management guidance</li>
                  <li>Weight loss &amp; nutritional counseling</li>
                </ul>
              </div>
              <div className="expertise-card">
                <h4><span>🐄</span> Bovine &amp; Livestock Medicine</h4>
                <ul>
                  <li>Respiratory illness assessment (BRD)</li>
                  <li>Herd health consultation</li>
                  <li>Reproductive health guidance</li>
                  <li>Metabolic disease recognition</li>
                  <li>Nutritional management</li>
                  <li>Neonatal calf care</li>
                </ul>
              </div>
              <div className="expertise-card">
                <h4><span>🐐</span> Small Ruminant Medicine</h4>
                <ul>
                  <li>Goat &amp; sheep internal medicine</li>
                  <li>Parasite management strategies</li>
                  <li>Urinary calculi in wethers</li>
                  <li>Pregnancy toxemia &amp; ketosis</li>
                  <li>Respiratory illness</li>
                  <li>Neonatal care &amp; bottle kid guidance</li>
                </ul>
              </div>
              <div className="expertise-card">
                <h4><span>🐕</span> Companion Animal Medicine</h4>
                <ul>
                  <li>General medicine &amp; wellness</li>
                  <li>Dermatology &amp; ear conditions</li>
                  <li>Heartworm prevention &amp; prescriptions</li>
                  <li>Senior pet mobility &amp; pain</li>
                  <li>Gastrointestinal concerns</li>
                  <li>Feline internal medicine</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Why Telemedicine */}
        <section style={{ padding: "72px 0" }}>
          <div className="container" style={{ maxWidth: "860px", textAlign: "center" }}>
            <div style={{ background: "rgba(255,255,255,0.8)", borderRadius: "16px", padding: "40px", border: "1px solid #c5e5e5" }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.8rem", marginBottom: "20px", color: "#1a6a6a" }}>Why Dr. McMillen Chose Telemedicine</h2>
              <p style={{ fontSize: "1.05rem", color: "#333", lineHeight: 1.85, marginBottom: "20px" }}>Telemedicine isn&apos;t a shortcut — it&apos;s a solution to a real access problem. Dr. McMillen watched too many farmers and rural families go without veterinary guidance simply because getting a vet out was too expensive, too slow, or both.</p>
              <p style={{ fontSize: "1.05rem", color: "#333", lineHeight: 1.85, marginBottom: "20px" }}>For many conditions — early-stage illness, lameness evaluation, skin problems, behavioral changes, nutritional concerns — a thorough visual examination conducted live by an experienced veterinarian is genuinely sufficient to reach an accurate diagnosis and build an effective treatment plan.</p>
              <p style={{ fontSize: "1.05rem", color: "#333", lineHeight: 1.85 }}>Stockyard Animal Health exists because Dr. McMillen believes Florida&apos;s animals deserve better access to care than they&apos;ve historically had — and that telemedicine is one of the most powerful tools available to make that happen.</p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="cta-banner" style={{ padding: "80px 0", textAlign: "center" }}>
          <div className="container">
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, color: "#ffffff", fontSize: "2rem", marginBottom: "16px" }}>
              Ready to Meet Dr. McMillen?
            </h2>
            <p style={{ color: "rgba(255,255,255,0.85)", fontSize: "1.1rem", maxWidth: "600px", margin: "0 auto 32px" }}>
              Book a $60 video consultation and experience the Stockyard difference — expert, honest veterinary guidance from someone who truly understands rural animal care.
            </p>
            <a href="/book" className="btn btn-primary btn-large">Book a Consultation</a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
