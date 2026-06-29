/**
 * Stockyard WebRTC Video Call
 * Signaling via D1 REST polling.
 */

const FALLBACK_ICE: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
};

const POLL_INTERVAL = 1500; // ms
const MAX_RECONNECT_ATTEMPTS = 4;
const RECONNECT_BASE_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type CallErrorCode =
  | "not_supported"
  | "camera_denied"
  | "no_camera"
  | "camera_in_use"
  | "media_error"
  | "start_failed"
  | "peer_disconnected"
  | "connection_failed";

export class StockyardVideoCall {
  consultationId: string;
  isVet: boolean;
  private guestToken: string | null;

  peerConnection: RTCPeerConnection | null = null;
  localStream: MediaStream | null = null;
  remoteStream: MediaStream | null = null;

  onLocalStream: ((stream: MediaStream) => void) | null = null;
  onRemoteStream: ((stream: MediaStream) => void) | null = null;
  onConnectionStateChange: ((state: string) => void) | null = null;
  onError: ((code: CallErrorCode, message: string) => void) | null = null;
  onWaiting: (() => void) | null = null;
  onReconnecting: ((attempt: number, max: number) => void) | null = null;

  private pollers: ReturnType<typeof setInterval>[] = [];
  private processedIceCounts = { vet: 0, customer: 0 };
  private pendingRemoteIce: RTCIceCandidateInit[] = [];
  private currentFacingMode: "user" | "environment" = "user";
  private localIceCandidates: RTCIceCandidateInit[] = [];
  private iceBatchTimer: ReturnType<typeof setTimeout> | null = null;
  private iceConfig: RTCConfiguration = FALLBACK_ICE;

  private isNegotiating = false;
  private destroyed = false;

  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lobbyHeartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor(consultationId: string, isVet: boolean, guestToken?: string) {
    this.consultationId = consultationId;
    this.isVet = isVet;
    this.guestToken = guestToken ?? null;
  }

  // ── Signaling via D1 API ──────────────────────────────────────────────────

  private signalUrl(keys?: string): string {
    const p = new URLSearchParams();
    if (this.guestToken) p.set("guest_token", this.guestToken);
    if (keys) p.set("keys", keys);
    const q = p.toString();
    return `/api/consultations/${this.consultationId}/signal${q ? "?" + q : ""}`;
  }

  private async signalGet(keys: string[]): Promise<Record<string, unknown>> {
    try {
      const res = await fetch(this.signalUrl(keys.join(",")));
      if (!res.ok) return {};
      return res.json();
    } catch {
      return {};
    }
  }

