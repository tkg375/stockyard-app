"use client";
import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import SiteNav from "@/components/SiteNav";
import TroubleModal from "@/components/TroubleModal";
import { logCall } from "@/lib/clientLog";

const VideoCallOverlay = dynamic(() => import("@/components/VideoCallOverlay"), { ssr: false });

interface ConsultDetails {
  id: string; user_name: string; pet_name: string; pet_type: string;
  concern: string; date: string; time: string; status: string;
}

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"} EST`;
}
function petEmoji(type: string) {
  return type === "Dog" ? "🐕" : type === "Cat" ? "🐈" : type === "Horse" ? "🐴" : type === "Cattle" ? "🐄" : "🐾";
}

function GuestConsultationInner() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [consult, setConsult] = useState<ConsultDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [troubleOpen, setTroubleOpen] = useState(false);

  // Lobby state: null = not ready, "waiting" = I clicked ready, "joined" = both ready → call open
  const [lobbyState, setLobbyState] = useState<"idle" | "waiting" | "joined">("idle");
  const [readyLoading, setReadyLoading] = useState(false);
  const lobbyPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [lobbyStream, setLobbyStream] = useState<MediaStream | null>(null);
  const lobbyVideoRef = useRef<HTMLVideoElement>(null);

  const signalUrl = useCallback((keys?: string) => {
    const p = new URLSearchParams();
    if (token) p.set("guest_token", token);
    if (keys) p.set("keys", keys);
    return `/api/consultations/${id}/signal?${p.toString()}`;
  }, [id, token]);

  const load = useCallback(async () => {
    const url = token
      ? `/api/consultations/${id}?guest_token=${encodeURIComponent(token)}`
      : `/api/consultations/${id}`;
    const res = await fetch(url);
    if (!res.ok) { setError("Appointment not found or access denied."); setLoading(false); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as any;
    setConsult(data.consultation ?? data);
    setLoading(false);
  }, [id, token]);

  useEffect(() => { load(); }, [load]);

  // Write/refresh our lobby presence. The server only treats presence as valid if it
  // was heartbeated within the last ~10s, so we must keep re-writing while waiting.
  const writeLobbyPresence = useCallback(() => {
    return fetch(signalUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "lobby_customer", data: { ts: Date.now() } }),
    }).catch(() => {});
  }, [signalUrl]);

  // Poll for vet lobby signal after customer marks ready
  const startLobbyPoll = useCallback(() => {
    if (lobbyPollRef.current) return;
    let retries = 0;
    // Generous cap so a client who joins early can wait in the room until the vet starts.
    const MAX_RETRIES = 600; // ~30 min at 3s intervals
    lobbyPollRef.current = setInterval(async () => {
      retries++;
      if (retries > MAX_RETRIES) {
        clearInterval(lobbyPollRef.current!);
        lobbyPollRef.current = null;
        setLobbyState("idle");
        setReadyLoading(false);
        logCall(id, "customer", "lobby_timeout");
        alert("We haven't been able to connect you yet. Please tap \"I'm Ready to Join\" again, or contact us if the problem continues.");
        return;
      }
      // Heartbeat our presence so the vet sees us as live, then check if the vet is ready.
      writeLobbyPresence();
      const res = await fetch(signalUrl("lobby_vet"));
      if (!res.ok) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await res.json() as any;
      if (data.lobby_vet) {
        clearInterval(lobbyPollRef.current!);
        lobbyPollRef.current = null;
        logCall(id, "customer", "lobby_joined", { via: "poll" });
        setLobbyState("joined");
      }
    }, 3000);
  }, [signalUrl, writeLobbyPresence, id]);

  useEffect(() => {
    return () => {
      if (lobbyPollRef.current) clearInterval(lobbyPollRef.current);
      if (lobbyStream) lobbyStream.getTracks().forEach(t => t.stop());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function markReady() {
    if (readyLoading) return;
    setReadyLoading(true);
    logCall(id, "customer", "ready_click");

    // Acquire camera now so permission is pre-granted before the overlay opens,
    // and so the user sees a live preview instead of a black waiting screen.
    if (!lobbyStream) {
      try {
        const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
        const isPortrait = isMobile && window.innerHeight > window.innerWidth;
        const stream = await navigator.mediaDevices.getUserMedia({
          video: isPortrait ? { width: { ideal: 720 }, height: { ideal: 1280 }, facingMode: "user" } : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        setLobbyStream(stream);
        if (lobbyVideoRef.current) {
          lobbyVideoRef.current.srcObject = stream;
          lobbyVideoRef.current.play().catch(() => {});
        }
      } catch {
        // Camera denied or unavailable — VideoCallOverlay will handle the error properly
      }
    }

    // Write our lobby presence
    await writeLobbyPresence();

    // Check if vet is already (freshly) waiting
    const res = await fetch(signalUrl("lobby_vet"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as any;
    if (data.lobby_vet) {
      logCall(id, "customer", "lobby_joined", { via: "immediate" });
      setLobbyState("joined");
    } else {
      setLobbyState("waiting");
      startLobbyPoll();
    }
    setReadyLoading(false);
  }

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#f0fafa", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "#1a6a6a", fontSize: "1.1rem" }}>Loading…</p>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", background: "#f0fafa", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 36, maxWidth: 400, width: "100%", textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
        <p style={{ color: "#444", marginBottom: 16 }}>{error}</p>
        {token && <a href={`/guest-join?token=${encodeURIComponent(token)}`} style={{ color: "#1a6a6a", fontWeight: 600 }}>← Back to my appointment</a>}
      </div>
    </div>
  );

  // Denylist, not allowlist: any status that isn't a terminal state is joinable. This
  // avoids silently hiding the "I'm Ready" button for valid statuses like "confirmed" or
  // "pending_agreements". The lobby still gates whether the call actually starts.
  const isCompleted = consult!.status === "completed";
  const isCancelled = consult!.status === "cancelled";
  const isActive = !isCompleted && !isCancelled;

  return (
    <div style={{ minHeight: "100vh", background: "#f0fafa" }}>
      <SiteNav />

      <div style={{ maxWidth: 520, margin: "0 auto", padding: "32px 16px 48px" }}>

        {/* Header card */}
        <div style={{ background: "#fff", borderRadius: 20, boxShadow: "0 4px 24px rgba(0,0,0,0.07)", overflow: "hidden", marginBottom: 16 }}>
          {/* Teal top bar */}
          <div style={{ background: "linear-gradient(135deg,#1a6a6a,#5BC4C4)", padding: "24px 24px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 56, height: 56, background: "rgba(255,255,255,0.2)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, flexShrink: 0 }}>
                {petEmoji(consult!.pet_type)}
              </div>
              <div>
                <div style={{ color: "rgba(255,255,255,0.75)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Telehealth Appointment</div>
                <div style={{ color: "#fff", fontSize: "1.25rem", fontWeight: 700, marginTop: 2 }}>{consult!.pet_name} ({consult!.pet_type})</div>
                <div style={{ color: "rgba(255,255,255,0.85)", fontSize: "0.875rem", marginTop: 2 }}>{formatDate(consult!.date)} · {formatTime(consult!.time)}</div>
              </div>
            </div>
          </div>

          {/* Detail row */}
          <div style={{ padding: "16px 24px", borderBottom: "1px solid #f0f0f0" }}>
            <div style={{ fontSize: "0.75rem", color: "#999", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Concern</div>
            <div style={{ color: "#333", fontSize: "0.95rem", lineHeight: 1.5 }}>{consult!.concern}</div>
          </div>

          {/* Status / action */}
          <div style={{ padding: "20px 24px" }}>
            {isActive && lobbyState === "idle" && (
              <div style={{ textAlign: "center" }}>
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ margin: "0 auto 16px", display: "block" }}>
                  <circle cx="24" cy="24" r="22" stroke="#c5e5e5" strokeWidth="2" fill="#f0fafa" />
                  <path d="M24 14v10l6 4" stroke="#1a6a6a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p style={{ fontWeight: 700, color: "#1a6a6a", fontSize: "1.05rem", marginBottom: 6 }}>You&apos;re in the waiting room</p>
                <p style={{ color: "#777", fontSize: "0.875rem", lineHeight: 1.6, marginBottom: 20 }}>
                  When you&apos;re ready and Dr. McMillen is ready, the call will start automatically.
                </p>
                <button
                  onClick={markReady}
                  disabled={readyLoading}
                  style={{ width: "100%", background: "linear-gradient(135deg,#1a6a6a,#5BC4C4)", color: "#fff", border: "none", borderRadius: 12, padding: "16px 0", fontSize: "1.05rem", fontWeight: 700, cursor: readyLoading ? "default" : "pointer", opacity: readyLoading ? 0.7 : 1, WebkitTapHighlightColor: "transparent", transition: "opacity 0.2s" }}
                >
                  {readyLoading ? "Joining…" : "I'm Ready to Join"}
                </button>
              </div>
            )}

            {isActive && lobbyState === "waiting" && (
              <div style={{ textAlign: "center", padding: "8px 0" }}>
                {lobbyStream && (
                  <div style={{ position: "relative", display: "inline-block", marginBottom: 16 }}>
                    <video
                      ref={lobbyVideoRef}
                      autoPlay
                      playsInline
                      muted
                      style={{ width: "100%", maxWidth: 280, borderRadius: 12, background: "#333", display: "block" }}
                    />
                    <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: "0.72rem", fontWeight: 600, padding: "3px 8px", borderRadius: 6 }}>
                      Your camera
                    </div>
                  </div>
                )}
                {!lobbyStream && (
                  <div style={{ width: 48, height: 48, border: "3px solid #c5e5e5", borderTopColor: "#1a6a6a", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
                )}
                <p style={{ fontWeight: 700, color: "#1a6a6a", fontSize: "1.05rem", marginBottom: 6 }}>You&apos;re ready!</p>
                <p style={{ color: "#777", fontSize: "0.875rem", lineHeight: 1.6 }}>
                  Waiting for Dr. McMillen to join…<br />
                  The call will start automatically when they&apos;re ready.
                </p>
                <p style={{ color: "#aaa", fontSize: "0.78rem", lineHeight: 1.5, marginTop: 10 }}>
                  Please keep this screen open and your phone unlocked so we can connect you.
                </p>
              </div>
            )}

            {isCompleted && (
              <div style={{ textAlign: "center", padding: "12px 0" }}>
                <div style={{ fontSize: 44, marginBottom: 10 }}>✅</div>
                <p style={{ fontWeight: 700, color: "#1a6a6a", fontSize: "1.05rem", marginBottom: 4 }}>Consultation Complete</p>
                <p style={{ color: "#777", fontSize: "0.875rem" }}>Thank you for choosing Stockyard Animal Health!</p>
              </div>
            )}

            {isCancelled && (
              <div style={{ textAlign: "center", padding: "12px 0" }}>
                <div style={{ fontSize: 44, marginBottom: 10 }}>❌</div>
                <p style={{ fontWeight: 700, color: "#1a6a6a", fontSize: "1.05rem", marginBottom: 4 }}>Appointment Cancelled</p>
                <p style={{ color: "#777", fontSize: "0.875rem" }}>This appointment has been cancelled. <a href="/book" style={{ color: "#1a6a6a", fontWeight: 600 }}>Book a new one</a>.</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer links */}
        <div style={{ textAlign: "center" }}>
          <button onClick={() => setTroubleOpen(true)} style={{ background: "none", border: "none", color: "#1a6a6a", fontSize: "0.85rem", cursor: "pointer", fontWeight: 600, padding: 0, textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3 }}>
            Having Trouble?
          </button>
        </div>
      </div>

      {troubleOpen && <TroubleModal onClose={() => setTroubleOpen(false)} />}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {lobbyState === "joined" && consult && (
        <VideoCallOverlay
          consultationId={consult.id}
          petName={consult.pet_name}
          isVet={false}
          guestToken={token ?? undefined}
          lobbyStream={lobbyStream}
          onClose={() => {
            setLobbyState("idle");
            // Lobby stream ownership is transferred to the overlay on join;
            // stop it here only if the overlay never picked it up.
            if (lobbyStream) { lobbyStream.getTracks().forEach(t => t.stop()); setLobbyStream(null); }
          }}
        />
      )}
    </div>
  );
}

export default function GuestConsultationPage() {
  return <Suspense><GuestConsultationInner /></Suspense>;
}
