"use client";

import { useEffect, useState, useRef, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import SiteNav from "@/components/SiteNav";
import { logCall } from "@/lib/clientLog";

const VideoCallOverlay = dynamic(() => import("@/components/VideoCallOverlay"), { ssr: false });

interface Consultation {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_phone: string | null;
  pet_name: string;
  pet_type: string;
  pet_breed: string | null;
  pet_dob: string | null;
  pet_weight: number | null;
  pet_sex: string | null;
  pet_spayed_neutered: number | null;
  pet_color: string | null;
  concern: string;
  date: string;
  time: string;
  status: string;
  payment_status: string;
  notes: string | null;
  amount_cents: number | null;
  stripe_payment_intent_id: string | null;
  completed_at: number | null;
  cancelled_at: number | null;
  daily_room_url: string | null;
  agreements_json: string | null;
  agreements_signed_at: number | null;
  agreements_client_name: string | null;
  ai_summary: string | null;
  ai_summary_approved: number;
  discharge_sent: number;
  discharge_sent_at: number | null;
  pharmacy_name: string | null;
  pharmacy_address: string | null;
  pharmacy_phone: string | null;
  pharmacy_fax: string | null;
  pharmacy_email: string | null;
}

interface SoapNotes { subjective: string; objective: string; assessment: string; plan: string; }

function parseSoap(notes: string | null): SoapNotes {
  if (!notes) return { subjective: "", objective: "", assessment: "", plan: "" };
  try {
    const p = JSON.parse(notes);
    if (p && typeof p === "object" && "subjective" in p) return p as SoapNotes;
  } catch { /* */ }
  return { subjective: "", objective: "", assessment: "", plan: notes };
}

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"} EST`;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: "badge-pending", scheduled: "badge-pending",
    in_progress: "badge-in-progress", completed: "badge-completed", cancelled: "badge-cancelled",
  };
  return `badge ${map[status] || "badge-pending"}`;
}

