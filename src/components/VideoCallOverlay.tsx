"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { StockyardVideoCall } from "@/lib/webrtc";
import { logCall } from "@/lib/clientLog";

interface Props {
  consultationId: string;
  petName: string;
  isVet: boolean;
  guestToken?: string;
  onClose: () => void;
  // Stream pre-acquired in the lobby so camera is ready the moment the overlay opens
  lobbyStream?: MediaStream | null;
}

export default function VideoCallOverlay({ consultationId, petName, isVet, guestToken, onClose, lobbyStream }: Props) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const callRef = useRef<StockyardVideoCall | null>(null);

  const log = useCallback((event: string, detail?: unknown) => {
    logCall(consultationId, isVet ? "vet" : "customer", event, detail, guestToken);
  }, [consultationId, isVet, guestToken]);

  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [status, setStatus] = useState<string | null>("Starting camera…");
  const [flipping, setFlipping] = useState(false);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [needsTapToPlay, setNeedsTapToPlay] = useState(false);
  const [slowConnect, setSlowConnect] = useState(false);
  // null = not reconnecting; "1/4" etc = attempt display
  const [reconnectLabel, setReconnectLabel] = useState<string | null>(null);
  const isMobile = typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  // Lock orientation and prevent body scroll while in call
  useEffect(() => {
    document.body.style.overflow = "hidden";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orientation = screen?.orientation as any;
    if (orientation?.lock) {
      orientation.lock("portrait").catch(() => {});
    }
    return () => {
      document.body.style.overflow = "";
      if (orientation?.unlock) orientation.unlock();
    };
  }, []);

  // Warn before accidental navigation away
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); return true; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const close = useCallback(async (remoteEnded = false) => {
    log("ended", { remoteEnded });
    if (callRef.current) {
      await callRef.current.endCall(remoteEnded);
      callRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    onClose();
  }, [onClose, log]);

  // If the tab is killed/navigated away without a clean hang-up, fire a
  // best-effort "bye" beacon so the other side sees a clean exit instead of
  // spinning through reconnect attempts until the timeout.
  useEffect(() => {
    const onPageHide = () => callRef.current?.sendByeBeacon();
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  useEffect(() => {
    let mounted = true;
    let everConnected = false;
    const connectTimer = setTimeout(() => { if (mounted && !everConnected) { setSlowConnect(true); log("slow_connect"); } }, 30000);
    const markConnected = () => {
      const first = !everConnected;
      everConnected = true;
      clearTimeout(connectTimer);
      if (mounted) { setSlowConnect(false); setReconnectLabel(null); }
      if (first) log("connected");
    };

    // Show local video immediately from lobby preview so there's no black screen on open
    if (lobbyStream && localVideoRef.current) {
      localVideoRef.current.srcObject = lobbyStream;
    }

    async function start() {
      log("overlay_start", { ua: typeof navigator !== "undefined" ? navigator.userAgent : "", mobile: isMobile });
      const call = new StockyardVideoCall(consultationId, isVet, guestToken);
      callRef.current = call;

      call.onLocalStream = (stream) => {
        if (!mounted) return;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        log("local_stream", { tracks: stream.getTracks().map((t) => t.kind) });
        StockyardVideoCall.hasMultipleCameras().then((multi) => { if (mounted) setHasMultipleCameras(multi); });
        // Camera is live — advance past "Starting camera…"
        setStatus(s => s === "Starting camera…" ? "Connecting…" : s);
      };

      call.onRemoteStream = (stream) => {
        if (!mounted) return;
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          remoteVideoRef.current.play()
            .then(() => { if (mounted) setNeedsTapToPlay(false); })
            .catch(() => { if (mounted) { setNeedsTapToPlay(true); log("autoplay_blocked"); } });
        }
        log("remote_stream");
        markConnected();
        setStatus(null);
      };

      call.onConnectionStateChange = (state) => {
        if (!mounted) return;
        log("conn_state", { state });
        if (state === "connected") {
          markConnected();
          setStatus(null);
        } else if (state === "connecting") {
          setStatus("Connecting…");
        } else if (state === "disconnected" || state === "failed") {
          setStatus("Reconnecting…");
        }
      };

      call.onReconnecting = (attempt, max) => {
        if (!mounted) return;
        log("reconnecting", { attempt, max });
        setReconnectLabel(`${attempt}/${max}`);
        setStatus("Reconnecting…");
      };

      call.onWaiting = () => {
        if (mounted) setStatus(isVet ? "Waiting for client to join…" : "Waiting for Dr. McMillen to join…");
        log("waiting_for_peer");
      };

      call.onRemoteBye = () => {
        if (!mounted) return;
        log("remote_bye");
        alert(isVet ? "The client has left the call." : "Dr. McMillen has ended the call.");
        close(true);
      };

      call.onError = (code, message) => {
        log("error", { code, message });
        if (!mounted) return;
        if (code === "connection_failed") {
          // Exhausted all reconnect attempts — must end the call
          alert(message + "\n\nPlease try starting a new call.");
          close();
        } else if (code === "signaling_failed" || code === "sdp_error") {
          // Transient — show in the status bar, never alert
          setStatus(message);
        } else {
          // Fatal camera/device errors
          alert(message);
          if (["camera_denied", "no_camera", "not_supported", "media_error"].includes(code)) {
            close();
          }
        }
      };

      const ok = await call.startCall(lobbyStream);
      log("start_call_result", { ok, reusedLobbyStream: !!lobbyStream });

      if (ok && mounted) {
        // Both sides keep heartbeating their own lobby presence so the other
        // party's lobby check/poll always sees them, even mid-call, enabling
        // clean reconnects if either side's tab crashes/reloads.
        call.startLobbyHeartbeat();
      }

      if (!ok && mounted && callRef.current) close();
    }

    start();

    return () => {
      mounted = false;
      clearTimeout(connectTimer);
      if (callRef.current) {
        callRef.current.endCall().catch(() => {});
        callRef.current = null;
      }
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultationId, isVet]);

  function toggleAudio() {
    if (!callRef.current) return;
    if ("vibrate" in navigator) navigator.vibrate(10);
    const enabled = callRef.current.toggleAudio();
    setAudioEnabled(enabled);
  }

  function toggleVideo() {
    if (!callRef.current) return;
    if ("vibrate" in navigator) navigator.vibrate(10);
    const enabled = callRef.current.toggleVideo();
    setVideoEnabled(enabled);
  }

  async function flipCamera() {
    if (!callRef.current || flipping) return;
    if ("vibrate" in navigator) navigator.vibrate(10);
    setFlipping(true);
    const result = await callRef.current.flipCamera();
    if (result !== false && localVideoRef.current && callRef.current.localStream) {
      localVideoRef.current.srcObject = callRef.current.localStream;
    }
    setFlipping(false);
  }

  async function endCall() {
    if (confirm("Are you sure you want to end the call?")) {
      await close();
    }
  }

  // Responsive local video size
  const localW = isMobile ? "clamp(80px, 22vw, 130px)" : "120px";
  const localH = isMobile ? "clamp(60px, 16vw, 98px)" : "90px";

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000", zIndex: 10000,
      display: "flex", flexDirection: "column",
    }}>
      {/* Header — respects notch/Dynamic Island */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "max(12px, env(safe-area-inset-top)) 20px 12px",
        paddingLeft: "max(20px, env(safe-area-inset-left))",
        paddingRight: "max(20px, env(safe-area-inset-right))",
        background: "#1a1a1a", color: "#fff",
        WebkitTapHighlightColor: "transparent",
      }}>
        <span style={{ fontWeight: 600, fontSize: "1rem" }}>
          Video Call — {petName}
        </span>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={toggleAudio} title={audioEnabled ? "Mute" : "Unmute"} style={ctrlBtn(!audioEnabled)}>
            {audioEnabled ? <MicOnIcon /> : <MicOffIcon />}
          </button>
          <button onClick={toggleVideo} title={videoEnabled ? "Camera off" : "Camera on"} style={ctrlBtn(!videoEnabled)}>
            {videoEnabled ? <CamOnIcon /> : <CamOffIcon />}
          </button>
          <button onClick={endCall} title="End call" style={ctrlBtn(false, true)}>
            <EndCallIcon />
          </button>
        </div>
      </div>

      {/* Video area */}
      <div style={{ flex: 1, position: "relative", background: "#1a1a1a", overflow: "hidden" }}>
        {/* Remote video */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={{
            width: "100%", height: "100%",
            objectFit: "contain",
            background: "#1a1a1a",
            touchAction: "none",
            WebkitUserSelect: "none",
          }}
        />

        {/* Tap-to-start fallback when autoplay is blocked (iOS Safari) */}
        {needsTapToPlay && (
          <button
            onClick={() => {
              if ("vibrate" in navigator) navigator.vibrate(10);
              remoteVideoRef.current?.play().then(() => setNeedsTapToPlay(false)).catch(() => {});
            }}
            style={{
              position: "absolute", inset: 0, zIndex: 5,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14,
              background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", cursor: "pointer",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <span style={{ width: 72, height: 72, borderRadius: "50%", background: "#5BC4C4", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
            </span>
            <span style={{ fontSize: "1.05rem", fontWeight: 600 }}>Tap to start video</span>
          </button>
        )}

        {/* Local video PiP — safe area aware */}
        <div style={{
          position: "absolute",
          bottom: "max(20px, env(safe-area-inset-bottom))",
          right: "max(20px, env(safe-area-inset-right))",
        }}>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{
              display: "block",
              width: localW, height: localH,
              borderRadius: 10,
              border: "3px solid #fff",
              objectFit: "cover",
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              background: "#333",
              touchAction: "none",
              WebkitUserSelect: "none",
            }}
          />
          {hasMultipleCameras && (
            <button
              onClick={flipCamera}
              disabled={flipping}
              title="Flip camera"
              style={{
                position: "absolute", bottom: 6, right: 6,
                width: 36, height: 36, borderRadius: "50%",
                border: "2px solid rgba(255,255,255,0.8)",
                background: "rgba(0,0,0,0.55)",
                color: "#fff", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                backdropFilter: "blur(4px)",
                opacity: flipping ? 0.5 : 1,
                transition: "opacity 0.2s",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <FlipIcon />
            </button>
          )}
        </div>

        {/* Status overlay */}
        {status && (
          <div
            role="status"
            aria-label={status}
            style={{
              position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
              background: "rgba(0,0,0,0.8)", color: "#fff",
              padding: "24px 40px", borderRadius: 12, fontSize: "1.1rem",
              textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
              width: "max-content", maxWidth: "80vw",
            }}>
            <Spinner />
            {status}
            {reconnectLabel && (
              <span style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.75)", maxWidth: 280, lineHeight: 1.5 }}>
                Attempt {reconnectLabel} — hang tight, re-establishing connection…
              </span>
            )}
            {slowConnect && !reconnectLabel && (
              <span style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.75)", maxWidth: 280, lineHeight: 1.5 }}>
                Still trying to connect. {isVet ? "Your client" : "Dr. McMillen"} may be having trouble — you can keep waiting, or tap the red button to end and try again.
              </span>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function ctrlBtn(muted: boolean, danger = false): React.CSSProperties {
  return {
    width: 48, height: 48, borderRadius: "50%", border: "none",
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
    background: danger ? "#dc3545" : muted ? "#dc3545" : "#333",
    color: "#fff", transition: "background 0.2s",
    WebkitTapHighlightColor: "transparent",
    flexShrink: 0,
  };
}

function Spinner() {
  return (
    <div style={{
      width: 40, height: 40,
      border: "3px solid rgba(255,255,255,0.3)", borderTopColor: "#fff",
      borderRadius: "50%", animation: "spin 1s linear infinite",
    }} />
  );
}

function MicOnIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>;
}
function MicOffIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>;
}
function CamOnIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>;
}
function CamOffIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;
}
function FlipIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>;
}
function EndCallIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="23" y1="1" x2="1" y2="23"/></svg>;
}
