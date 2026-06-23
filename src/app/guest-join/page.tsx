"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import SiteNav from "@/components/SiteNav";

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"} EST`;
}

interface Consultation {
  id: string; user_name: string; pet_name: string; pet_type: string;
  concern: string; date: string; time: string; status: string;
}

function GuestJoinInner() {
  const params = useSearchParams();
  const token = params.get("token");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [consult, setConsult] = useState<Consultation | null>(null);

  useEffect(() => {
    if (!token) { setError("Invalid link — no token found."); setLoading(false); return; }
    fetch(`/api/consultations/guest-lookup?token=${encodeURIComponent(token)}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(r => r.json()).then((d: any) => {
        if (d.error) setError(d.error);
        else setConsult(d.consultation);
        setLoading(false);
      })
      .catch(() => { setError("Failed to load appointment details."); setLoading(false); });
  }, [token]);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#f0fafa", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "#1a6a6a", fontSize: "1.1rem" }}>Loading your appointment…</p>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", background: "#f0fafa", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 4px 24px rgba(0,0,0,0.08)", padding: 40, maxWidth: 420, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h1 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: 8 }}>Link Invalid</h1>
        <p style={{ color: "#666" }}>{error}</p>
      </div>
    </div>
  );

  if (consult?.status === "cancelled") return (
    <div style={{ minHeight: "100vh", background: "#f0fafa", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 4px 24px rgba(0,0,0,0.08)", padding: 40, maxWidth: 420, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
        <h1 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: 8 }}>Appointment Cancelled</h1>
        <p style={{ color: "#666" }}>This appointment has been cancelled.</p>
      </div>
    </div>
  );

  if (consult?.status === "completed") return (
    <div style={{ minHeight: "100vh", background: "#f0fafa", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 4px 24px rgba(0,0,0,0.08)", padding: 40, maxWidth: 420, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <h1 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#1a6a6a", marginBottom: 8 }}>Consultation Complete</h1>
        <p style={{ color: "#666" }}>This appointment has already been completed.</p>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f0fafa" }}>
      <SiteNav />
      <div style={{ maxWidth: 540, margin: "0 auto", padding: "40px 16px" }}>
        <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 4px 24px rgba(0,0,0,0.08)", padding: 32, marginBottom: 20, border: "1px solid #c5e5e5" }}>
          <h1 style={{ color: "#1a6a6a", fontSize: "1.5rem", fontWeight: 700, marginBottom: 4 }}>Your Appointment</h1>
          <p style={{ color: "#888", fontSize: "0.875rem", marginBottom: 20 }}>Hi {consult!.user_name} — here are your appointment details.</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
            <div style={{ background: "#f0fafa", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontWeight: 600, color: "#1a6a6a", fontSize: "0.75rem", marginBottom: 2 }}>Date</div>
              <div style={{ color: "#333", fontSize: "0.9rem" }}>{formatDate(consult!.date)}</div>
            </div>
            <div style={{ background: "#f0fafa", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontWeight: 600, color: "#1a6a6a", fontSize: "0.75rem", marginBottom: 2 }}>Time</div>
              <div style={{ color: "#333", fontSize: "0.9rem" }}>{formatTime(consult!.time)}</div>
            </div>
            <div style={{ background: "#f0fafa", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontWeight: 600, color: "#1a6a6a", fontSize: "0.75rem", marginBottom: 2 }}>Pet</div>
              <div style={{ color: "#333", fontSize: "0.9rem" }}>{consult!.pet_name} ({consult!.pet_type})</div>
            </div>
            <div style={{ background: "#f0fafa", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontWeight: 600, color: "#1a6a6a", fontSize: "0.75rem", marginBottom: 2 }}>Concern</div>
              <div style={{ color: "#333", fontSize: "0.9rem", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{consult!.concern}</div>
            </div>
          </div>

          <a
            href={`/guest-consultation/${consult!.id}?token=${encodeURIComponent(token!)}`}
            style={{ display: "block", textAlign: "center", background: "linear-gradient(135deg,#1a6a6a,#5BC4C4)", color: "#fff", padding: "16px 24px", borderRadius: 10, fontWeight: 700, fontSize: "1.05rem", textDecoration: "none" }}
          >
            Enter Waiting Room →
          </a>
          <p style={{ textAlign: "center", fontSize: "0.8rem", color: "#aaa", marginTop: 10 }}>
            You can join early — the vet will start the call at your appointment time.
          </p>
        </div>

        <p style={{ textAlign: "center", fontSize: "0.8rem", color: "#aaa" }}>
          Need to cancel?{" "}
          <a href="/manage" style={{ color: "#1a6a6a" }}>Manage your appointment</a>
        </p>
      </div>
    </div>
  );
}

export default function GuestJoinPage() {
  return <Suspense><GuestJoinInner /></Suspense>;
}
