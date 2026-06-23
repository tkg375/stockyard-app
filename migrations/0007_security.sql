-- Rate limiting counters for auth endpoints
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);

-- Track pet_id on consultations to prevent ambiguous JOIN by pet name
ALTER TABLE consultations ADD COLUMN pet_id TEXT REFERENCES pets(id);
