"use client";

import { useState } from "react";
import Link from "next/link";
import SiteNav from "@/components/SiteNav";
import TroubleModal from "@/components/TroubleModal";

interface Consultation {
  id: string;
  pet_name: string;
  pet_type: string;
  concern: string;
  date: string;
  time: string;
  status: string;
  payment_status: string;
  amount_cents: number | null;
  user_name: string;
  guest_token: string | null;
  is_guest: number | null;
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"} EST`;
}

function formatAmount(cents: number | null) {
  if (!cents) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

export default function ManageConsultationPage() {
  const [searchValue, setSearchValue] = useState("");
  const searchType = searchValue.includes("@") ? "email" : "phone";
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [selected, setSelected] = useState<Consultation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState(false);
  const [cancelRefunded, setCancelRefunded] = useState(false);
  const [troubleOpen, setTroubleOpen] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchValue.trim()) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    setConsultations([]);
    setSelected(null);

    try {
      const res = await fetch(
        `/api/consultations/manage-lookup?type=${searchType}&value=${encodeURIComponent(searchValue.trim())}`
      );
      const data = await res.json() as { consultations?: Consultation[]; error?: string };
      if (!res.ok) setError(data.error ?? "Search failed.");
      else setConsultations(data.consultations ?? []);
    } catch {
      setError("Network error. Please try again.");
    }

    setLoading(false);
  };

  const handleCancel = async () => {
    if (!selected) return;
    if (!window.confirm("Are you sure you want to cancel this consultation? If you paid, you will receive a full refund.")) return;

    setLoading(true);
    try {
      const body = searchType === "email"
        ? { email: searchValue.trim() }
        : { phone: searchValue.trim() };

      const res = await fetch(`/api/consultations/${selected.id}/guest-cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok?: boolean; refunded?: boolean; error?: string };
      if (!res.ok) {
        alert(data.error ?? "Failed to cancel. Please try again.");
      } else {
        setCancelSuccess(true);
        setCancelRefunded(data.refunded ?? false);
      }
    } catch {
      alert("Network error. Please try again.");
    }
    setLoading(false);
  };

  if (cancelSuccess) {
    return (
      <div className="auth-page">
        <SiteNav />
        <div className="auth-container">
          <div className="auth-card" style={{ textAlign: "center" }}>
            <div style={{ width: 72, height: 72, background: "#fee2e2", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <svg width="36" height="36" fill="none" stroke="#ef4444" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 style={{ color: "#1a6a6a", marginBottom: 8 }}>Consultation Cancelled</h2>
            <p style={{ color: "#666", marginBottom: 24 }}>
              {cancelRefunded
                ? "Your consultation has been cancelled and a full refund has been issued to your card. Please allow 5–10 business days."
                : "Your consultation has been cancelled successfully."}
            </p>
            <Link href="/book" className="btn btn-primary">Book a New Appointment</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <SiteNav />
      <div className="auth-container" style={{ maxWidth: 640 }}>
        <div className="auth-card">
          <h2 style={{ fontFamily: "var(--font-body)", fontSize: "1.5rem", color: "#1a6a6a", textAlign: "center", marginBottom: 8 }}>
            Manage Your Consultation
          </h2>
          <p style={{ textAlign: "center", color: "#666", marginBottom: 24 }}>
            Enter your email or phone number to look up your appointment
          </p>

          <form onSubmit={handleSearch}>
            <div className="form-group">
              <input
                type="text"
                className="form-input"
                placeholder="Email address or phone number"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                required
                inputMode="email"
              />
            </div>

            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? "Searching…" : "Find My Appointment"}
            </button>
          </form>

          {error && (
            <div className="auth-message error" style={{ display: "block", marginTop: 16 }}>{error}</div>
          )}

          {searched && !loading && (
            <div style={{ marginTop: 24 }}>
              {consultations.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <p style={{ color: "#6b7280" }}>No upcoming consultations found.</p>
                  <Link href="/book" style={{ color: "#1a6a6a", marginTop: 12, display: "inline-block" }}>
                    Book a new consultation →
                  </Link>
                </div>
              ) : (
                <div>
                  <h3 style={{ fontWeight: 600, marginBottom: 12, color: "#111827" }}>Your Upcoming Consultations</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {consultations.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => setSelected(selected?.id === c.id ? null : c)}
                        style={{
                          padding: "14px 16px",
                          borderRadius: 12,
                          border: `2px solid ${selected?.id === c.id ? "#1a6a6a" : "#e5e7eb"}`,
                          background: selected?.id === c.id ? "#f0fafa" : "#fff",
                          cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          <div style={{ width: 44, height: 44, background: "#e0f2f1", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                            {c.pet_type === "Dog" ? "🐕" : c.pet_type === "Cat" ? "🐈" : c.pet_type === "Horse" ? "🐴" : "🐾"}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, color: "#111827" }}>{c.pet_name} ({c.pet_type})</div>
                            <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>{c.concern}</div>
                            <div style={{ fontSize: "0.85rem", color: "#1a6a6a", fontWeight: 500 }}>
                              {formatDate(c.date)} at {formatTime(c.time)}
                            </div>
                          </div>
                          <span style={{
                            padding: "3px 10px", borderRadius: 99, fontSize: "0.75rem", fontWeight: 600,
                            background: c.status === "in_progress" ? "#dcfce7" : c.status === "pending" ? "#fef9c3" : "#f0fafa",
                            color: c.status === "in_progress" ? "#15803d" : c.status === "pending" ? "#854d0e" : "#1a6a6a",
                          }}>
                            {c.status === "in_progress" ? "In Progress" : c.status === "pending" ? "Upcoming" : c.status === "confirmed" ? "Confirmed" : c.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {selected && (
            <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid #e5e7eb" }}>
              <h3 style={{ fontWeight: 600, marginBottom: 12, color: "#111827" }}>Consultation Details</h3>
              <div style={{ background: "#f9fafb", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    {[
                      ["Pet", `${selected.pet_name} (${selected.pet_type})`],
                      ["Concern", selected.concern],
                      ["Date", formatDate(selected.date)],
                      ["Time", formatTime(selected.time)],
                      ["Amount", formatAmount(selected.amount_cents)],
                      ["Status", selected.status === "in_progress" ? "In Progress" : selected.status === "pending" ? "Upcoming" : selected.status],
                    ].map(([label, value]) => (
                      <tr key={label}>
                        <td style={{ padding: "4px 0", fontWeight: 600, fontSize: "0.875rem", color: "#374151", width: "30%" }}>{label}</td>
                        <td style={{ padding: "4px 0", fontSize: "0.875rem", color: "#4b5563" }}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selected.is_guest && selected.guest_token && (
                <a
                  href={`/guest-join?token=${encodeURIComponent(selected.guest_token)}`}
                  className="btn btn-primary btn-full"
                  style={{ display: "block", textAlign: "center", marginBottom: 12 }}
                >
                  Join My Appointment →
                </a>
              )}

              {selected.status === "in_progress" ? (
                <p style={{ fontSize: "0.875rem", color: "#6b7280", textAlign: "center", padding: "12px 0" }}>
                  Your consultation is currently in progress and cannot be cancelled.
                </p>
              ) : (
                <>
                  <button
                    onClick={handleCancel}
                    disabled={loading}
                    className="btn btn-full"
                    style={{ background: "#ef4444", color: "#fff", opacity: loading ? 0.6 : 1 }}
                  >
                    {loading ? "Cancelling…" : "Cancel This Consultation"}
                  </button>
                  <p style={{ fontSize: "0.8rem", color: "#9ca3af", textAlign: "center", marginTop: 10 }}>
                    If you paid, a full refund will be issued automatically.
                  </p>
                </>
              )}
            </div>
          )}

          <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid #f3f4f6", textAlign: "center" }}>
            <button onClick={() => setTroubleOpen(true)} style={{ background: "none", border: "none", color: "#1a6a6a", fontSize: "0.85rem", cursor: "pointer", fontWeight: 600, padding: 0, textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3 }}>
              Having Trouble?
            </button>
          </div>
        </div>
      </div>
      {troubleOpen && <TroubleModal onClose={() => setTroubleOpen(false)} />}
    </div>
  );
}
