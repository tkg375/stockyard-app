// Server-side helper to record a video/lobby diagnostic event in D1.
// Never throws — logging must never break the actual flow.
// D1Database is an ambient global type (same as src/lib/db.ts).

export async function logCallEvent(
  db: D1Database,
  opts: {
    consultationId: string;
    role: "vet" | "customer" | "server";
    event: string;
    detail?: unknown;
    userAgent?: string | null;
  }
): Promise<void> {
  try {
    const id = crypto.randomUUID();
    const detailStr =
      opts.detail === undefined
        ? null
        : (() => {
            try { return JSON.stringify(opts.detail).slice(0, 4000); } catch { return String(opts.detail).slice(0, 4000); }
          })();
    const ua = opts.userAgent ? String(opts.userAgent).slice(0, 400) : null;
    // Mirror to the Workers log stream too (visible via `wrangler tail`) for live debugging.
    console.log(`[call_log] ${opts.consultationId} ${opts.role} ${opts.event}`, detailStr ?? "");
    await db
      .prepare(
        `INSERT INTO call_logs (id, consultation_id, role, event, detail, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, unixepoch())`
      )
      .bind(id, opts.consultationId, opts.role, String(opts.event).slice(0, 120), detailStr, ua)
      .run();
  } catch (err) {
    console.error("[call_log] failed to write", err);
  }
}
