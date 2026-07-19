"use client";
import { useEffect, useRef, useState } from "react";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import Link from "next/link";

const DAY_ORDER: { key: string; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

function fmtHour(t: string) {
  const [h, m] = t.split(":").map(Number);
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

type DaySchedule = { enabled: boolean; start: string; end: string };

export default function HomePage() {
  const mainRef = useRef<HTMLElement>(null);
  const [schedule, setSchedule] = useState<Record<string, DaySchedule> | null>(null);

  useEffect(() => {
    fetch("/api/settings/availability?public=1")
      .then(r => r.ok ? r.json() : null)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((d: any) => { if (d?.weeklySchedule) setSchedule(d.weeklySchedule); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const els = mainRef.current?.querySelectorAll<HTMLElement>(".reveal") ?? [];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15 }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="marketing-page">
      <SiteNav />
      <main ref={mainRef}>
        {/* Hero */}
        <header className="hero">
          {/* Centered hero content */}
          <div className="container" style={{ flex: 1, display: "flex", alignItems: "center" }}>
            <div className="hero-content">
              <h1>Expert Veterinary Care From the Comfort of Home</h1>
              <p className="hero-tagline">
                Welcome to Stockyard Animal Health — Florida&apos;s trusted
                veterinarian for farm animals and companion animals, now available from the comfort
                of your home. Expert video consultations with Dr. Meleah McMillen, 7 days a week.
              </p>
              <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
                <Link href="/book" className="btn btn-large" style={{ background: "#E8427A", color: "#ffffff", border: "none", fontWeight: 700 }}>
                  Book Now
                </Link>
                <Link href="/#how-it-works" className="btn btn-large" style={{
                  background: "rgba(255,255,255,0.15)", color: "#f5f0e8", border: "2px solid rgba(255,255,255,0.4)",
                }}>
                  How It Works
                </Link>
              </div>
              <div style={{ marginTop: 16, textAlign: "center" }}>
                <Link href="/manage" style={{ color: "rgba(255,255,255,0.75)", fontSize: "0.9rem", textDecoration: "underline", textUnderlineOffset: 3 }}>
                  Already booked? Manage your appointment →
                </Link>
              </div>
            </div>
          </div>

          {/* Scroll cue */}
          <div className="hero-scroll-cue">
            <span>Scroll to explore</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ color: "#ffffff" }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </header>

        {/* Stats bar below hero */}
        <div className="hero-stats reveal">
          <div className="hero-stats-inner">
            {[
              { icon: "💵", value: "$60 Flat Rate", label: "No hidden fees, no surprises" },
              { icon: "📅", value: "7 Days a Week", label: "Available evenings & weekends" },
              { icon: "🌴", value: "Florida-Wide", label: "Serving all of Florida" },
            ].map((s) => (
              <div key={s.value} style={{ minWidth: "140px" }}>
                <div style={{ fontSize: "2rem", marginBottom: "6px" }}>{s.icon}</div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.3rem", color: "#f5f0e8", marginBottom: "4px" }}>
                  {s.value}
                </div>
                <div style={{ color: "#c5eaea", fontSize: "0.9rem" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Links */}
        <section className="reveal" style={{ padding: "64px 0" }}>
          <div className="container">
            <h2 className="section-title">Florida&apos;s Trusted Rural Vet — Online</h2>
            <p className="section-subtitle">
              Everything your farm and family animals need, without the long drive or the wait.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "24px" }}>
              {[
                { href: "#how-it-works", icon: "📋", title: "How It Works", desc: "Three simple steps from concern to care plan." },
                { href: "#animals", icon: "🐄", title: "Animals We Serve", desc: "Horses, cattle, goats, dogs, cats, and more." },
                { href: "#pricing", icon: "💵", title: "Pricing", desc: "$60 flat rate. No surprises, no hidden fees." },
                { href: "/about", icon: "👩‍⚕️", title: "About Dr. McMillen", desc: "Meet the vet who understands rural animal care." },
              ].map((card) => (
                <Link key={card.href} href={card.href} style={{
                  display: "block",
                  background: "rgba(255,255,255,0.55)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  borderRadius: "12px",
                  padding: "28px 24px",
                  textAlign: "center",
                  boxShadow: "var(--shadow)",
                  border: "1px solid rgba(255,255,255,0.35)",
                  transition: "var(--transition)",
                  color: "#1a1a1a",
                  textDecoration: "none",
                }}>
                  <div style={{ fontSize: "2.5rem", marginBottom: "12px" }}>{card.icon}</div>
                  <h3 style={{ fontSize: "1.1rem", marginBottom: "8px", color: "#1a6a6a" }}>{card.title}</h3>
                  <p style={{ fontSize: "0.9rem", color: "#1a1a1a" }}>{card.desc}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works Preview */}
        <section id="how-it-works" className="reveal" style={{ padding: "72px 0" }}>
          <div className="container">
            <h2 className="section-title">How It Works</h2>
            <p className="section-subtitle">Getting expert vet care for your animals has never been easier.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "24px", marginBottom: "40px" }}>
              {[
                { step: "1", title: "Book Online", desc: "Choose a date and time that works for you. Pay $60 flat rate — no account needed.", icon: "📅" },
                { step: "2", title: "Join the Video Call", desc: "We'll email you a link. Connect with Dr. McMillen via video from your phone or computer.", icon: "📱" },
                { step: "3", title: "Receive Your Care Plan", desc: "Get a personalized care plan and follow-up guidance from a licensed Florida vet.", icon: "📋" },
              ].map((s) => (
                <div key={s.step} style={{
                  background: "rgba(255,255,255,0.55)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  borderRadius: "16px",
                  padding: "28px 20px",
                  textAlign: "center",
                  border: "1px solid rgba(255,255,255,0.35)",
                  boxShadow: "var(--shadow)",
                }}>
                  <div style={{
                    width: "60px", height: "60px",
                    background: "#5BC4C4",
                    borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    margin: "0 auto 14px", fontSize: "1.6rem",
                  }}>{s.icon}</div>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#1a6a6a", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "1px" }}>
                    Step {s.step}
                  </div>
                  <h3 style={{ fontWeight: 700, fontSize: "1.05rem", marginBottom: "8px", color: "#1a6a6a" }}>{s.title}</h3>
                  <p style={{ fontSize: "0.88rem", color: "#1a1a1a", lineHeight: 1.6 }}>{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Animal Types */}
        <section id="animals" className="reveal" style={{ padding: "72px 0" }}>
          <div className="container">
            <h2 className="section-title">Animals We Serve</h2>
            <p className="section-subtitle">Expert care for all your farm and companion animals.</p>
            <div className="animals-grid-full" style={{ gap: "20px", marginBottom: "40px" }}>
              {[
                { name: "Horses", img: "https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?w=300&h=200&fit=crop" },
                { name: "Cattle", img: "https://images.unsplash.com/photo-1570042225831-d98fa7577f1e?w=300&h=200&fit=crop" },
                { name: "Goats", img: "https://images.unsplash.com/photo-1524024973431-2ad916746881?w=300&h=200&fit=crop" },
                { name: "Dogs", img: "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=300&h=200&fit=crop" },
                { name: "Cats", img: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=300&h=200&fit=crop" },
                { name: "Chickens", img: "https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?w=300&h=200&fit=crop" },
                { name: "Pigs", img: "https://images.unsplash.com/photo-1516467508483-a7212febe31a?w=300&h=200&fit=crop" },
                { name: "Sheep", img: "https://images.unsplash.com/photo-1484557985045-edf25e08da73?w=300&h=200&fit=crop" },
                { name: "Donkeys", img: "https://images.unsplash.com/photo-1657596570580-4b55d4b31d9e?w=300&h=200&fit=crop" },
                { name: "Llamas", img: "https://images.unsplash.com/photo-1598570510874-03352547dd85?w=300&h=200&fit=crop" },
              ].map((a) => (
                <div key={a.name} style={{
                  background: "rgba(255,255,255,0.55)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  borderRadius: "12px",
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.35)",
                  boxShadow: "var(--shadow)",
                  textAlign: "center",
                }}>
                  <div style={{ aspectRatio: "1", overflow: "hidden" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.img} alt={a.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </div>
                  <span style={{ display: "block", padding: "10px 8px", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "0.85rem", color: "#1a6a6a" }}>{a.name}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="reveal" style={{ padding: "72px 0" }}>
          <div className="container">
            <h2 className="section-title">Simple, Transparent Pricing</h2>
            <p className="section-subtitle">One flat rate. No farm call fees, no emergency surcharges, no surprise bills.</p>
            <div className="pricing-layout">
              <div className="pricing-card-full">
                <div className="pricing-card-header">
                  <div className="label">Standard Consultation</div>
                  <div className="price-display">
                    <span className="amount">$60</span>
                    <span className="period">per consultation</span>
                  </div>
                </div>
                <div className="pricing-card-body">
                  <ul>
                    <li><span className="check">✓</span><span>Live video consultation with Dr. McMillen</span></li>
                    <li><span className="check">✓</span><span>Professional observational examination of your animal</span></li>
                    <li><span className="check">✓</span><span>Differential diagnoses — multiple potential causes explained</span></li>
                    <li><span className="check">✓</span><span>Detailed, step-by-step treatment plan</span></li>
                    <li><span className="check">✓</span><span>Electronic prescription when medically appropriate</span></li>
                    <li><span className="check">✓</span><span>Heartworm/flea &amp; tick prevention prescriptions (with waiver)</span></li>
                    <li><span className="check">✓</span><span>Follow-up guidance &amp; red flag warning signs</span></li>
                    <li><span className="check">✓</span><span>Available 7 days a week, evenings &amp; weekends</span></li>
                    <li><span className="check">✓</span><span>Secure, HIPAA-compliant video platform</span></li>
                  </ul>
                  <Link href="/book" className="btn btn-primary btn-large" style={{ width: "100%", display: "block", textAlign: "center" }}>Book Your Consultation</Link>
                  <p style={{ textAlign: "center", fontSize: "0.82rem", color: "var(--color-text-light)", marginTop: "12px" }}>Secure payment · Instant confirmation</p>
                </div>
              </div>

              <div>
                <div className="hours-box">
                  <h3>Appointment Hours</h3>
                  {DAY_ORDER.map(({ key, label }) => {
                    const day = schedule?.[key];
                    return (
                      <div className="hours-row" key={key}>
                        <span className="day">{label}</span>
                        <span className="time">
                          {!schedule ? "…" : day?.enabled ? `${fmtHour(day.start)} – ${fmtHour(day.end)} EST` : "Closed"}
                        </span>
                      </div>
                    );
                  })}
                  <p style={{ fontSize: "0.85rem", color: "var(--color-text-light)", marginTop: "16px" }}>Hours designed around the reality of farm life — evenings available every day of the week.</p>
                </div>
                <div style={{ background: "rgba(255,255,255,0.55)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", borderRadius: "12px", padding: "28px", border: "1px solid rgba(255,255,255,0.35)", marginTop: "24px" }}>
                  <h3 style={{ fontSize: "1.1rem", color: "#1a6a6a", marginBottom: "16px" }}>What Happens After Your Appointment?</h3>
                  <p style={{ fontSize: "0.9rem", color: "#1a1a1a", lineHeight: 1.75, marginBottom: "12px" }}>After your consultation, you&apos;ll have a clear understanding of what&apos;s going on with your animal, a step-by-step treatment plan, and any prescriptions that are appropriate.</p>
                  <p style={{ fontSize: "0.9rem", color: "#1a1a1a", lineHeight: 1.75 }}>If your animal&apos;s condition requires an in-person visit, Dr. McMillen will let you know clearly — including how urgent it is and what to communicate to a local vet.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Dr. McMillen Bio Card */}
        <section className="reveal" style={{ padding: "72px 0" }}>
          <div className="container">
            <div className="mcmillen-bio-grid" style={{
              background: "rgba(255,255,255,0.55)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              borderRadius: "16px",
              padding: "40px",
              border: "1px solid rgba(255,255,255,0.35)",
              boxShadow: "var(--shadow-lg)",
            }}>
              <div>
                <img src="/dr-mcmillen.jpg" alt="Dr. Meleah McMillen" style={{ width: "100%", borderRadius: "12px", boxShadow: "var(--shadow-lg)", display: "block" }} />
                <div style={{ marginTop: "16px", textAlign: "center" }}>
                  <strong style={{ color: "#1a6a6a", display: "block" }}>Dr. Meleah McMillen, DVM</strong>
                  <span style={{ color: "#1a6a6a", fontSize: "0.9rem" }}>Licensed Florida Veterinarian</span>
                </div>
              </div>
              <div>
                <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "2rem", color: "#1a6a6a", marginBottom: "16px" }}>
                  Meet Dr. McMillen
                </h2>
                <p style={{ marginBottom: "16px", color: "#1a1a1a", lineHeight: 1.8 }}>
                  Dr. Meleah McMillen is a licensed Florida veterinarian with extensive experience in large animal medicine, equine care, small ruminants, and companion animals. Raised with a deep appreciation for rural life, she understands the unique challenges that come with caring for farm animals.
                </p>
                <p style={{ marginBottom: "24px", color: "#1a1a1a", lineHeight: 1.8 }}>
                  Now offering veterinary telemedicine consultations statewide, Dr. McMillen brings her expertise directly to your home. Whether you have a question about your horse, cattle, goats, or beloved pets, she&apos;s here to help — 7 days a week.
                </p>
                <Link href="/about" className="btn btn-primary">Learn More About Dr. McMillen</Link>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Banner */}
        <section className="reveal" style={{ padding: "80px 0", textAlign: "center", position: "relative", background: "linear-gradient(135deg, #1a6a6a 0%, #5BC4C4 55%, #E8427A 100%)" }}>
          <div style={{ position: "absolute", inset: 0 }} />
          <div className="container" style={{ position: "relative", zIndex: 1 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, color: "#f5f0e8", fontSize: "2rem", marginBottom: "16px" }}>
              Ready to Get Expert Care for Your Animals?
            </h2>
            <p style={{ color: "rgba(255,255,255,0.85)", fontSize: "1.1rem", maxWidth: "600px", margin: "0 auto 32px" }}>
              Skip the long drive and the waiting room. Book a video consultation today and get professional veterinary guidance from home.
            </p>
            <Link href="/book" className="btn btn-primary btn-large">
              Schedule a Consultation — $60
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
