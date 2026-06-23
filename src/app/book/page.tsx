"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import SiteNav from "@/components/SiteNav";

const ANIMAL_TYPES = ["Dog","Cat","Horse","Cattle","Goat","Chicken","Pig","Sheep","Rabbit","Duck","Other"];

const AGREEMENTS: { key: string; title: string; body: string }[] = [
  { key: "telehealth", title: "Telehealth Services Consent", body: "I consent to receive veterinary care through telehealth technology, understanding that physical examination is not possible through this medium and that in-person care may be recommended." },
  { key: "vcpr", title: "VCPR Acknowledgment", body: "I understand that a valid Veterinarian-Client-Patient Relationship (VCPR) will be established through this telehealth consultation and that Dr. McMillen will exercise professional judgment in my pet's care." },
  { key: "emergency", title: "Emergency Situations", body: "I understand that in a medical emergency I should immediately contact a local emergency veterinary clinic or call 911. Telehealth is not a substitute for emergency in-person care." },
  { key: "terms", title: "Terms of Service", body: "I agree to the Stockyard Animal Health Terms of Service, including payment terms, cancellation policy, and acceptable use of the platform." },
  { key: "privacy", title: "Privacy Policy", body: "I consent to the collection and use of my personal and pet health information as described in Stockyard Animal Health's Privacy Policy, including storage of consultation records." },
  { key: "records", title: "Medical Records", body: "I authorize Stockyard Animal Health to create, maintain, and share medical records related to my pet's consultations as required for continued care and as permitted by law." },
  { key: "controlled", title: "Controlled Substance Policy", body: "I understand that controlled substances cannot be prescribed via telehealth in Florida and that Dr. McMillen cannot prescribe Schedule II–V medications through this platform." },
  { key: "jurisdiction", title: "Jurisdiction & Florida Law", body: "I understand that Stockyard Animal Health operates under Florida veterinary law. If my pet or I am located outside Florida, I acknowledge that some services may be limited." },
  { key: "prescription", title: "Prescription Policy", body: "I understand that prescriptions may be issued at the veterinarian's discretion, that a valid VCPR is required, and that prescriptions will be sent to my chosen pharmacy or provided electronically." },
];

function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"} EST`;
}
function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

