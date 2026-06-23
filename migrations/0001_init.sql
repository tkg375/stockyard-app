-- Users (replaces Firebase Auth + users Firestore collection)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  role TEXT NOT NULL DEFAULT 'customer',
  stripe_customer_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Sessions (custom auth sessions)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- Consultations (replaces consultations Firestore collection)
CREATE TABLE IF NOT EXISTS consultations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
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
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_consultations_user_id ON consultations(user_id);
CREATE INDEX IF NOT EXISTS idx_consultations_date_time ON consultations(date, time);
CREATE INDEX IF NOT EXISTS idx_consultations_status ON consultations(status);

-- Messages (replaces consultations/{id}/messages Firestore subcollection)
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  consultation_id TEXT NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  sender_type TEXT NOT NULL,
  text TEXT NOT NULL,
  read_by_vet INTEGER NOT NULL DEFAULT 0,
  read_by_customer INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_messages_consultation_id ON messages(consultation_id);

-- Settings (replaces settings/vetContact Firestore doc)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Promo codes (was hardcoded in Firebase Function)
CREATE TABLE IF NOT EXISTS promo_codes (
  code TEXT PRIMARY KEY,
  discount INTEGER NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Seed promo codes
INSERT OR IGNORE INTO promo_codes (code, discount, type, description) VALUES
  ('FIRSTVISIT', 20, 'percent', '20% off'),
  ('SAVE10', 10, 'percent', '10% off'),
  ('FRIEND20', 20, 'fixed', '$20 off'),
  ('DRMCMILLEN', 100, 'percent', 'Free consultation');
