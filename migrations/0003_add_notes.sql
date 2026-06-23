-- Add notes and completedAt to consultations (vet fills these out when completing)
ALTER TABLE consultations ADD COLUMN notes TEXT;
ALTER TABLE consultations ADD COLUMN completed_at INTEGER;

-- Add password reset tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
