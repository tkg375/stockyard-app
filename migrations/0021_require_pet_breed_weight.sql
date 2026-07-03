-- Make pet_breed/pet_weight mandatory (and non-garbage) on every consultation.
-- The misc walk-in flow (which never collected them) and the saved-pet/account
-- flow (which never populated them, since accounts no longer let users save
-- pets) are both gone, so every booking now collects its own breed/weight.
--
-- pet_breed must contain at least one letter (blocks '.', '-', '123', or
-- whitespace-only values used to slip past a plain "not empty" check).
-- pet_weight must be a positive real/integer (blocks non-numeric strings).
--
-- SQLite can't ALTER COLUMN to add NOT NULL/CHECK, so this rebuilds the table
-- (same pattern as migration 0017). Existing bad rows are backfilled first so
-- the copy into the new, constrained table doesn't fail.

PRAGMA foreign_keys=OFF;

UPDATE consultations
SET pet_breed = CASE WHEN pet_breed IS NOT NULL AND pet_breed GLOB '*[a-zA-Z]*' THEN pet_breed ELSE 'Unknown' END,
    pet_weight = CASE WHEN pet_weight IS NOT NULL AND pet_weight > 0 THEN pet_weight ELSE 1 END
WHERE pet_breed IS NULL OR NOT (pet_breed GLOB '*[a-zA-Z]*') OR pet_weight IS NULL OR pet_weight <= 0;

CREATE TABLE consultations_new (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  user_phone TEXT,
  pet_name TEXT NOT NULL,
  pet_type TEXT NOT NULL,
  concern TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  stripe_customer_id TEXT,
  stripe_payment_method_id TEXT,
  stripe_payment_intent_id TEXT,
  stripe_refund_id TEXT,
  promo_code TEXT,
  promo_discount INTEGER,
  promo_type TEXT,
  amount_cents INTEGER,
  daily_room_url TEXT,
  notif_confirmation_sent INTEGER NOT NULL DEFAULT 0,
  notif_confirmation_sent_at INTEGER,
  notif_reminder_sent INTEGER NOT NULL DEFAULT 0,
  notif_reminder_sent_at INTEGER,
  notif_video_link_sent INTEGER NOT NULL DEFAULT 0,
  notif_video_link_sent_at INTEGER,
  notif_payment_failed_sent INTEGER NOT NULL DEFAULT 0,
  cancelled_at INTEGER,
  cancelled_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  notes TEXT,
  completed_at INTEGER,
  notif_overdue_last_sent INTEGER DEFAULT 0,
  pet_id TEXT REFERENCES pets(id),
  agreements_json TEXT,
  agreements_signed_at INTEGER,
  agreements_client_name TEXT,
  ai_summary TEXT,
  ai_summary_approved INTEGER NOT NULL DEFAULT 0,
  discharge_sent INTEGER NOT NULL DEFAULT 0,
  discharge_sent_at INTEGER,
  pharmacy_name TEXT,
  pharmacy_address TEXT,
  pharmacy_phone TEXT,
  pharmacy_fax TEXT,
  pharmacy_email TEXT,
  is_guest INTEGER DEFAULT 0,
  guest_token TEXT,
  pet_breed TEXT NOT NULL CHECK (pet_breed GLOB '*[a-zA-Z]*'),
  pet_dob TEXT,
  pet_weight REAL NOT NULL CHECK (pet_weight > 0 AND typeof(pet_weight) IN ('integer', 'real')),
  sms_consent INTEGER NOT NULL DEFAULT 0,
  pet_sex TEXT,
  pet_spayed_neutered INTEGER DEFAULT 0,
  pet_color TEXT
);

INSERT INTO consultations_new SELECT
  id, user_id, user_name, user_email, user_phone, pet_name, pet_type, concern,
  date, time, status, payment_status, stripe_customer_id, stripe_payment_method_id,
  stripe_payment_intent_id, stripe_refund_id, promo_code, promo_discount, promo_type,
  amount_cents, daily_room_url, notif_confirmation_sent, notif_confirmation_sent_at,
  notif_reminder_sent, notif_reminder_sent_at, notif_video_link_sent, notif_video_link_sent_at,
  notif_payment_failed_sent, cancelled_at, cancelled_by, created_at, updated_at,
  notes, completed_at, notif_overdue_last_sent, pet_id, agreements_json,
  agreements_signed_at, agreements_client_name, ai_summary, ai_summary_approved,
  discharge_sent, discharge_sent_at, pharmacy_name, pharmacy_address, pharmacy_phone,
  pharmacy_fax, pharmacy_email, is_guest, guest_token, pet_breed, pet_dob, pet_weight,
  sms_consent, pet_sex, pet_spayed_neutered, pet_color
FROM consultations;

DROP TABLE consultations;
ALTER TABLE consultations_new RENAME TO consultations;

CREATE INDEX IF NOT EXISTS idx_consultations_user_id ON consultations(user_id);
CREATE INDEX IF NOT EXISTS idx_consultations_date ON consultations(date);
CREATE INDEX IF NOT EXISTS idx_consultations_status ON consultations(status);

PRAGMA foreign_keys=ON;
