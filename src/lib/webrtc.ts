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
  | "connection_failed"
  | "signaling_failed"
  | "sdp_error";

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
  // Remote side ended the call cleanly (posted a "bye" signal)
  onRemoteBye: (() => void) | null = null;

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
  // Separate from reconnectTimer: the short "disconnected" grace delay. Keeping
  // them distinct means a "failed" transition can cancel the grace period and
  // reconnect immediately without being blocked by (or clobbering) a real
  // scheduled reconnect.
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  // SDP of the last offer we answered — lets the customer skip re-answering a
  // stale offer after a reconnect and wait for the vet's fresh one instead.
  private lastAnsweredOfferSdp: string | null = null;
  private lobbyHeartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private pollerTimeouts: ReturnType<typeof setTimeout>[] = [];
  private signalGetFailures = 0;

  private static readonly POLLER_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

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
      if (!res.ok) {
        // Only surface after 3 consecutive failures so transient blips don't show errors
        if (++this.signalGetFailures >= 3) {
          this.onError?.("signaling_failed", "Trouble reaching the server. Check your connection.");
        }
        return {};
      }
      this.signalGetFailures = 0;
      return res.json();
    } catch {
      if (++this.signalGetFailures >= 3) {
        this.onError?.("signaling_failed", "Trouble reaching the server. Check your connection.");
      }
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
  // Keeps our own lobby_vet/lobby_customer signal alive even during an active
  // call so the other side's lobby check/poll sees us as present and can
  // rejoin if their tab crashes/reloads mid-call.

  startLobbyHeartbeat(): void {
    if (this.lobbyHeartbeatInterval) return;
    const key = this.isVet ? "lobby_vet" : "lobby_customer";
    const beat = () => {
      if (!this.destroyed) this.signalSet(key, { ts: Date.now() });
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
        const isAndroid = /Android/i.test(navigator.userAgent);
        const isIOS = /iPhone|iPad/i.test(navigator.userAgent);
        let msg = "Camera and microphone access was blocked.\n\n";
        if (isAndroid) {
          msg += "To fix this in Chrome:\n1. Tap the lock icon in the address bar\n2. Tap \"Permissions\"\n3. Allow Camera and Microphone\n4. Reload the page and try again.";
        } else if (isIOS) {
          msg += "To fix this in Safari:\n1. Open the Settings app\n2. Scroll down to Safari\n3. Tap \"Camera\" and \"Microphone\" and set both to Allow\n4. Return here and try again.";
        } else {
          msg += "To fix this:\n1. Click the camera icon in your browser's address bar\n2. Allow access to Camera and Microphone\n3. Reload the page and try again.";
        }
        this.onError?.("camera_denied", msg);
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
        if (this.graceTimer) { clearTimeout(this.graceTimer); this.graceTimer = null; }
      } else if (state === "disconnected") {
        // Short grace period — Chrome briefly goes "disconnected" on packet loss.
        // The timer also fires if the state has since moved to "failed": Chrome's
        // normal sequence is disconnected → failed, and the old code checking
        // only for "disconnected" here meant that sequence never reconnected.
        if (this.graceTimer || this.reconnectTimer) return;
        this.graceTimer = setTimeout(() => {
          this.graceTimer = null;
          const s = this.peerConnection?.connectionState;
          if (!this.destroyed && (s === "disconnected" || s === "failed")) {
            this.scheduleReconnect();
          }
        }, 3000);
      } else if (state === "failed") {
        // Definitive — skip any pending grace period and reconnect now
        if (this.graceTimer) { clearTimeout(this.graceTimer); this.graceTimer = null; }
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
      // Always POST the FULL cumulative list, never just the new batch: the
      // signal row is replaced wholesale on every POST and the remote poller
      // indexes into it by count. Posting only the latest batch made every
      // batch after the first (typically the TURN relay candidates, which
      // trickle in last) overwrite and permanently lose the earlier ones —
      // or vice versa, losing the relay candidates entirely.
      await this.signalSet(key, { candidates: [...this.localIceCandidates] });
    }, 200);
  }

  private startIcePoller(): void {
    const remoteKey = this.isVet ? "ice_customer" : "ice_vet";
    const countKey = this.isVet ? "customer" : "vet";
    const myRole = this.isVet ? "vet" : "customer";
    let running = false;
    const poller = setInterval(async () => {
      if (running || this.destroyed || !this.peerConnection) return;
      running = true;
      try {
        const data = await this.signalGet([remoteKey, "bye"]);

        // Remote posted a clean hang-up — surface it instead of letting the
        // dead connection look like a failure and spin through reconnects.
        const bye = data["bye"] as { from?: string } | undefined;
        if (bye?.from && bye.from !== myRole) {
          this.onRemoteBye?.();
          return;
        }

        const candidates: RTCIceCandidateInit[] =
          (data[remoteKey] as { candidates?: RTCIceCandidateInit[] })?.candidates ?? [];
        const newCount = candidates.length;
        // Never let the processed count regress: a delayed retry of an older
        // (shorter, prefix) candidate list can land after a newer one, and
        // regressing would re-add already-processed candidates.
        if (newCount <= this.processedIceCounts[countKey]) return;
        for (let i = this.processedIceCounts[countKey]; i < newCount; i++) {
          if (this.destroyed || !this.peerConnection) break;
          if (!this.peerConnection.currentRemoteDescription) {
            this.pendingRemoteIce.push(candidates[i]);
          } else {
            try {
              await this.peerConnection.addIceCandidate(candidates[i]);
            } catch (err: unknown) {
              const name = (err as { name?: string }).name;
              // OperationError / InvalidStateError = stale or already-processed candidate; safe to skip.
              // Anything else is unexpected — log it.
              if (name !== "OperationError" && name !== "InvalidStateError") {
                console.warn("[webrtc] addIceCandidate failed:", err);
              }
            }
          }
        }
        this.processedIceCounts[countKey] = newCount;
      } finally {
        running = false;
      }
    }, POLL_INTERVAL);
    this.pollers.push(poller);
  }

  // Drains pendingRemoteIce after remote description is set.
  // Captures the array before iterating so candidates that arrive mid-drain
  // don't get lost if we clear and more are pushed concurrently.
  private async drainPendingIce(): Promise<void> {
    const queued = this.pendingRemoteIce.splice(0);
    for (const candidate of queued) {
      if (this.destroyed || !this.peerConnection) break;
      try {
        await this.peerConnection.addIceCandidate(candidate);
      } catch (err: unknown) {
        const name = (err as { name?: string }).name;
        if (name !== "OperationError" && name !== "InvalidStateError") {
          console.warn("[webrtc] drainPendingIce addIceCandidate failed:", err);
        }
      }
    }
  }

  // Registers a hard timeout on a poller so it stops after POLLER_TIMEOUT_MS
  // if the remote peer never responds (e.g. they crashed before sending an offer/answer).
  private addPollerTimeout(poller: ReturnType<typeof setInterval>): void {
    const t = setTimeout(() => {
      clearInterval(poller);
      if (!this.destroyed) {
        this.onError?.("connection_failed", "Remote peer did not respond in time. Please try again.");
      }
    }, StockyardVideoCall.POLLER_TIMEOUT_MS);
    this.pollerTimeouts.push(t);
  }

  // ── Offer / Answer ────────────────────────────────────────────────────────

  private async createOffer(): Promise<void> {
    if (!this.peerConnection || this.isNegotiating || this.destroyed) return;
    this.isNegotiating = true;
    try {
      let offer: RTCSessionDescriptionInit;
      try {
        offer = await this.peerConnection.createOffer();
        if (this.destroyed || !this.peerConnection) return;
        await this.peerConnection.setLocalDescription(offer);
      } catch (err) {
        console.warn("[webrtc] createOffer/setLocalDescription failed:", err);
        this.onError?.("sdp_error", "Failed to create offer.");
        // Don't leave the call stuck on an error status with no retry path
        this.scheduleReconnect();
        return;
      }
      await this.signalSet("offer", { type: offer.type, sdp: offer.sdp });
    } finally {
      this.isNegotiating = false;
    }
  }

  private startAnswerPoller(): void {
    let running = false;
    const poller = setInterval(async () => {
      if (running || this.destroyed || !this.peerConnection) return;
      if (this.peerConnection.currentRemoteDescription) { clearInterval(poller); return; }
      running = true;
      try {
        const data = await this.signalGet(["answer"]);
        const answer = data["answer"] as RTCSessionDescriptionInit | undefined;
        if (answer?.sdp && this.peerConnection && !this.peerConnection.currentRemoteDescription && !this.destroyed) {
          clearInterval(poller);
          try {
            await this.peerConnection.setRemoteDescription(answer);
          } catch (err) {
            console.warn("[webrtc] setRemoteDescription (answer) failed:", err);
            this.onError?.("sdp_error", "Failed to process answer from remote peer.");
            // The poller is stopped — without a reconnect nothing would retry
            this.scheduleReconnect();
            return;
          }
          await this.drainPendingIce();
        }
      } finally {
        running = false;
      }
    }, POLL_INTERVAL);
    this.pollers.push(poller);
    this.addPollerTimeout(poller);
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
      // Skip an offer we already answered (stale row from before a reconnect) —
      // the vet, as sole offerer, will wipe and post a fresh one. Answering it
      // again would negotiate against a peer connection that no longer exists.
      if (offer?.sdp && offer.sdp !== this.lastAnsweredOfferSdp) {
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
        if (offer?.sdp && offer.sdp !== this.lastAnsweredOfferSdp &&
            this.peerConnection && !this.peerConnection.currentRemoteDescription && !this.destroyed) {
          clearInterval(poller);
          await this.answerOffer(offer);
        }
      } finally {
        running = false;
      }
    }, POLL_INTERVAL);
    this.pollers.push(poller);
    this.addPollerTimeout(poller);
  }

  private async answerOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection || this.peerConnection.currentRemoteDescription || this.isNegotiating || this.destroyed) return;
    this.isNegotiating = true;
    try {
      // Reset remote-ICE bookkeeping for this negotiation. On a re-answer
      // after reconnect the customer may have read the previous session's
      // (stale) candidate list — its count must not gate the fresh session's
      // candidates, whose cumulative list can be shorter than the stale count
      // and would otherwise be skipped forever. The row itself still holds
      // the current list, so a count reset just means one full re-read.
      this.processedIceCounts[this.isVet ? "customer" : "vet"] = 0;
      this.pendingRemoteIce = [];
      try {
        await this.peerConnection.setRemoteDescription(offer);
      } catch (err) {
        console.warn("[webrtc] setRemoteDescription (offer) failed:", err);
        this.onError?.("sdp_error", "Failed to process offer from remote peer.");
        this.scheduleReconnect();
        return;
      }
      this.lastAnsweredOfferSdp = offer.sdp ?? null;
      await this.drainPendingIce();
      if (this.destroyed || !this.peerConnection) return;
      try {
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        await this.signalSet("answer", { type: answer.type, sdp: answer.sdp });
      } catch (err) {
        console.warn("[webrtc] createAnswer/setLocalDescription failed:", err);
        this.onError?.("sdp_error", "Failed to create answer.");
        this.scheduleReconnect();
      }
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

    // Stop all existing pollers and their timeouts for this connection
    this.pollers.forEach(clearInterval);
    this.pollers = [];
    this.pollerTimeouts.forEach(clearTimeout);
    this.pollerTimeouts = [];

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

    // Wipe only the negotiation signals — keep lobby presence intact.
    // ONLY the vet (offerer) wipes: when a connection drops, both sides
    // typically reconnect within the same second, and if the customer also
    // wiped it would delete the vet's freshly-posted offer — leaving both
    // sides polling for signals that will never arrive. The customer's
    // reconnect just rebuilds its peer connection and waits for the vet's
    // fresh offer (the stale one is skipped via lastAnsweredOfferSdp).
    if (this.isVet) {
      await this.signalDelete(["offer", "answer", "ice_vet", "ice_customer", "bye"]);
    }
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

  async startCall(existingStream?: MediaStream | null): Promise<boolean> {
    if (!StockyardVideoCall.isSupported()) {
      this.onError?.("not_supported", "Your browser does not support video calls. Please use Chrome, Firefox, Safari, or Edge.");
      return false;
    }
    try {
      // Reuse the lobby preview stream when it's still live instead of opening
      // a second capture — a second concurrent getUserMedia can fail outright
      // on iOS Safari ("camera in use" caused by our own lobby stream) and
      // wastes the camera pipeline on other devices.
      const reusable = existingStream &&
        existingStream.getVideoTracks().some((t) => t.readyState === "live") &&
        existingStream.getAudioTracks().some((t) => t.readyState === "live");
      if (reusable) {
        this.localStream = existingStream;
        this.onLocalStream?.(existingStream);
        this.iceConfig = await this.fetchIceConfig();
      } else {
        const [, iceConfig] = await Promise.all([
          this.getMediaStream(),
          this.fetchIceConfig(),
        ]);
        this.iceConfig = iceConfig; // cache for reconnections
      }
      if (this.destroyed) return false;
      this.createPeerConnection(this.iceConfig);
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
    if (!this.localStream || this.destroyed || this.isNegotiating) return false;
    this.isNegotiating = true;
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
    } finally {
      this.isNegotiating = false;
    }
  }

  // Best-effort "I'm leaving" signal for tab close/navigation, where normal
  // fetch is unreliable. sendBeacon survives page teardown.
  sendByeBeacon(): void {
    try {
      const body = new Blob(
        [JSON.stringify({ key: "bye", data: { from: this.isVet ? "vet" : "customer", ts: Date.now() } })],
        { type: "application/json" }
      );
      navigator.sendBeacon(this.signalUrl(), body);
    } catch { /* best-effort */ }
  }

  async endCall(remoteEnded = false): Promise<void> {
    this.destroyed = true;
    this.stopLobbyHeartbeat();
    this.pollers.forEach(clearInterval);
    this.pollers = [];
    this.pollerTimeouts.forEach(clearTimeout);
    this.pollerTimeouts = [];
    if (this.iceBatchTimer) { clearTimeout(this.iceBatchTimer); this.iceBatchTimer = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.graceTimer) { clearTimeout(this.graceTimer); this.graceTimer = null; }
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
    // Tell the other side we left cleanly — without this, our departure looks
    // like a connection failure and they churn through reconnect attempts
    // until the 5-minute timeout. Skip when we're exiting BECAUSE they left.
    if (!remoteEnded) {
      try {
        await fetch(this.signalUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "bye", data: { from: this.isVet ? "vet" : "customer", ts: Date.now() } }),
        });
      } catch { /* best-effort */ }
    }
    // Delete only OUR OWN signal rows. Deleting everything (old behavior)
    // raced the other side's still-running heartbeat/reconnect and would
    // also delete the bye we just posted. Remaining rows are cleared by the
    // vet's pre-session wipe and the daily cron sweep.
    await this.signalDelete(
      this.isVet
        ? ["offer", "ice_vet", "lobby_vet", "ready_vet"]
        : ["answer", "ice_customer", "lobby_customer", "ready_customer"]
    );
  }
}
