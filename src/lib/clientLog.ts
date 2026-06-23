// Client-side helper to record a video/lobby diagnostic event. Fire-and-forget — it
// must never throw or block the UI. `keepalive` lets the request complete even if the
// page is unloading (e.g. logging "ended" as the user closes the tab).
export function logCall(
  consultationId: string,
  role: "vet" | "customer",
  event: string,
  detail?: unknown,
  guestToken?: string | null
): void {
  try {
    const p = new URLSearchParams();
    if (guestToken) p.set("guest_token", guestToken);
    const q = p.toString();
    fetch(`/api/consultations/${consultationId}/log${q ? "?" + q : ""}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, event, detail }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never throw */
  }
}
