CREATE TABLE IF NOT EXISTS prescriptions (
  id TEXT PRIMARY KEY,
  consultation_id TEXT NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  drug_name TEXT NOT NULL,
  strength TEXT NOT NULL,
  dose_instructions TEXT NOT NULL,
  quantity TEXT NOT NULL,
  refills INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  pharmacy_name TEXT,
  pharmacy_fax TEXT,
  fax_status TEXT NOT NULL DEFAULT 'pending',
  fax_id TEXT,
  fax_error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_prescriptions_consultation ON prescriptions(consultation_id);
