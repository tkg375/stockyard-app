CREATE TABLE IF NOT EXISTS webrtc_signals (
  consultation_id TEXT NOT NULL,
  key TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (consultation_id, key)
);
