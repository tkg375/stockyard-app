/**
 * Firestore REST API export → D1 SQL migration
 * Uses the Firebase CLI's cached access token — no service account needed.
 *
 * Run: node scripts/export-firestore.mjs
 */

import fs from "fs";
import path from "path";
import os from "os";

const PROJECT_ID = "stockyard-animal-health";
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ─── Load access token from Firebase CLI cache ────────────────────────────────
function getToken() {
  const configPath = path.join(os.homedir(), ".config/configstore/firebase-tools.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const token = config?.tokens?.access_token;
  const expiresAt = config?.tokens?.expires_at;
  if (!token) throw new Error("No Firebase access token found. Run: firebase login");
  if (expiresAt && Date.now() > expiresAt) {
    console.warn("⚠️  Firebase token may be expired. Run: firebase login --reauth if this fails.");
  }
  return token;
}

const TOKEN = getToken();

async function firestoreGet(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) throw new Error(`Firestore error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function listCollection(collection) {
  const docs = [];
  let pageToken = null;
  do {
    const url = `${BASE_URL}/${collection}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const data = await firestoreGet(url);
    if (data.documents) docs.push(...data.documents);
    pageToken = data.nextPageToken ?? null;
  } while (pageToken);
  return docs;
}

async function listSubcollection(docPath, sub) {
  const docs = [];
  let pageToken = null;
  do {
    const url = `https://firestore.googleapis.com/v1/${docPath}/${sub}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!res.ok) return docs;
    const data = await res.json();
    if (data.documents) docs.push(...data.documents);
    pageToken = data.nextPageToken ?? null;
  } while (pageToken);
  return docs;
}

// ─── Firestore value → JS value ──────────────────────────────────────────────
function fval(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return Math.floor(new Date(v.timestampValue).getTime() / 1000);
  if ("nullValue" in v) return null;
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, val]) => [k, fval(val)]));
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(fval);
  return null;
}

function fields(doc) {
  const out = {};
  for (const [k, v] of Object.entries(doc.fields ?? {})) out[k] = fval(v);
  return out;
}

function docId(doc) {
  return doc.name.split("/").pop();
}

// ─── SQL helpers ─────────────────────────────────────────────────────────────
function esc(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return val.toString();
  if (typeof val === "boolean") return val ? "1" : "0";
  return `'${String(val).replace(/'/g, "''")}'`;
}

