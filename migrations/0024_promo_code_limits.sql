-- Adds optional usage-limit and expiry enforcement for promo codes. Existing
-- codes keep working exactly as before (max_uses/expires_at default to NULL,
-- meaning unlimited/no-expiry) — this only adds the capability to cap a code,
-- it doesn't cap anything automatically.
ALTER TABLE promo_codes ADD COLUMN max_uses INTEGER;
ALTER TABLE promo_codes ADD COLUMN uses_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE promo_codes ADD COLUMN expires_at INTEGER;