export default function ConsultationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // SOAP editor (inline, always visible)
  const [soap, setSoap] = useState<SoapNotes>({ subjective: "", objective: "", assessment: "", plan: "" });
  const [soapSaving, setSoapSaving] = useState(false);
  const [soapSaved, setSoapSaved] = useState(false);

  // Pharmacy edit
  const [pharmacyEditing, setPharmacyEditing] = useState(false);
  const [pharmacyForm, setPharmacyForm] = useState({ name: "", address: "", phone: "", fax: "", email: "" });
  const [pharmacyQuery, setPharmacyQuery] = useState("");
  const [pharmacyResults, setPharmacyResults] = useState<{ name: string; address: string; phone: string | null; fax: string | null; email: string | null }[]>([]);
  const [pharmacySearching, setPharmacySearching] = useState(false);
  const pharmacyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pharmacySaving, setPharmacySaving] = useState(false);
  const [pharmacySaved, setPharmacySaved] = useState(false);

  // Cancel confirm
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [videoCallOpen, setVideoCallOpen] = useState(false);

  // Lobby state
  const [lobbyState, setLobbyState] = useState<"idle" | "waiting" | "joined">("idle");
  const [vetReadyLoading, setVetReadyLoading] = useState(false);
  const lobbyPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [lobbyStream, setLobbyStream] = useState<MediaStream | null>(null);
  const lobbyVideoRef = useRef<HTMLVideoElement>(null);
  // True when the client is currently sitting in the waiting room (fresh lobby_customer),
  // detected even while the vet is idle so the vet is prompted to join.
  const [clientWaiting, setClientWaiting] = useState(false);
  const idleWatchRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // AI discharge summary
  const [aiSummary, setAiSummary] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  const [dischargeApproving, setDischargeApproving] = useState(false);
  const [dischargeMsg, setDischargeMsg] = useState("");

  async function loadConsultation() {
    const r = await fetch(`/api/consultations/${id}`);
    if (!r.ok) { setError("Consultation not found."); setLoading(false); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d: any = await r.json();
    setConsultation(d.consultation);
    setSoap(parseSoap(d.consultation.notes));
    if (d.consultation.ai_summary) setAiSummary(d.consultation.ai_summary);
    setLoading(false);
  }

  async function generateAiSummary() {
    setAiGenerating(true);
    setAiError("");
    try {
      const r = await fetch(`/api/consultations/${id}/ai-summary`, { method: "POST" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d: any = await r.json();
      if (!r.ok) { setAiError(d.error || "Failed to generate summary."); }
      else { setAiSummary(d.summary); }
    } catch {
      setAiError("Network error. Please try again.");
    } finally {
      setAiGenerating(false);
    }
  }

  async function approveAndComplete() {
    if (!aiSummary.trim()) return;
    setDischargeApproving(true);
    setDischargeMsg("");
    try {
      // 1. Send discharge email
      const r = await fetch(`/api/consultations/${id}/approve-discharge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: aiSummary }),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d: any = await r.json();
      if (!r.ok) { setDischargeMsg(d.error || "Failed to send discharge email."); setDischargeApproving(false); return; }

      // 2. Mark consultation complete
      await fetch(`/api/consultations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed", completed_at: String(Math.floor(Date.now() / 1000)) }),
      });

      router.push("/vet-dashboard?tab=history");
    } catch {
      setDischargeMsg("Network error. Please try again.");
    } finally {
      setDischargeApproving(false);
    }
  }

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.ok ? r.json() : null).then((d: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!d?.user || d.user.role !== "vet") { router.push("/vet-login"); return; }
      loadConsultation();
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up lobby poll on unmount
  useEffect(() => {
    return () => { if (lobbyPollRef.current) clearInterval(lobbyPollRef.current); };
  }, []);

  // While idle on an active consultation, watch for the client arriving in the waiting
  // room (fresh lobby_customer). This makes the handoff robust: even if the vet's own
  // "I'm Ready" wait already timed out, the vet is re-prompted the moment the client is
  // ready — no need to guess or repeatedly click. The server only returns lobby_customer
  // if it was heartbeated in the last ~10s, so this flips back off when the client leaves.
  const watchStatus = consultation?.status;
  useEffect(() => {
    const canWatch = !!watchStatus
      && !["completed", "cancelled"].includes(watchStatus)
      && lobbyState === "idle"
      && !videoCallOpen;
    if (!canWatch) {
      setClientWaiting(false);
      if (idleWatchRef.current) { clearInterval(idleWatchRef.current); idleWatchRef.current = null; }
      return;
    }
    let cancelled = false;
    const check = async () => {
      try {
        const r = await fetch(`/api/consultations/${id}/signal?keys=lobby_customer`);
        if (!r.ok) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = await r.json() as any;
        if (!cancelled) setClientWaiting(!!d.lobby_customer);
      } catch { /* transient — keep watching */ }
    };
    check();
    idleWatchRef.current = setInterval(check, 4000);
    return () => {
      cancelled = true;
      if (idleWatchRef.current) { clearInterval(idleWatchRef.current); idleWatchRef.current = null; }
    };
  }, [id, watchStatus, lobbyState, videoCallOpen]);

  function openPharmacyEdit() {
    setPharmacyForm({
      name: consultation?.pharmacy_name ?? "",
      address: consultation?.pharmacy_address ?? "",
      phone: consultation?.pharmacy_phone ?? "",
      fax: consultation?.pharmacy_fax ?? "",
      email: consultation?.pharmacy_email ?? "",
    });
    setPharmacyQuery("");
    setPharmacyResults([]);
    setPharmacySaved(false);
    setPharmacyEditing(true);
  }

  function handlePharmacySearch(q: string) {
    setPharmacyQuery(q);
    if (pharmacyTimerRef.current) clearTimeout(pharmacyTimerRef.current);
    if (q.length < 2) { setPharmacyResults([]); return; }
    pharmacyTimerRef.current = setTimeout(async () => {
      setPharmacySearching(true);
      try {
        const r = await fetch("/api/pharmacy/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
        });
        if (r.ok) {
          const d = await r.json() as { pharmacies: { name: string; address: string; phone: string | null; fax: string | null; email: string | null }[] };
          setPharmacyResults(d.pharmacies.slice(0, 8));
        }
      } catch { /* ignore */ }
      setPharmacySearching(false);
    }, 400);
  }

  function selectPharmacy(p: { name: string; address: string; phone: string | null; fax: string | null; email: string | null }) {
    setPharmacyForm({ name: p.name, address: p.address, phone: p.phone ?? "", fax: p.fax ?? "", email: p.email ?? "" });
    setPharmacyQuery(p.name);
    setPharmacyResults([]);
  }

  async function savePharmacy() {
    setPharmacySaving(true);
    await fetch(`/api/consultations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pharmacy_name: pharmacyForm.name || null,
        pharmacy_address: pharmacyForm.address || null,
        pharmacy_phone: pharmacyForm.phone || null,
        pharmacy_fax: pharmacyForm.fax || null,
        pharmacy_email: pharmacyForm.email || null,
      }),
    });
    await loadConsultation();
    setPharmacySaving(false);
    setPharmacySaved(true);
    setPharmacyEditing(false);
    setTimeout(() => setPharmacySaved(false), 3000);
  }

  // Write/refresh our lobby presence. The server only treats presence as valid if it
  // was heartbeated within the last ~10s, so we must keep re-writing while waiting.
  function writeLobbyPresence() {
    return fetch(`/api/consultations/${id}/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "lobby_vet", data: { ts: Date.now() } }),
    }).catch(() => {});
  }

  async function markVetReady() {
    if (vetReadyLoading) return;
    setVetReadyLoading(true);
    logCall(id, "vet", "ready_click");

    // Pre-acquire camera so permission is granted before the overlay opens
    if (!lobbyStream) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        setLobbyStream(stream);
        if (lobbyVideoRef.current) {
          lobbyVideoRef.current.srcObject = stream;
          lobbyVideoRef.current.play().catch(() => {});
        }
      } catch { /* VideoCallOverlay will handle the error */ }
    }

    // Kick off notification + status update
    await fetch(`/api/consultations/${id}/start`, { method: "POST" });
    await loadConsultation();

    // Clear any WebRTC negotiation debris left by a prior session that ended without a
    // clean hang-up (browser crash, phone died, tab closed). This is safe to do
    // unconditionally: the vet is always the offerer, so at this moment (before our own
    // fresh offer exists) any offer/answer/ice present is necessarily stale — the
    // customer, as callee, produces no negotiation signals until our offer appears. We do
    // NOT clear lobby_* keys (the client may already be waiting and heartbeating).
    await fetch(`/api/consultations/${id}/signal?keys=offer,answer,ice_vet,ice_customer,ready_vet,ready_customer`, { method: "DELETE" }).catch(() => {});

    // Write our lobby presence
    await writeLobbyPresence();

    // Check if customer is already (freshly) waiting
    const res = await fetch(`/api/consultations/${id}/signal?keys=lobby_customer`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as any;
    setVetReadyLoading(false);
    if (data.lobby_customer) {
      logCall(id, "vet", "lobby_joined", { via: "immediate" });
      setLobbyState("joined");
      setVideoCallOpen(true);
    } else {
      setLobbyState("waiting");
      // Poll for customer lobby signal — give up after ~2 min
      let retries = 0;
      const MAX_RETRIES = 40;
      lobbyPollRef.current = setInterval(async () => {
        retries++;
        if (retries > MAX_RETRIES) {
          clearInterval(lobbyPollRef.current!);
          lobbyPollRef.current = null;
          setLobbyState("idle");
          logCall(id, "vet", "lobby_timeout");
          alert("Client hasn't joined yet. You can try again when they're ready.");
          return;
        }
        // Heartbeat our presence so the client sees us as live, then check if they're ready.
        writeLobbyPresence();
        const r = await fetch(`/api/consultations/${id}/signal?keys=lobby_customer`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = await r.json() as any;
        if (d.lobby_customer) {
          clearInterval(lobbyPollRef.current!);
          lobbyPollRef.current = null;
          logCall(id, "vet", "lobby_joined", { via: "poll" });
          setLobbyState("joined");
          setVideoCallOpen(true);
        }
      }, 3000);
    }
  }

  async function resendVideoLink() {
    await fetch(`/api/consultations/${id}/resend-video-link`, { method: "POST" });
    alert("Video link resent.");
  }

  async function saveSoap(markComplete: boolean) {
    setSoapSaving(true);
    const notesJson = JSON.stringify(soap);
    const body: Record<string, string> = { notes: notesJson };
    if (markComplete) { body.status = "completed"; body.completed_at = String(Math.floor(Date.now() / 1000)); }
    await fetch(`/api/consultations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSoapSaving(false);
    setSoapSaved(true);
    setTimeout(() => setSoapSaved(false), 3000);
    await loadConsultation();
    // Auto-generate AI discharge right after saving SOAP
    const anyFilled = soap.subjective.trim() || soap.objective.trim() || soap.assessment.trim() || soap.plan.trim();
    if (anyFilled) generateAiSummary();
  }

  async function cancelConsultation() {
    setCancelLoading(true);
    await fetch(`/api/consultations/${id}/cancel`, { method: "POST" });
    setCancelLoading(false);
    setCancelConfirm(false);
    await loadConsultation();
  }

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-cream)" }}>
      <p>Loading…</p>
    </div>
  );

  if (error || !consultation) return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px" }}>
      <p style={{ color: "#dc3545" }}>{error || "Not found."}</p>
      <Link href="/vet-dashboard" className="btn btn-secondary btn-small">← Back to Dashboard</Link>
    </div>
  );

  const c = consultation;
  // Denylist, not allowlist: any non-terminal status is actionable (joinable/cancellable),
  // so a valid status like "confirmed" never silently hides the call controls.
  const isActive = !["completed", "cancelled"].includes(c.status);

  return (
    <>
    <div style={{ minHeight: "100vh", background: "var(--color-cream)", fontFamily: "var(--font-body)" }}>
      <SiteNav />

      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "24px 16px" }}>

        {/* Back button */}
        <div style={{ marginBottom: "16px" }}>
          <Link href="/vet-dashboard" style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#1a6a6a", fontWeight: 600, fontSize: "0.9rem", textDecoration: "none", opacity: 0.8 }}>
            ← Back to Dashboard
          </Link>
        </div>

        {/* Page title */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <h2 style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "1.5rem", color: "#1a6a6a", margin: 0 }}>
              {c.pet_name} <span style={{ fontWeight: 400, color: "#1a6a6a" }}>({c.pet_type})</span>
            </h2>
            <span className={statusBadge(c.status)}>{c.status.replace(/_/g, " ")}</span>
          </div>
          <p style={{ color: "#888", marginTop: "4px", fontSize: "0.9rem" }}>
            {new Date(c.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })} · {formatTime(c.time)}
          </p>
        </div>

        {/* Client-is-waiting prompt — shown while idle when the client is in the room */}
        {isActive && lobbyState === "idle" && clientWaiting && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#e8f8ec", border: "1px solid #28a745", borderRadius: 10, padding: "12px 16px", marginBottom: "14px" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#28a745", display: "inline-block", animation: "pulse 1.5s ease-in-out infinite", flexShrink: 0 }} />
            <span style={{ fontSize: "0.9rem", color: "#1a6a6a", fontWeight: 600 }}>
              🔔 Your client is in the waiting room — tap “I&apos;m Ready to Join” to start the call.
            </span>
          </div>
        )}

        {/* Action buttons */}
        {isActive && (
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "24px", alignItems: "center" }}>
            {lobbyState === "idle" && (
              <button className="btn btn-primary btn-small" onClick={markVetReady} disabled={vetReadyLoading} style={{ opacity: vetReadyLoading ? 0.7 : 1, WebkitTapHighlightColor: "transparent", ...(clientWaiting ? { animation: "pulse 1.5s ease-in-out infinite" } : {}) }}>
                {vetReadyLoading ? "🎥 Starting…" : "🎥 I'm Ready to Join"}
              </button>
            )}
            {lobbyState === "waiting" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#f0fafa", border: "1px solid #c5e5e5", borderRadius: 8, padding: "6px 14px", fontSize: "0.875rem", color: "#1a6a6a", fontWeight: 600 }}>
                  <span style={{ width: 14, height: 14, border: "2px solid #c5e5e5", borderTopColor: "#1a6a6a", borderRadius: "50%", display: "inline-block", animation: "spin 1s linear infinite" }} />
                  Waiting for client to join…
                </span>
                {lobbyStream && (
                  <div style={{ position: "relative", display: "inline-block" }}>
                    <video ref={lobbyVideoRef} autoPlay playsInline muted style={{ width: 180, borderRadius: 10, background: "#333", display: "block", border: "2px solid #c5e5e5" }} />
                    <div style={{ position: "absolute", top: 6, left: 6, background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: "0.68rem", fontWeight: 600, padding: "2px 6px", borderRadius: 5 }}>Your camera</div>
                  </div>
                )}
              </div>
            )}
            {c.status === "in_progress" && lobbyState === "idle" && (
              <button className="btn btn-small" style={{ background: "#6c757d", color: "#fff", border: "none" }} onClick={resendVideoLink}>
                📧 Resend Video Link
              </button>
            )}
            <button className="btn btn-small" style={{ background: "#dc3545", color: "#fff", border: "none" }} onClick={() => setCancelConfirm(true)}>
              Cancel &amp; Refund
            </button>
          </div>
        )}

        {/* Cancel confirm */}
        {cancelConfirm && (
          <div style={{ background: "#fff3cd", border: "1px solid #ffc107", borderRadius: "10px", padding: "16px 20px", marginBottom: "20px" }}>
            <p style={{ fontWeight: 600, marginBottom: "12px" }}>Cancel this consultation and issue a refund?</p>
            <div style={{ display: "flex", gap: "10px" }}>
              <button className="btn btn-small" style={{ background: "#dc3545", color: "#fff", border: "none" }} onClick={cancelConsultation} disabled={cancelLoading}>
                {cancelLoading ? "Cancelling…" : "Yes, Cancel & Refund"}
              </button>
              <button className="btn btn-secondary btn-small" onClick={() => setCancelConfirm(false)}>Never mind</button>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "20px", marginBottom: "20px" }}>
          {/* Appointment info */}
          <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "var(--shadow)" }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#1a6a6a", marginBottom: "14px" }}>Appointment</div>
            <div style={{ display: "grid", gap: "12px" }}>
              <div>
                <div style={{ fontSize: "0.75rem", color: "#999", marginBottom: "2px" }}>Date</div>
                <div style={{ fontWeight: 600, color: "#1a6a6a" }}>{new Date(c.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" })}</div>
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", color: "#999", marginBottom: "2px" }}>Time</div>
                <div style={{ fontWeight: 600, color: "#1a6a6a" }}>{formatTime(c.time)}</div>
              </div>
              {c.amount_cents != null && (
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#999", marginBottom: "2px" }}>Payment</div>
                  <div style={{ fontWeight: 600, color: "#1a6a6a" }}>${(c.amount_cents / 100).toFixed(2)} · {c.payment_status}</div>
                </div>
              )}
            </div>
          </div>

          {/* Customer info */}
          <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "var(--shadow)" }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#1a6a6a", marginBottom: "14px" }}>Customer</div>
            <div style={{ display: "grid", gap: "12px" }}>
              <div>
                <div style={{ fontSize: "0.75rem", color: "#999", marginBottom: "2px" }}>Name</div>
                <div style={{ fontWeight: 600, color: "#1a6a6a" }}>{c.user_name}</div>
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", color: "#999", marginBottom: "2px" }}>Email</div>
                <div style={{ fontWeight: 600, color: "#1a6a6a" }}>{c.user_email}</div>
              </div>
              {c.user_phone && (
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#999", marginBottom: "2px" }}>Phone</div>
                  <div style={{ fontWeight: 600, color: "#1a6a6a" }}>{c.user_phone}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pet + Concern */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "20px", marginBottom: "20px" }}>
          <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "var(--shadow)" }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#1a6a6a", marginBottom: "14px" }}>Pet</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px" }}>
              {[
                { label: "Name", value: c.pet_name },
                { label: "Type", value: c.pet_type },
                { label: "Breed", value: c.pet_breed },
                { label: "Weight", value: c.pet_weight != null ? `${c.pet_weight} lbs` : null },
                { label: "Date of Birth", value: c.pet_dob
                    ? (() => { const [y,m,d] = c.pet_dob!.split("-"); return `${m}-${d}-${y}`; })()
                    : null },
                { label: "Sex", value: c.pet_sex },
                { label: c.pet_sex === "Female" ? "Spayed" : "Neutered", value: c.pet_sex ? (c.pet_spayed_neutered ? "Yes" : "No") : null },
                { label: "Color", value: c.pet_color },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: "0.75rem", color: "#999", marginBottom: "2px" }}>{label}</div>
                  <div style={{ fontWeight: 600, color: value ? "#1a6a6a" : "#ccc" }}>{value ?? "—"}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "var(--shadow)" }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#1a6a6a", marginBottom: "14px" }}>Primary Concern</div>
            <div style={{ background: "var(--color-cream)", borderRadius: "8px", padding: "14px 16px", color: "#1a6a6a", lineHeight: 1.7 }}>{c.concern}</div>
          </div>
        </div>

        {/* Pharmacy */}
        <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "var(--shadow)", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#1a6a6a" }}>Pharmacy</div>
            {!pharmacyEditing && (
              <button
                type="button"
                onClick={openPharmacyEdit}
                style={{ background: "none", border: "1px solid #d4c9b8", borderRadius: "6px", padding: "4px 12px", fontSize: "0.78rem", fontWeight: 600, color: "#1a6a6a", cursor: "pointer" }}
              >
                ✏️ Edit
              </button>
            )}
          </div>

          {pharmacyEditing ? (
            <div>
              {/* Search */}
              <div style={{ position: "relative", marginBottom: "14px" }}>
                <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "#333", display: "block", marginBottom: "4px" }}>Search Pharmacy</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Search by name…"
                  value={pharmacyQuery}
                  onChange={e => handlePharmacySearch(e.target.value)}
                  autoComplete="off"
                />
                {(pharmacySearching || pharmacyResults.length > 0) && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1.5px solid #d4c9b8", borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 100, maxHeight: "280px", overflowY: "auto" }}>
                    {pharmacySearching && <div style={{ padding: "10px 14px", fontSize: "0.82rem", color: "#aaa" }}>Searching…</div>}
                    {pharmacyResults.map((p, i) => (
                      <button key={i} type="button" onClick={() => selectPharmacy(p)} style={{ width: "100%", textAlign: "left", padding: "10px 14px", background: "none", border: "none", borderBottom: i < pharmacyResults.length - 1 ? "1px solid #f0ece6" : "none", cursor: "pointer", fontFamily: "inherit" }}>
                        <div style={{ fontWeight: 700, color: "#1a6a6a", fontSize: "0.9rem" }}>{p.name}</div>
                        <div style={{ fontSize: "0.78rem", color: "#888", marginTop: "2px" }}>{p.address}</div>
                        {(p.fax || p.phone) && <div style={{ fontSize: "0.73rem", color: "#aaa", marginTop: "1px" }}>{p.fax ? `Fax: ${p.fax}` : ""}{p.fax && p.phone ? " · " : ""}{p.phone ? `Ph: ${p.phone}` : ""}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Manual fields */}
              <div style={{ display: "grid", gap: "10px", marginBottom: "16px" }}>
                {(["name", "address", "phone", "fax", "email"] as const).map(field => (
                  <div key={field}>
                    <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#333", display: "block", marginBottom: "3px", textTransform: "capitalize" }}>{field}</label>
                    <input
                      type="text"
                      className="form-input"
                      value={pharmacyForm[field]}
                      onChange={e => setPharmacyForm(f => ({ ...f, [field]: e.target.value }))}
                      placeholder={field === "name" ? "Pharmacy name" : field === "address" ? "Address" : field === "phone" ? "Phone number" : field === "fax" ? "Fax number" : "Email address"}
                    />
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <button className="btn btn-primary btn-small" onClick={savePharmacy} disabled={pharmacySaving}>
                  {pharmacySaving ? "Saving…" : "Save Pharmacy"}
                </button>
                <button className="btn btn-secondary btn-small" onClick={() => setPharmacyEditing(false)}>Cancel</button>
                {pharmacySaved && <span style={{ color: "#28a745", fontSize: "0.875rem", fontWeight: 600 }}>✓ Saved</span>}
              </div>
            </div>
          ) : (
            <>
              {(c.pharmacy_name || c.pharmacy_phone || c.pharmacy_fax || c.pharmacy_email || c.pharmacy_address) ? (
                <div style={{ display: "grid", gap: "10px" }}>
                  {c.pharmacy_name && (
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "#999", marginBottom: "2px" }}>Name</div>
                      <div style={{ fontWeight: 600, color: "#1a6a6a" }}>{c.pharmacy_name}</div>
                    </div>
                  )}
                  {c.pharmacy_address && (
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "#999", marginBottom: "2px" }}>Address</div>
                      <div style={{ fontWeight: 600, color: "#1a6a6a" }}>{c.pharmacy_address}</div>
                    </div>
                  )}
                  {c.pharmacy_phone && (
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "#999", marginBottom: "2px" }}>Phone</div>
                      <div style={{ fontWeight: 600, color: "#1a6a6a" }}>{c.pharmacy_phone}</div>
                    </div>
                  )}
                  {c.pharmacy_fax && (
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "#999", marginBottom: "2px" }}>Fax</div>
                      <div style={{ fontWeight: 600, color: "#1a6a6a" }}>{c.pharmacy_fax}</div>
                    </div>
                  )}
                  {c.pharmacy_email && (
                    <div>
                      <div style={{ fontSize: "0.75rem", color: "#999", marginBottom: "2px" }}>Email</div>
                      <div style={{ fontWeight: 600, color: "#1a6a6a" }}>{c.pharmacy_email}</div>
                    </div>
                  )}
                </div>
              ) : (
                <p style={{ color: "#bbb", fontSize: "0.875rem", fontStyle: "italic" }}>No pharmacy on file — click Edit to add one.</p>
              )}
            </>
          )}
        </div>

        {/* SOAP Notes — inline, always visible */}
        <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "var(--shadow)", marginBottom: "20px" }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#1a6a6a", marginBottom: "16px" }}>SOAP Notes</div>

          {c.status === "completed" ? (
            /* Read-only view for completed consultations */
            <div style={{ display: "grid", gap: "12px" }}>
              {(["subjective", "objective", "assessment", "plan"] as (keyof SoapNotes)[]).map((k) => {
                const val = parseSoap(c.notes)[k];
                return (
                  <div key={k} style={{ background: "var(--color-cream)", borderRadius: "8px", padding: "12px 16px" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#1a6a6a", marginBottom: "4px", textTransform: "capitalize" }}>{k}</div>
                    <div style={{ fontSize: "0.9rem", color: val ? "#6b3a1f" : "#bbb", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{val || "—"}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Editable inline SOAP */
            <>
              {(["subjective", "objective", "assessment", "plan"] as (keyof SoapNotes)[]).map((k) => (
                <div className="form-group" key={k}>
                  <label style={{ fontWeight: 700, color: "#1a6a6a", textTransform: "capitalize" }}>
                    <span style={{ fontSize: "1.1rem" }}>{k[0].toUpperCase()}</span>{k.slice(1)}
                    {k === "subjective" && <span style={{ fontWeight: 400, color: "#5BC4C4", marginLeft: "6px", fontSize: "0.8rem" }}>— Patient history & owner report</span>}
                    {k === "objective" && <span style={{ fontWeight: 400, color: "#5BC4C4", marginLeft: "6px", fontSize: "0.8rem" }}>— Observations & findings</span>}
                    {k === "assessment" && <span style={{ fontWeight: 400, color: "#5BC4C4", marginLeft: "6px", fontSize: "0.8rem" }}>— Diagnosis / differential</span>}
                    {k === "plan" && <span style={{ fontWeight: 400, color: "#5BC4C4", marginLeft: "6px", fontSize: "0.8rem" }}>— Treatment & follow-up</span>}
                  </label>
                  <textarea
                    className="form-input"
                    rows={3}
                    value={soap[k]}
                    onChange={(e) => setSoap({ ...soap, [k]: e.target.value })}
                    placeholder={
                      k === "subjective" ? "Owner reports…" :
                      k === "objective" ? "On video observation…" :
                      k === "assessment" ? "Working diagnosis…" :
                      "Treatment plan, prescriptions, follow-up…"
                    }
                  />
                </div>
              ))}
              <div style={{ marginTop: "8px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  className="btn btn-primary btn-small"
                  onClick={() => saveSoap(false)}
                  disabled={soapSaving || !(["subjective","objective","assessment","plan"] as const).every((k) => soap[k].trim())}
                >
                  {soapSaving ? "Saving…" : "Save Notes"}
                </button>
                {soapSaved && <span style={{ color: "#28a745", fontSize: "0.875rem", fontWeight: 600 }}>✓ Saved — generating discharge…</span>}
              </div>
            </>
          )}
        </div>

        {/* AI Discharge Summary */}
        <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "var(--shadow)", marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#1a6a6a" }}>
                Discharge Summary
              </div>
              {c.discharge_sent === 1 && c.discharge_sent_at && (
                <div style={{ fontSize: "0.78rem", color: "#28a745", marginTop: "4px", fontWeight: 600 }}>
                  ✓ Sent to {c.user_name} on {new Date(c.discharge_sent_at * 1000).toLocaleString()}
                </div>
              )}
              {c.status === "completed" && (
                <div style={{ fontSize: "0.75rem", color: "#888", marginTop: "4px" }}>
                  Locked — consultation is completed
                </div>
              )}
            </div>
            {c.status !== "completed" && (
              <button
                type="button"
                onClick={generateAiSummary}
                disabled={aiGenerating}
                style={{
                  background: "var(--color-cream-dark)", color: "#1a6a6a", border: "1px solid #d4c9b8",
                  borderRadius: "8px", padding: "8px 16px", fontSize: "0.85rem", fontWeight: 600,
                  cursor: aiGenerating ? "not-allowed" : "pointer", opacity: aiGenerating ? 0.7 : 1,
                }}
              >
                {aiGenerating ? "✨ Generating…" : aiSummary ? "↻ Regenerate" : "✨ Generate AI Summary"}
              </button>
            )}
          </div>

          {aiGenerating && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#888", fontSize: "0.9rem", padding: "16px 0" }}>
              <span>⏳</span> Generating discharge summary…
            </div>
          )}

          {aiError && (
            <p style={{ color: "#dc3545", fontSize: "0.875rem", marginBottom: "12px" }}>{aiError}</p>
          )}

          {/* Read-only once completed */}
          {c.status === "completed" && (
            <>
              {aiSummary ? (
                <div style={{ background: "var(--color-cream)", borderRadius: "8px", padding: "16px 18px", fontSize: "0.9rem", lineHeight: 1.8, color: "#1a6a6a", whiteSpace: "pre-wrap", border: "2px solid #e0d8cc" }}>
                  {aiSummary}
                </div>
              ) : (
                <p style={{ color: "#bbb", fontSize: "0.875rem", fontStyle: "italic" }}>No discharge summary recorded.</p>
              )}
              {dischargeMsg && (
                <p style={{ color: "#28a745", fontSize: "0.875rem", marginTop: "10px", fontWeight: 600 }}>{dischargeMsg}</p>
              )}
            </>
          )}

          {/* Editable + single approve/complete button */}
          {c.status !== "completed" && !aiGenerating && aiSummary && (
            <>
              <div style={{ fontSize: "0.8rem", color: "#888", marginBottom: "8px" }}>
                Review and edit before sending to {c.user_name}.
              </div>
              <textarea
                value={aiSummary}
                onChange={(e) => setAiSummary(e.target.value)}
                rows={14}
                style={{
                  width: "100%", boxSizing: "border-box",
                  border: "2px solid #d4c9b8", borderRadius: "8px",
                  padding: "14px 16px", fontFamily: "var(--font-body)", fontSize: "0.9rem",
                  lineHeight: 1.7, color: "#1a6a6a", background: "rgba(255,255,255,0.85)",
                  resize: "vertical",
                }}
              />
              {dischargeMsg && (
                <p style={{ color: dischargeMsg.includes("completed") || dischargeMsg.includes("sent") ? "#28a745" : "#dc3545", fontSize: "0.875rem", marginTop: "10px", fontWeight: 600 }}>
                  {dischargeMsg}
                </p>
              )}
              <div style={{ marginTop: "14px" }}>
                <button
                  type="button"
                  onClick={approveAndComplete}
                  disabled={dischargeApproving || !aiSummary.trim()}
                  style={{
                    background: "#E8427A", color: "#fff", border: "none",
                    borderRadius: "8px", padding: "12px 28px", fontWeight: 700,
                    fontSize: "0.95rem", cursor: dischargeApproving ? "not-allowed" : "pointer",
                    opacity: dischargeApproving ? 0.7 : 1,
                  }}
                >
                  {dischargeApproving ? "Completing…" : "✓ Approve & Complete Appointment"}
                </button>
                <div style={{ fontSize: "0.78rem", color: "#888", marginTop: "6px" }}>
                  Sends discharge to {c.user_name} ({c.user_email}) and marks this consultation complete.
                </div>
              </div>
            </>
          )}

          {c.status !== "completed" && !aiGenerating && !aiSummary && !aiError && (
            <p style={{ color: "#bbb", fontSize: "0.875rem", fontStyle: "italic" }}>
              Save SOAP notes above to auto-generate the discharge summary.
            </p>
          )}
        </div>

        {/* Signed Agreements */}
        {(() => {
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
          let parsed: Record<string, boolean> | null = null;
          try { if (c.agreements_json) parsed = JSON.parse(c.agreements_json); } catch { /* */ }
          const signedAt = c.agreements_signed_at ? new Date(c.agreements_signed_at * 1000).toLocaleString() : null;
          const clientName = c.agreements_client_name ?? c.user_name;
          return (
            <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "var(--shadow)", marginBottom: "20px" }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#1a6a6a", marginBottom: "14px" }}>
                Signed Agreements
              </div>
              {parsed ? (
                <>
                  <div style={{ fontSize: "0.8rem", color: "#888", marginBottom: "14px" }}>
                    Signed by <strong style={{ color: "#1a6a6a" }}>{clientName}</strong>
                    {signedAt && <> on <strong style={{ color: "#1a6a6a" }}>{signedAt}</strong></>}
                  </div>
                  <div style={{ display: "grid", gap: "8px" }}>
                    {Object.entries(AGREEMENT_LABELS).map(([key, label]) => {
                      const agreed = parsed![key] === true;
                      return (
                        <div key={key} style={{
                          display: "flex", alignItems: "center", gap: "10px",
                          padding: "10px 14px", borderRadius: "8px",
                          background: agreed ? "rgba(91,196,196,0.08)" : "rgba(220,53,69,0.06)",
                          border: `1px solid ${agreed ? "#5BC4C4" : "#dc3545"}`,
                        }}>
                          <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>{agreed ? "✅" : "❌"}</span>
                          <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1a6a6a" }}>{label}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: "0.875rem", color: "#bbb", fontStyle: "italic" }}>
                  No agreement data recorded for this booking.
                </div>
              )}
            </div>
          );
        })()}

      </div>
    </div>

    <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.45} }`}</style>

    {videoCallOpen && (
      <VideoCallOverlay
        consultationId={id}
        petName={c.pet_name}
        isVet={true}
        lobbyStream={lobbyStream}
        onClose={() => {
          setVideoCallOpen(false);
          setLobbyState("idle");
          setVetReadyLoading(false);
          if (lobbyPollRef.current) { clearInterval(lobbyPollRef.current); lobbyPollRef.current = null; }
          if (lobbyStream) { lobbyStream.getTracks().forEach(t => t.stop()); setLobbyStream(null); }
        }}
      />
    )}
    </>
  );
}
