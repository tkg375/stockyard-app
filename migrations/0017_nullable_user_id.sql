-- Make user_id nullable to support guest bookings (no account required)
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
  pet_breed TEXT,
  pet_dob TEXT,
  pet_weight REAL
);

INSERT INTO consultations_new SELECT * FROM consultations;

DROP TABLE consultations;
ALTER TABLE consultations_new RENAME TO consultations;

CREATE INDEX IF NOT EXISTS idx_consultations_user_id ON consultations(user_id);
CREATE INDEX IF NOT EXISTS idx_consultations_date ON consultations(date);
CREATE INDEX IF NOT EXISTS idx_consultations_status ON consultations(status);

PRAGMA foreign_keys=ON;