function ts(doc, field) {
  const v = fields(doc)[field];
  if (typeof v === "number") return v;
  return Math.floor(Date.now() / 1000);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const outputDir = path.join(process.cwd(), "scripts", "output");
fs.mkdirSync(outputDir, { recursive: true });

const lines = [
  `-- Firestore → D1 migration`,
  `-- Project: ${PROJECT_ID}`,
  `-- Generated: ${new Date().toISOString()}`,
  ``,
  `PRAGMA foreign_keys = OFF;`,
  ``,
];

// ── Users ─────────────────────────────────────────────────────────────────────
console.log("📦 Fetching users...");
const userDocs = await listCollection("users");
console.log(`   → ${userDocs.length} users`);
lines.push("-- USERS");

for (const doc of userDocs) {
  const id = docId(doc);
  const d = fields(doc);
  lines.push(
    `INSERT OR IGNORE INTO users (id, email, password_hash, name, phone, address, city, state, zip, role, stripe_customer_id, created_at, updated_at) VALUES (` +
    `${esc(id)}, ${esc((d.email ?? "").toLowerCase())}, '__FIREBASE_MIGRATED__', ` +
    `${esc(d.name ?? d.displayName ?? "")}, ${esc(d.phone ?? null)}, ${esc(d.address ?? null)}, ` +
    `${esc(d.city ?? null)}, ${esc(d.state ?? null)}, ${esc(d.zip ?? null)}, ` +
    `${esc(d.role ?? "customer")}, ${esc(d.stripeCustomerId ?? null)}, ` +
    `${ts(doc, "createdAt")}, ${ts(doc, "updatedAt") || ts(doc, "createdAt")});`
  );
}

// ── Consultations ─────────────────────────────────────────────────────────────
console.log("📦 Fetching consultations...");
const consultDocs = await listCollection("consultations");
console.log(`   → ${consultDocs.length} consultations`);
lines.push("", "-- CONSULTATIONS");

let totalMessages = 0;
for (const doc of consultDocs) {
  const id = docId(doc);
  const d = fields(doc);
  const n = d.notifications ?? {};

  lines.push(
    `INSERT OR IGNORE INTO consultations (` +
    `id, user_id, user_name, user_email, user_phone, pet_name, pet_type, concern, date, time, ` +
    `status, payment_status, stripe_customer_id, stripe_payment_method_id, stripe_payment_intent_id, ` +
    `stripe_refund_id, promo_code, promo_discount, amount_cents, ` +
    `notif_confirmation_sent, notif_reminder_sent, notif_video_link_sent, notif_payment_failed_sent, ` +
    `cancelled_at, cancelled_by, created_at, updated_at` +
    `) VALUES (` +
    `${esc(id)}, ${esc(d.userId ?? null)}, ${esc(d.userName ?? "")}, ${esc(d.userEmail ?? "")}, ${esc(d.userPhone ?? null)}, ` +
    `${esc(d.petName ?? "")}, ${esc(d.petType ?? "")}, ${esc(d.concern ?? "")}, ${esc(d.date ?? "")}, ${esc(d.time ?? "")}, ` +
    `${esc(d.status ?? "pending")}, ${esc(d.paymentStatus ?? "unpaid")}, ` +
    `${esc(d.stripeCustomerId ?? null)}, ${esc(d.stripePaymentMethodId ?? null)}, ${esc(d.stripePaymentIntentId ?? null)}, ` +
    `${esc(d.stripeRefundId ?? null)}, ${esc(d.promoCode ?? null)}, ${esc(d.promoDiscount ?? null)}, ${esc(d.amountCents ?? null)}, ` +
    `${n.confirmationSent ? 1 : 0}, ${n.reminderSent ? 1 : 0}, ${n.videoLinkSent ? 1 : 0}, ` +
    `${d.paymentFailedNotificationSent ? 1 : 0}, ` +
    `${d.cancelledAt ? esc(d.cancelledAt) : "NULL"}, ${esc(d.cancelledBy ?? null)}, ` +
    `${ts(doc, "createdAt")}, ${ts(doc, "updatedAt") || ts(doc, "createdAt")});`
  );

  // Messages subcollection
  const msgDocs = await listSubcollection(doc.name, "messages");
  if (msgDocs.length) {
    for (const msg of msgDocs) {
      const m = fields(msg);
      lines.push(
        `INSERT OR IGNORE INTO messages (id, consultation_id, sender_id, sender_type, text, created_at) VALUES (` +
        `${esc(docId(msg))}, ${esc(id)}, ${esc(m.senderId ?? "")}, ${esc(m.senderType ?? "customer")}, ${esc(m.text ?? "")}, ${ts(msg, "createdAt")});`
      );
      totalMessages++;
    }
  }
}
console.log(`   → ${totalMessages} messages`);

// ── Firebase Auth users (exported separately via CLI) ──────────────────────
// Note: Auth users cannot be fetched via REST without a service account.
// The password_hash for migrated users is '__FIREBASE_MIGRATED__' — they
// will need to use "Forgot Password" on first login to the new site.

// ── Settings ──────────────────────────────────────────────────────────────────
console.log("📦 Fetching settings...");
try {
  const settingsRes = await firestoreGet(`${BASE_URL}/settings/vetContact`);
  const s = fields(settingsRes);
  lines.push("", "-- SETTINGS (vet contact)");
  if (s.name) lines.push(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('vet_name', ${esc(s.name)}, unixepoch());`);
  if (s.email) lines.push(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('vet_email', ${esc(s.email)}, unixepoch());`);
  if (s.phone) lines.push(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('vet_phone', ${esc(s.phone)}, unixepoch());`);
  console.log("   → vet contact settings exported");
} catch {
  // Seed from .env values as fallback
  lines.push("", "-- SETTINGS (seeded from .env)");
  lines.push(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('vet_name', 'Dr. Meleah McMillen', unixepoch());`);
  lines.push(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('vet_email', 'stockyardanimalhealth@gmail.com', unixepoch());`);
  lines.push(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('vet_phone', '+14076039795', unixepoch());`);
  console.log("   → vet settings seeded from .env values");
}

lines.push("", `PRAGMA foreign_keys = ON;`, "", "-- Migration complete");

const outFile = path.join(outputDir, "migrate.sql");
fs.writeFileSync(outFile, lines.join("\n"));

console.log(`\n✅ Done!`);
console.log(`   Users:         ${userDocs.length}`);
console.log(`   Consultations: ${consultDocs.length}`);
console.log(`   Messages:      ${totalMessages}`);
console.log(`\n📄 SQL written to: ${outFile}`);
