import { getDb } from "./db";

/**
 * Returns true if the request is allowed, false if rate-limited.
 * The increment is atomic — the limit check lives inside the SQL so concurrent
 * Workers can't both read the same count and both sneak past the fence.
 */
export async function checkRateLimit(key: string, limit: number, windowSecs: number): Promise<boolean> {
  const db = await getDb();
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - windowSecs;

  // Atomically reset the window if expired, or increment within the current window.
  // The WHERE clause on the UPDATE ensures we only increment when below the limit
  // AND still within the window — both checks happen in one statement.
  const updated = await db
    .prepare(`
      UPDATE rate_limits
      SET count = count + 1
      WHERE key = ? AND count < ? AND window_start > ?
    `)
    .bind(key, limit, windowStart)
    .run();

  if (updated.meta.changes === 1) return true;

  // Row doesn't exist, window expired, or limit already hit — check which:
  const row = await db
    .prepare("SELECT count, window_start FROM rate_limits WHERE key = ?")
    .bind(key)
    .first<{ count: number; window_start: number }>();

  if (!row || row.window_start <= windowStart) {
    // New window — upsert with count = 1
    await db
      .prepare(
        "INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start"
      )
      .bind(key, now)
      .run();
    return true;
  }

  // Window is current but count >= limit
  return false;
}
