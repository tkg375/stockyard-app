-- AI-generated discharge summary per consultation
ALTER TABLE consultations ADD COLUMN ai_summary TEXT;
ALTER TABLE consultations ADD COLUMN ai_summary_approved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE consultations ADD COLUMN discharge_sent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE consultations ADD COLUMN discharge_sent_at INTEGER;