  // Retries up to 4 times with exponential backoff so a transient network blip
  // doesn't permanently lose ICE candidates or SDP messages.
  private async signalSet(key: string, data: unknown): Promise<void> {
    const body = JSON.stringify({ key, data });
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(this.signalUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (res.ok) return;
      } catch { /* retry */ }
      if (this.destroyed) return;
      if (attempt < 3) await sleep(300 * Math.pow(2, attempt)); // 300, 600, 1200 ms
    }
    console.warn(`[webrtc] signalSet gave up after 4 attempts: ${key}`);
  }

  private async signalDelete(keys?: string[]): Promise<void> {
    try {
      // signalUrl() already handles guest_token param; pass keys as the comma-separated
      // "keys" query param so partial deletes work without double-encoding the URL.
      const url = keys?.length ? this.signalUrl(keys.join(",")) : this.signalUrl();
      await fetch(url, { method: "DELETE" });
    } catch { /* best-effort */ }
  }

  // ── Lobby heartbeat ───────────────────────────────────────────────────────
  // Keeps lobby_vet alive even during an active call so the customer's lobby
  // poller sees the vet as present and can rejoin if the call drops.

  startLobbyHeartbeat(): void {
    if (!this.isVet || this.lobbyHeartbeatInterval) return;
    const beat = () => {
      if (!this.destroyed) this.signalSet("lobby_vet", { ts: Date.now() });
    };
    beat();
    this.lobbyHeartbeatInterval = setInterval(beat, 5000);
  }

  stopLobbyHeartbeat(): void {
    if (this.lobbyHeartbeatInterval) {
      clearInterval(this.lobbyHeartbeatInterval);
      this.lobbyHeartbeatInterval = null;
    }
  }

  // ── Media ─────────────────────────────────────────────────────────────────

  private async getMediaStream(): Promise<void> {
    try {
      const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      const isPortrait = isMobile && window.innerHeight > window.innerWidth;
      const videoConstraints: MediaTrackConstraints = isPortrait
        ? { width: { ideal: 720 }, height: { ideal: 1280 }, facingMode: "user" }
        : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" };

      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      this.onLocalStream?.(this.localStream);
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        this.onError?.("camera_denied", "Camera and microphone access is required. Please allow access and try again.");
      } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
        this.onError?.("no_camera", "No camera or microphone found. Please connect a webcam and try again.");
      } else if (error.name === "NotReadableError") {
        this.onError?.("camera_in_use", "Your camera is being used by another application. Please close it and try again.");
      } else {
        this.onError?.("media_error", "Could not access camera: " + (error.message ?? "unknown error"));
      }
      throw err;
    }
  }

  // ── ICE server fetch (Cloudflare TURN) ───────────────────────────────────

  private async fetchIceConfig(): Promise<RTCConfiguration> {
    try {
      const res = await fetch(`/api/consultations/${this.consultationId}/ice-servers${this.guestToken ? `?guest_token=${encodeURIComponent(this.guestToken)}` : ""}`);
      if (res.ok) {
        const data = await res.json() as { iceServers: RTCIceServer[] };
        if (data.iceServers?.length) return { iceServers: data.iceServers };
      }
    } catch { /* fall through */ }
    return FALLBACK_ICE;
  }

  // ── Peer connection ───────────────────────────────────────────────────────

  private createPeerConnection(iceConfig: RTCConfiguration): void {
    this.peerConnection = new RTCPeerConnection(iceConfig);

    this.localStream!.getTracks().forEach((track) => {
      this.peerConnection!.addTrack(track, this.localStream!);
    });

    this.remoteStream = new MediaStream();
    this.peerConnection.ontrack = (event) => {
      if (this.destroyed) return;
      event.streams[0].getTracks().forEach((track) => {
        this.remoteStream!.addTrack(track);
      });
      this.onRemoteStream?.(this.remoteStream!);
    };

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && !this.destroyed) this.appendIceCandidate(event.candidate);
    };

    this.peerConnection.onconnectionstatechange = () => {
      if (this.destroyed) return;
      const state = this.peerConnection?.connectionState;
      if (!state) return;
      this.onConnectionStateChange?.(state);

      if (state === "connected") {
        // Reset reconnect counter on a clean connection
        this.reconnectAttempts = 0;
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
      } else if (state === "disconnected") {
        // Short grace period — Chrome briefly goes "disconnected" on packet loss
        this.reconnectTimer = setTimeout(() => {
          if (!this.destroyed && this.peerConnection?.connectionState === "disconnected") {
            this.scheduleReconnect();
          }
        }, 3000);
      } else if (state === "failed") {
        this.scheduleReconnect();
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      if (this.destroyed) return;
      const s = this.peerConnection?.iceConnectionState;
      // ICE restart is a lightweight first attempt before full renegotiation
      if (s === "failed") this.peerConnection?.restartIce();
    };
  }

  // ── ICE candidates ────────────────────────────────────────────────────────

  private appendIceCandidate(candidate: RTCIceCandidate): void {
    this.localIceCandidates.push(candidate.toJSON());
    if (this.iceBatchTimer) return;
    this.iceBatchTimer = setTimeout(async () => {
      this.iceBatchTimer = null;
      if (this.destroyed) return;
      const key = this.isVet ? "ice_vet" : "ice_customer";
      // signalSet retries internally — candidates will be delivered
      await this.signalSet(key, { candidates: [...this.localIceCandidates] });
    }, 200);
  }

  private startIcePoller(): void {
    const remoteKey = this.isVet ? "ice_customer" : "ice_vet";
    const countKey = this.isVet ? "customer" : "vet";
    let running = false;
    const poller = setInterval(async () => {
      if (running || this.destroyed || !this.peerConnection) return;
      running = true;
      try {
        const data = await this.signalGet([remoteKey]);
        const candidates: RTCIceCandidateInit[] =
          (data[remoteKey] as { candidates?: RTCIceCandidateInit[] })?.candidates ?? [];
        for (let i = this.processedIceCounts[countKey]; i < candidates.length; i++) {
          if (this.destroyed || !this.peerConnection) break;
          if (!this.peerConnection.currentRemoteDescription) {
            this.pendingRemoteIce.push(candidates[i]);
          } else {
            try {
              await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidates[i]));
            } catch { /* stale candidate — ignore */ }
          }
        }
        this.processedIceCounts[countKey] = candidates.length;
      } finally {
        running = false;
      }
    }, POLL_INTERVAL);
    this.pollers.push(poller);
  }

  // ── Offer / Answer ────────────────────────────────────────────────────────

  private async createOffer(): Promise<void> {
    if (!this.peerConnection || this.isNegotiating || this.destroyed) return;
    this.isNegotiating = true;
    try {
      const offer = await this.peerConnection.createOffer();
      if (this.destroyed || !this.peerConnection) return;
      await this.peerConnection.setLocalDescription(offer);
      await this.signalSet("offer", { type: offer.type, sdp: offer.sdp });
    } finally {
      this.isNegotiating = false;
    }
  }

  private startAnswerPoller(): void {
    let running = false;
    const poller = setInterval(async () => {
      if (running || this.destroyed || !this.peerConnection) return;
      if (this.peerConnection.currentRemoteDescription) {
        clearInterval(poller);
        return;
      }
      running = true;
      try {
        const data = await this.signalGet(["answer"]);
        const answer = data["answer"] as RTCSessionDescriptionInit | undefined;
        if (answer?.sdp && this.peerConnection && !this.peerConnection.currentRemoteDescription && !this.destroyed) {
          clearInterval(poller);
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
          for (const candidate of this.pendingRemoteIce) {
            if (this.destroyed || !this.peerConnection) break;
            try { await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* ignore */ }
          }
          this.pendingRemoteIce = [];
        }
      } finally {
        running = false;
      }
    }, POLL_INTERVAL);
    this.pollers.push(poller);
  }

  // Vet = offerer, customer = answerer. Fixed roles prevent glare deadlock.

  private async joinRoom(): Promise<void> {
    if (this.isVet) {
      await this.createOffer();
      if (this.destroyed) return;
      this.startAnswerPoller();
    } else {
      const data = await this.signalGet(["offer"]);
      if (this.destroyed) return;
      const offer = data["offer"] as RTCSessionDescriptionInit | undefined;
      if (offer?.sdp) {
        await this.answerOffer(offer);
      } else {
        this.onWaiting?.();
        this.startOfferPoller();
      }
    }
  }

  private startOfferPoller(): void {
    let running = false;
    const poller = setInterval(async () => {
      if (running || this.destroyed || !this.peerConnection) return;
      if (this.peerConnection.currentRemoteDescription) { clearInterval(poller); return; }
      running = true;
      try {
        const data = await this.signalGet(["offer"]);
        const offer = data["offer"] as RTCSessionDescriptionInit | undefined;
        if (offer?.sdp && this.peerConnection && !this.peerConnection.currentRemoteDescription && !this.destroyed) {
          clearInterval(poller);
          await this.answerOffer(offer);
        }
      } finally {
        running = false;
      }
    }, POLL_INTERVAL);
    this.pollers.push(poller);
  }

  private async answerOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection || this.peerConnection.currentRemoteDescription || this.isNegotiating || this.destroyed) return;
    this.isNegotiating = true;
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      for (const candidate of this.pendingRemoteIce) {
        if (this.destroyed || !this.peerConnection) break;
        try { await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* ignore */ }
      }
      this.pendingRemoteIce = [];
      if (this.destroyed || !this.peerConnection) return;
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      await this.signalSet("answer", { type: answer.type, sdp: answer.sdp });
    } finally {
      this.isNegotiating = false;
    }
  }

  // ── Reconnection ──────────────────────────────────────────────────────────

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    if (this.reconnectTimer) return; // already scheduled

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.onError?.("connection_failed", "Could not reconnect after multiple attempts. Please end the call and try again.");
      return;
    }

    const delay = RECONNECT_BASE_DELAY_MS * Math.pow(1.5, this.reconnectAttempts);
    this.reconnectAttempts++;
    this.onReconnecting?.(this.reconnectAttempts, MAX_RECONNECT_ATTEMPTS);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.destroyed) this.doReconnect();
    }, delay);
  }

  private async doReconnect(): Promise<void> {
    if (this.destroyed) return;

    // Stop all existing pollers for this connection
    this.pollers.forEach(clearInterval);
    this.pollers = [];

    // Close the old peer connection
    if (this.peerConnection) {
      this.peerConnection.onconnectionstatechange = null;
      this.peerConnection.oniceconnectionstatechange = null;
      this.peerConnection.onicecandidate = null;
      this.peerConnection.ontrack = null;
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // Clear ICE state
    this.processedIceCounts = { vet: 0, customer: 0 };
    this.pendingRemoteIce = [];
    this.localIceCandidates = [];
    this.isNegotiating = false;
    if (this.iceBatchTimer) { clearTimeout(this.iceBatchTimer); this.iceBatchTimer = null; }

    // Wipe only the negotiation signals — keep lobby presence intact
    await this.signalDelete(["offer", "answer", "ice_vet", "ice_customer"]);
    if (this.destroyed) return;

    // Fresh peer connection using cached ICE config (avoid extra round-trip)
    this.createPeerConnection(this.iceConfig);
    await this.joinRoom();
    if (this.destroyed) return;
    this.startIcePoller();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  static isSupported(): boolean {
    if (typeof navigator === "undefined" || typeof RTCPeerConnection === "undefined") return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return !!(navigator.mediaDevices && (navigator.mediaDevices as any).getUserMedia);
  }

  async startCall(): Promise<boolean> {
    if (!StockyardVideoCall.isSupported()) {
      this.onError?.("not_supported", "Your browser does not support video calls. Please use Chrome, Firefox, Safari, or Edge.");
      return false;
    }
    try {
      const [, iceConfig] = await Promise.all([
        this.getMediaStream(),
        this.fetchIceConfig(),
      ]);
      if (this.destroyed) return false;
      this.iceConfig = iceConfig; // cache for reconnections
      this.createPeerConnection(iceConfig);
      await this.joinRoom();
      this.startIcePoller();
      return true;
    } catch {
      if (!this.destroyed) this.onError?.("start_failed", "Failed to start video call. Please check your camera and microphone permissions.");
      return false;
    }
  }

  toggleAudio(): boolean {
    const track = this.localStream?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; return track.enabled; }
    return false;
  }

  toggleVideo(): boolean {
    const track = this.localStream?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; return track.enabled; }
    return false;
  }

  static async hasMultipleCameras(): Promise<boolean> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === "videoinput").length > 1;
    } catch {
      return false;
    }
  }

  async flipCamera(): Promise<"user" | "environment" | false> {
    if (!this.localStream || this.destroyed) return false;
    const next = this.currentFacingMode === "user" ? "environment" : "user";
    try {
      const isPortrait = typeof window !== "undefined" && window.innerHeight > window.innerWidth;
      const dimConstraints = isPortrait
        ? { width: { ideal: 720 }, height: { ideal: 1280 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } };

      let newStream: MediaStream;
      try {
        newStream = await navigator.mediaDevices.getUserMedia({
          video: { ...dimConstraints, facingMode: { exact: next } },
          audio: false,
        });
      } catch {
        newStream = await navigator.mediaDevices.getUserMedia({
          video: { ...dimConstraints, facingMode: next },
          audio: false,
        });
      }
      if (this.destroyed) { newStream.getTracks().forEach(t => t.stop()); return false; }
      const newTrack = newStream.getVideoTracks()[0];
      if (this.peerConnection) {
        const sender = this.peerConnection.getSenders().find((s) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(newTrack);
      }
      const oldTrack = this.localStream.getVideoTracks()[0];
      if (oldTrack) { oldTrack.stop(); this.localStream.removeTrack(oldTrack); }
      this.localStream.addTrack(newTrack);
      this.currentFacingMode = next;
      this.onLocalStream?.(this.localStream);
      return this.currentFacingMode;
    } catch {
      return false;
    }
  }

  async endCall(): Promise<void> {
    this.destroyed = true;
    this.stopLobbyHeartbeat();
    this.pollers.forEach(clearInterval);
    this.pollers = [];
    if (this.iceBatchTimer) { clearTimeout(this.iceBatchTimer); this.iceBatchTimer = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.pendingRemoteIce = [];
    this.localIceCandidates = [];
    this.processedIceCounts = { vet: 0, customer: 0 };
    this.isNegotiating = false;
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    if (this.peerConnection) {
      this.peerConnection.onconnectionstatechange = null;
      this.peerConnection.oniceconnectionstatechange = null;
      this.peerConnection.onicecandidate = null;
      this.peerConnection.ontrack = null;
      this.peerConnection.close();
      this.peerConnection = null;
    }
    await this.signalDelete();
  }
}
