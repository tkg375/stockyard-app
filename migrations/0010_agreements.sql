-- Store signed agreements per consultation
ALTER TABLE consultations ADD COLUMN agreements_json TEXT;
ALTER TABLE consultations ADD COLUMN agreements_signed_at INTEGER;
ALTER TABLE consultations ADD COLUMN agreements_client_name TEXT;
