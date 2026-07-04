-- consultations.pet_id still declares REFERENCES pets(id), but migration
-- 0022 dropped the pets table (accounts no longer save pets). SQLite/D1
-- validates FK-referenced tables at insert time even when the FK column
-- itself is NULL, so this dangling reference has been breaking every single
-- consultation insert with "no such table: main.pets" — a customer's card
-- gets charged, then the booking write fails outright.
--
-- pet_id has been unused/nullable since 0022; drop the constraint by
-- rebuilding without it (same pattern as migration 0021).
--
-- This rebuild also restores two UNIQUE indexes (double-booking prevention
-- from 0005, payment-intent-reuse prevention from 0008) that 0021's table
-- rebuild silently dropped and never recreated — confirmed missing from
-- production. Both app routes assume these exist as a DB-level backstop
-- against race conditions the app-level checks can't fully close.

PRAGMA foreign_keys=OFF;

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
  pet_id TEXT,
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_consultations_date_time
  ON consultations(date, time)
  WHERE status NOT IN ('cancelled');

CREATE UNIQUE INDEX IF NOT EXISTS idx_consultations_payment_intent
  ON consultations(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

PRAGMA foreign_keys=ON;
