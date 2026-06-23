const ALLOWED_ORIGINS = [
  "https://stockyardanimalhealth.com",
  "https://www.stockyardanimalhealth.com",
  "https://stockyard-app.tgordo03.workers.dev",
];

/**
 * Returns an error response if the request Origin is cross-site, or null if it's fine.
 * Call on all state-changing (POST/PATCH/DELETE) endpoints.
 */
export function checkOrigin(req: Request): { ok: false; status: 403 } | null {
  const origin = req.headers.get("origin");
  // Native mobile apps don't send an Origin header — allow those requests.
  // CSRF is a browser-only attack vector; native apps cannot be CSRF'd.
  if (!origin) return null;
  if (ALLOWED_ORIGINS.includes(origin)) return null;
  // Allow localhost in development
  if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) return null;
  return { ok: false, status: 403 };
}
