-- Diagnostic event log for the video/lobby flow. Captures meaningful lifecycle events
-- (ready clicks, lobby handoff, offer/answer, connection state, errors, hang-ups) so
-- issues can be investigated after the fact. High-frequency noise (heartbeats, ICE
-- candidates, poll GETs) is intentionally NOT logged here.
CREATE TABLE IF NOT EXISTS call_logs (
  id TEXT PRIMARY KEY,
  consultation_id TEXT NOT NULL,
  role TEXT NOT NULL,          -- 'vet' | 'customer' | 'server'
  event TEXT NOT NULL,         -- short event code, e.g. 'ready_click', 'remote_stream', 'error:camera_denied'
  detail TEXT,                 -- optional JSON string with extra context
  user_agent TEXT,             -- client UA (helps diagnose browser/device-specific issues)
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_call_logs_consultation ON call_logs(consultation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_call_logs_created ON call_logs(created_at);