export default function BookPage() {
  const [step, setStep] = useState(1);

  // Step 1 — info + pet
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [petName, setPetName] = useState("");
  const [petType, setPetType] = useState("");
  const [petTypeOther, setPetTypeOther] = useState("");
  const [petBreed, setPetBreed] = useState("");
  const [petDob, setPetDob] = useState("");
  const [petWeight, setPetWeight] = useState("");
  const [petSex, setPetSex] = useState("");
  const [petSpayedNeutered, setPetSpayedNeutered] = useState("");
  const [petColor, setPetColor] = useState("");

  // Step 2 — concern
  const [concern, setConcern] = useState("");

  // Pharmacy (optional, prefilled from previous booking)
  const [pharmacyName, setPharmacyName] = useState("");
  const [pharmacyAddress, setPharmacyAddress] = useState("");
  const [pharmacyPhone, setPharmacyPhone] = useState("");
  const [pharmacyPrefilled, setPharmacyPrefilled] = useState(false);

  // Step 3 — date & time
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [noSlots, setNoSlots] = useState(false);

  // Step 4 — agreements
  const [agreements, setAgreements] = useState<Record<string, boolean>>(
    Object.fromEntries(AGREEMENTS.map(a => [a.key, false]))
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [smsConsent, setSmsConsent] = useState(false);

  // Step 5 — payment
  const [promo, setPromo] = useState("");
  const [promoResult, setPromoResult] = useState<{ valid: boolean; discount?: number; type?: string; code?: string; error?: string } | null>(null);
  const [price, setPrice] = useState(60);
  const [stripeReady, setStripeReady] = useState(false);
  const stripeRef = useRef<unknown>(null);
  const cardRef = useRef<unknown>(null);
  const cardDivRef = useRef<HTMLDivElement>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  // Confirmation
  const [confirmed, setConfirmed] = useState(false);

  const [err, setErr] = useState("");

  // Load slots when date changes
  useEffect(() => {
    if (!date) { setSlots([]); setNoSlots(false); return; }
    setSlotsLoading(true);
    setSlots([]);
    setTime("");
    setNoSlots(false);
    fetch(`/api/settings/availability?date=${date}`)
      .then(r => r.ok ? r.json() : { slots: [] })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((d: any) => {
        const s = d.slots ?? [];
        setSlots(s);
        setNoSlots(s.length === 0);
      })
      .finally(() => setSlotsLoading(false));
  }, [date]);

  // Mount Stripe when on payment step and price > 0
  useEffect(() => {
    if (step !== 5 || price === 0) return;

    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!pk) { setPaymentError("Payment system unavailable. Please contact us."); return; }

    let card: { mount: (el: HTMLElement) => void; unmount: () => void } | null = null;

    const mount = () => {
      // @ts-expect-error stripe global
      const stripe = window.Stripe(pk);
      stripeRef.current = stripe;
      const elements = stripe.elements();
      card = elements.create("card", {
        style: { base: { fontFamily: "var(--font-body), sans-serif", fontSize: "16px", color: "#1a6a6a" } },
      });
      if (cardDivRef.current) {
        card!.mount(cardDivRef.current);
        cardRef.current = card;
        setStripeReady(true);
      }
    };

    // @ts-expect-error stripe global
    if (window.Stripe) { mount(); }
    else {
      const s = document.createElement("script");
      s.src = "https://js.stripe.com/v3/";
      s.onload = mount;
      document.head.appendChild(s);
    }

    return () => {
      if (card) { try { card.unmount(); } catch {} }
      cardRef.current = null;
      setStripeReady(false);
    };
  }, [step, price]);

  function validateStep1() {
    if (!name.trim()) return "Please enter your name.";
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Please enter a valid email.";
    if (!phone) return "Please enter your phone number.";
    if (!/^\d{10}$/.test(phone.replace(/\D/g, ""))) return "Please enter a valid 10-digit phone number.";
    if (!petName.trim()) return "Please enter your pet's name.";
    if (!petType) return "Please select your pet's animal type.";
    if (petType === "Other" && !petTypeOther.trim()) return "Please describe your pet's animal type.";
    if (!petBreed.trim()) return "Please enter your pet's breed.";
    if (!petDob) return "Please enter your pet's date of birth.";
    if (!petWeight || isNaN(Number(petWeight)) || Number(petWeight) <= 0) return "Please enter your pet's weight.";
    if (!petSex) return "Please select your pet's sex.";
    if (!petSpayedNeutered) return `Please indicate if your pet is ${petSex === "Female" ? "spayed" : petSex === "Male" ? "neutered" : "spayed/neutered"}.`;
    if (!petColor.trim()) return "Please enter your pet's color.";
    return null;
  }

  function validateStep2() {
    if (!concern.trim()) return "Please describe your pet's concern.";
    if (concern.length > 1000) return "Concern must be under 1000 characters.";
    return null;
  }

  function validateStep3() {
    if (!date) return "Please select a date.";
    if (!time) return "Please select a time slot.";
    return null;
  }

  function validateStep4() {
    if (!AGREEMENTS.every(a => agreements[a.key])) return "Please accept all agreements to continue.";
    return null;
  }

  function goNext() {
    setErr("");
    let e: string | null = null;
    if (step === 1) e = validateStep1();
    if (step === 2) e = validateStep2();
    if (step === 3) e = validateStep3();
    if (step === 4) e = validateStep4();
    if (e) { setErr(e); return; }
    setStep(s => s + 1);
  }

  async function validatePromo() {
    if (!promo.trim()) return;
    const res = await fetch("/api/book/promo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: promo }),
    });
    const data = await res.json() as { valid: boolean; discount?: number; type?: string; code?: string; error?: string };
    setPromoResult(data);
    if (data.valid && data.type && data.discount !== undefined) {
      const final = data.type === "percent" ? 60 * (1 - data.discount / 100) : 60 - data.discount;
      setPrice(Math.max(0, final));
    }
  }

  async function handlePay() {
    if (paymentLoading) return;
    setPaymentLoading(true);
    setPaymentError("");

    try {
      let paymentIntentId = "";
      let resolvedStripeCustomerId = "";

      const isFree = price === 0;

      if (!isFree) {
        // Step 1: create PaymentIntent with correct post-promo amount
        const prepRes = await fetch("/api/book/prepare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name, email, phone: phone.replace(/\D/g, "") || undefined,
            petName, petType, concern, date, time,
            promoCode: promoResult?.valid ? promoResult.code : undefined,
          }),
        });
        const prepData = await prepRes.json() as { clientSecret?: string; amountCents?: number; stripeCustomerId?: string; free?: boolean; error?: string };
        if (!prepRes.ok) { setPaymentError(prepData.error ?? "Could not initiate payment."); return; }

        if (prepData.free) {
          // Promo made it free server-side — skip card
        } else {
          // Step 2: confirm card on client
          // @ts-expect-error stripe
          const { paymentIntent, error } = await stripeRef.current.confirmCardPayment(prepData.clientSecret!, {
            payment_method: { card: cardRef.current },
          });
          if (error) { setPaymentError(error.message); return; }
          if (paymentIntent.status !== "succeeded") { setPaymentError("Payment was not completed. Please try again."); return; }
          paymentIntentId = paymentIntent.id;
          resolvedStripeCustomerId = prepData.stripeCustomerId!;
        }
      }

      // Step 3: finalize booking
      const res = await fetch("/api/book/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, email, phone: phone.replace(/\D/g, "") || undefined,
          petName, petType: petType === "Other" ? petTypeOther : petType, petBreed: petBreed || undefined,
          petDob, petWeight: Number(petWeight),
          petSex: petSex || undefined,
          petSpayedNeutered: petSpayedNeutered === "Yes",
          petColor: petColor || undefined,
          concern, date, time,
          pharmacyName: pharmacyName || undefined,
          pharmacyAddress: pharmacyAddress || undefined,
          pharmacyPhone: pharmacyPhone || undefined,
          promoCode: promoResult?.valid ? promoResult.code : undefined,
          stripeCustomerId: resolvedStripeCustomerId || undefined,
          paymentIntentId,
          agreements,
          agreementsSignedAt: Math.floor(Date.now() / 1000),
          smsConsent,
        }),
      });
      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok) { setPaymentError(data.error ?? "Booking failed. Please try again."); return; }
      setConfirmed(true);
    } catch {
      setPaymentError("Network error. Please try again.");
    } finally {
      setPaymentLoading(false);
    }
  }

  const allAgreed = AGREEMENTS.every(a => agreements[a.key]);
  const today = new Date().toISOString().split("T")[0];

  // ── Confirmation screen ──────────────────────────────────────────────────────
  if (confirmed) {
    return (
      <div className="auth-page">
        <SiteNav />
        <div className="auth-container">
          <div className="auth-card" style={{ textAlign: "center" }}>
            <div style={{ width: 72, height: 72, background: "#d1fae5", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <svg width="36" height="36" fill="none" stroke="#059669" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 style={{ color: "#1a6a6a", marginBottom: 8 }}>You&apos;re Booked!</h2>
            <p style={{ color: "#555", marginBottom: 20 }}>
              A confirmation email with your video join link has been sent to <strong>{email}</strong>.
              Save that email — you&apos;ll need the link to join your call.
            </p>
            <div style={{ background: "#f0fafa", borderRadius: 12, padding: "14px 16px", marginBottom: 24, textAlign: "left" }}>
              <p style={{ margin: "4px 0", fontSize: "0.9rem" }}><strong>Pet:</strong> {petName} ({petType === "Other" ? petTypeOther : petType})</p>
              <p style={{ margin: "4px 0", fontSize: "0.9rem" }}><strong>Date:</strong> {fmtDate(date)}</p>
              <p style={{ margin: "4px 0", fontSize: "0.9rem" }}><strong>Time:</strong> {fmtTime(time)}</p>
            </div>
            <Link href="/" className="btn btn-primary btn-full">Back to Home</Link>
            <p style={{ marginTop: 12, fontSize: "0.85rem" }}>
              <Link href="/manage" style={{ color: "#1a6a6a" }}>Need to manage your appointment?</Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  const stepLabels = ["Your Info", "Concern", "Date & Time", "Agreements", "Payment"];
  const totalSteps = 5;

  return (
    <div className="auth-page">
      <SiteNav />
      <div className="auth-container" style={{ maxWidth: 860 }}>
        <div className="auth-card">

          {/* Progress */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              {stepLabels.map((label, i) => (
                <div key={label} style={{ textAlign: "center", flex: 1 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", margin: "0 auto 4px",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.75rem", fontWeight: 700,
                    background: i + 1 < step ? "#1a6a6a" : i + 1 === step ? "#1a6a6a" : "#e5e7eb",
                    color: i + 1 <= step ? "#fff" : "#9ca3af",
                  }}>
                    {i + 1 < step ? "✓" : i + 1}
                  </div>
                  <div style={{ fontSize: "0.65rem", color: i + 1 === step ? "#1a6a6a" : "#9ca3af", fontWeight: i + 1 === step ? 700 : 400 }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ height: 4, background: "#e5e7eb", borderRadius: 2 }}>
              <div style={{ height: 4, background: "#1a6a6a", borderRadius: 2, width: `${((step - 1) / (totalSteps - 1)) * 100}%`, transition: "width 0.3s" }} />
            </div>
          </div>

          {/* ── Step 1: Info + Pet ─────────────────────────────────────────────── */}
          {step === 1 && (
            <div>
              <h2 style={{ color: "#1a6a6a", fontFamily: "var(--font-body)", fontSize: "1.4rem", marginBottom: 4 }}>Your Info & Pet</h2>
              <p style={{ color: "#666", marginBottom: 20, fontSize: "0.9rem" }}>No account needed — just fill in your details.</p>

              {/* About You */}
              <p style={{ fontWeight: 700, color: "#374151", marginBottom: 12, fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>About You</p>
              <div className="form-grid-3">
                <div className="form-group">
                  <label>Full Name *</label>
                  <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" required />
                </div>
                <div className="form-group">
                  <label>Email Address *</label>
                  <input className="form-input" type="email" value={email}
                    onChange={e => setEmail(e.target.value)}
                    onBlur={async e => {
                      const val = e.target.value.trim();
                      if (!val || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return;
                      try {
                        const res = await fetch(`/api/book/pharmacy-lookup?email=${encodeURIComponent(val)}`);
                        if (!res.ok) return;
                        const data = await res.json() as { pharmacy: { pharmacy_name: string; pharmacy_address: string | null; pharmacy_phone: string | null } | null };
                        if (data.pharmacy) {
                          setPharmacyName(data.pharmacy.pharmacy_name);
                          setPharmacyAddress(data.pharmacy.pharmacy_address ?? "");
                          setPharmacyPhone(data.pharmacy.pharmacy_phone ?? "");
                          setPharmacyPrefilled(true);
                        }
                      } catch { /* silently ignore */ }
                    }}
                    placeholder="you@email.com" required />
                </div>
                <div className="form-group">
                  <label>Phone Number *</label>
                  <input className="form-input" type="tel" value={phone}
                    onChange={e => setPhone(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
                    placeholder="5551234567" inputMode="numeric" maxLength={10} required />
                </div>
              </div>

              {/* About Your Pet */}
              <p style={{ fontWeight: 700, color: "#374151", marginBottom: 12, marginTop: 8, fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>About Your Pet</p>
              <div className="form-grid-2">
                <div className="form-group">
                  <label>Pet&apos;s Name *</label>
                  <input className="form-input" value={petName} onChange={e => setPetName(e.target.value)} placeholder="Buddy" required />
                </div>
                <div className="form-group">
                  <label>Animal Type *</label>
                  <select className="form-input" value={petType} onChange={e => { setPetType(e.target.value); setPetTypeOther(""); }} required>
                    <option value="">Select…</option>
                    {ANIMAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {petType === "Other" && (
                    <input
                      className="form-input"
                      style={{ marginTop: 8 }}
                      value={petTypeOther}
                      onChange={e => setPetTypeOther(e.target.value)}
                      placeholder="e.g. Llama, Alpaca, Ferret…"
                      required
                    />
                  )}
                </div>
                <div className="form-group">
                  <label>Breed *</label>
                  <input className="form-input" value={petBreed} onChange={e => setPetBreed(e.target.value)} placeholder="Golden Retriever" required />
                </div>
                <div className="form-group">
                  <label>Date of Birth * <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: "0.8rem" }}>(est. ok)</span></label>
                  <input className="form-input" type="date" value={petDob} onChange={e => setPetDob(e.target.value)} max={today} required />
                </div>
                <div className="form-group">
                  <label>Weight (lbs) *</label>
                  <input className="form-input" type="number" min="0.1" step="0.1" value={petWeight} onChange={e => setPetWeight(e.target.value)} placeholder="e.g. 45" required />
                </div>
                <div className="form-group">
                  <label>Color *</label>
                  <input className="form-input" value={petColor} onChange={e => setPetColor(e.target.value)} placeholder="e.g. Black &amp; white" required />
                </div>
                <div className="form-group">
                  <label>Sex *</label>
                  <select className="form-input" value={petSex} onChange={e => setPetSex(e.target.value)} required>
                    <option value="">Select…</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>{petSex === "Female" ? "Spayed" : petSex === "Male" ? "Neutered" : "Spayed / Neutered"} *</label>
                  <select className="form-input" value={petSpayedNeutered} onChange={e => setPetSpayedNeutered(e.target.value)} required>
                    <option value="">Select…</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Concern ────────────────────────────────────────────────── */}
          {step === 2 && (
            <div>
              <h2 style={{ color: "#1a6a6a", fontFamily: "var(--font-body)", fontSize: "1.4rem", marginBottom: 4 }}>What&apos;s Going On?</h2>
              <p style={{ color: "#666", marginBottom: 20, fontSize: "0.9rem" }}>Describe what you&apos;ve noticed with {petName}. The more detail the better.</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0 32px" }}>
                <div className="form-group">
                  <label>Describe the concern *</label>
                  <textarea
                    className="form-input"
                    value={concern}
                    onChange={e => setConcern(e.target.value)}
                    rows={6}
                    placeholder={`e.g. ${petName} has been limping on the front left leg for 2 days, not eating well, and seems lethargic...`}
                    style={{ resize: "vertical" }}
                  />
                  <p style={{ fontSize: "0.8rem", color: concern.length > 900 ? "#ef4444" : "#9ca3af", marginTop: 4 }}>
                    {concern.length}/1000 characters
                  </p>
                </div>

                <div>
                  <p style={{ fontWeight: 700, color: "#374151", marginBottom: 4, fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Preferred Pharmacy <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "#9ca3af" }}>(optional)</span>
                  </p>
                  {pharmacyPrefilled && (
                    <div style={{ background: "#f0fafa", border: "1px solid #5BC4C4", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: "0.85rem", color: "#1a6a6a" }}>
                      ✓ Pre-filled from your previous booking
                    </div>
                  )}
                  <div className="form-group">
                    <label>Pharmacy Name</label>
                    <input className="form-input" value={pharmacyName} onChange={e => setPharmacyName(e.target.value)} placeholder="CVS Pharmacy" />
                  </div>
                  <div className="form-group">
                    <label>Pharmacy Address</label>
                    <input className="form-input" value={pharmacyAddress} onChange={e => setPharmacyAddress(e.target.value)} placeholder="123 Main St, Orlando FL" />
                  </div>
                  <div className="form-group">
                    <label>Pharmacy Phone</label>
                    <input className="form-input" type="tel" value={pharmacyPhone} onChange={e => setPharmacyPhone(e.target.value)} placeholder="5551234567" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Date & Time ────────────────────────────────────────────── */}
          {step === 3 && (
            <div>
              <h2 style={{ color: "#1a6a6a", fontFamily: "var(--font-body)", fontSize: "1.4rem", marginBottom: 4 }}>Pick a Date & Time</h2>
              <p style={{ color: "#666", marginBottom: 20, fontSize: "0.9rem" }}>All times are Eastern (EST). Dr. McMillen will connect at your selected time.</p>
              <div className="form-group">
                <label>Date *</label>
                <input className="form-input" type="date" min={today} value={date} onChange={e => setDate(e.target.value)} />
              </div>

              {date && (
                <div className="form-group">
                  <label>Available Times</label>
                  {slotsLoading && <p style={{ color: "#9ca3af", fontSize: "0.9rem" }}>Loading available times…</p>}
                  {!slotsLoading && noSlots && (
                    <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "12px 14px", fontSize: "0.9rem", color: "#991b1b" }}>
                      No availability on this date. Please choose another day.
                    </div>
                  )}
                  {!slotsLoading && slots.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                      {slots.map(s => (
                        <button key={s} type="button" onClick={() => setTime(s)}
                          className="btn"
                          style={{
                            padding: "10px 4px", fontSize: "0.85rem",
                            background: time === s ? "#1a6a6a" : "#f3f4f6",
                            color: time === s ? "#fff" : "#374151",
                            border: time === s ? "2px solid #1a6a6a" : "2px solid transparent",
                          }}>
                          {fmtTime(s)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Agreements ─────────────────────────────────────────────── */}
          {step === 4 && (
            <div>
              <h2 style={{ color: "#1a6a6a", fontFamily: "var(--font-body)", fontSize: "1.4rem", marginBottom: 4 }}>Required Agreements</h2>
              <p style={{ color: "#666", marginBottom: 20, fontSize: "0.9rem" }}>Please read and accept all agreements to continue.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {AGREEMENTS.map(a => (
                  <div key={a.key} style={{ border: `1px solid ${agreements[a.key] ? "#1a6a6a" : "#e5e7eb"}`, borderRadius: 10, overflow: "hidden" }}>
                    <div
                      onClick={() => setExpanded(expanded === a.key ? null : a.key)}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer", background: agreements[a.key] ? "#f0fafa" : "#fff" }}
                    >
                      <input type="checkbox" checked={agreements[a.key]} onChange={() => setAgreements(prev => ({ ...prev, [a.key]: !prev[a.key] }))}
                        onClick={e => e.stopPropagation()}
                        style={{ width: 18, height: 18, accentColor: "#1a6a6a", flexShrink: 0, cursor: "pointer" }} />
                      <span style={{ flex: 1, fontSize: "0.9rem", fontWeight: 600, color: "#111827" }}>{a.title}</span>
                      <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>{expanded === a.key ? "▲" : "▼"}</span>
                    </div>
                    {expanded === a.key && (
                      <div style={{ padding: "10px 14px 14px 44px", fontSize: "0.85rem", color: "#4b5563", borderTop: "1px solid #f3f4f6", lineHeight: 1.6 }}>
                        {a.body}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {/* SMS consent — optional */}
              <div style={{ marginTop: 20, padding: "14px 16px", background: "#f9fafb", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={smsConsent}
                    onChange={e => setSmsConsent(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: "#1a6a6a", flexShrink: 0, marginTop: 2, cursor: "pointer" }}
                  />
                  <span style={{ fontSize: "0.88rem", color: "#374151", lineHeight: 1.5 }}>
                    <strong>Text Message Reminders (optional)</strong> — I consent to receive appointment reminders and updates via SMS from Stockyard Animal Health at the phone number I provided. Message &amp; data rates may apply. Reply STOP at any time to opt out.
                  </span>
                </label>
              </div>

              {!allAgreed && err && (
                <p style={{ color: "#ef4444", fontSize: "0.85rem", marginTop: 12 }}>{err}</p>
              )}
            </div>
          )}

          {/* ── Step 5: Payment ────────────────────────────────────────────────── */}
          {step === 5 && (
            <div>
              <h2 style={{ color: "#1a6a6a", fontFamily: "var(--font-body)", fontSize: "1.4rem", marginBottom: 4 }}>Review & Pay</h2>

              {/* Summary */}
              <div style={{ background: "#f9fafb", borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
                <p style={{ margin: "3px 0", fontSize: "0.9rem" }}><strong>Pet:</strong> {petName} ({petType === "Other" ? petTypeOther : petType})</p>
                <p style={{ margin: "3px 0", fontSize: "0.9rem" }}><strong>Date:</strong> {fmtDate(date)}</p>
                <p style={{ margin: "3px 0", fontSize: "0.9rem" }}><strong>Time:</strong> {fmtTime(time)}</p>
                <p style={{ margin: "3px 0", fontSize: "0.9rem" }}><strong>Concern:</strong> {concern.slice(0, 80)}{concern.length > 80 ? "…" : ""}</p>
              </div>

              {/* Promo */}
              <div className="form-group">
                <label>Promo Code <span style={{ color: "#9ca3af" }}>(optional)</span></label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input className="form-input" value={promo} onChange={e => setPromo(e.target.value.toUpperCase())}
                    placeholder="DISCOUNT20" style={{ flex: 1 }} />
                  <button type="button" className="btn" onClick={validatePromo}
                    style={{ background: "#f3f4f6", color: "#374151", padding: "0 16px", whiteSpace: "nowrap" }}>
                    Apply
                  </button>
                </div>
                {promoResult && (
                  <p style={{ fontSize: "0.85rem", marginTop: 6, color: promoResult.valid ? "#059669" : "#ef4444" }}>
                    {promoResult.valid
                      ? `✓ ${promoResult.type === "percent" ? `${promoResult.discount}% off` : `$${promoResult.discount} off`} applied`
                      : promoResult.error}
                  </p>
                )}
              </div>

              {/* Price */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderTop: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb", marginBottom: 20 }}>
                <span style={{ fontWeight: 600, fontSize: "1rem" }}>Total Due</span>
                <span style={{ fontWeight: 800, fontSize: "1.3rem", color: "#1a6a6a" }}>
                  {price === 0 ? "Free" : `$${price.toFixed(2)}`}
                </span>
              </div>

              {/* Card element */}
              {price > 0 && (
                <div className="form-group">
                  <label>Card Details</label>
                  <div ref={cardDivRef} style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "12px 14px", background: "#fff", minHeight: 44 }} />
                  {!stripeReady && <p style={{ fontSize: "0.8rem", color: "#9ca3af", marginTop: 6 }}>Loading payment form…</p>}
                </div>
              )}

              {paymentError && <div className="auth-message error" style={{ display: "block", marginBottom: 12 }}>{paymentError}</div>}

              <button
                className="btn btn-primary btn-full"
                onClick={handlePay}
                disabled={paymentLoading || (price > 0 && !stripeReady)}
                style={{ marginTop: 4 }}
              >
                {paymentLoading ? "Processing…" : price > 0 ? `Pay $${price.toFixed(2)} & Confirm` : "Confirm Booking"}
              </button>
              <p style={{ fontSize: "0.8rem", color: "#9ca3af", textAlign: "center", marginTop: 8 }}>
                🔒 Payments processed securely by Stripe
              </p>
            </div>
          )}

          {/* Error + Nav */}
          {step < 5 && (
            <>
              {err && <div className="auth-message error" style={{ display: "block", marginTop: 16 }}>{err}</div>}
              <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
                {step > 1 && (
                  <button type="button" className="btn btn-full" onClick={() => { setErr(""); setStep(s => s - 1); }}
                    style={{ background: "#f3f4f6", color: "#374151" }}>
                    Back
                  </button>
                )}
                <button type="button" className="btn btn-primary btn-full" onClick={goNext}>
                  {step === 4 ? "Continue to Payment" : "Next"}
                </button>
              </div>
            </>
          )}

          {step === 5 && (
            <button type="button" className="btn btn-full" onClick={() => { setPaymentError(""); setStep(4); }}
              style={{ background: "#f3f4f6", color: "#374151", marginTop: 12 }}>
              Back
            </button>
          )}

          {step === 1 && (
            <p style={{ textAlign: "center", marginTop: 20, fontSize: "0.85rem", color: "#9ca3af" }}>
              Already booked?{" "}
              <Link href="/manage" style={{ color: "#1a6a6a" }}>Manage your appointment</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
