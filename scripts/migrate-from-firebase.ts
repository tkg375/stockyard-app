/**
 * Firebase → D1 Migration Script
 *
 * Run with: npx tsx scripts/migrate-from-firebase.ts
 *
 * Requires:
 *   - GOOGLE_APPLICATION_CREDENTIALS env var pointing to a Firebase service account JSON
 *   - CLOUDFLARE_D1_API_TOKEN + CLOUDFLARE_ACCOUNT_ID + D1_DATABASE_ID env vars
 *     OR run with wrangler: npx wrangler d1 execute stockyard-db --file=output/migrate.sql
 *
 * This script exports all Firestore data to SQL INSERT statements that can be
 * applied to the Cloudflare D1 database.
 */

import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

const outputDir = path.join(process.cwd(), "scripts", "output");
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

function esc(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return val.toString();
  if (typeof val === "boolean") return val ? "1" : "0";
  return `'${String(val).replace(/'/g, "''")}'`;
}

function toUnix(val: unknown): number {
  if (!val) return Math.floor(Date.now() / 1000);
  if (val instanceof admin.firestore.Timestamp) return val.seconds;
  if (val instanceof Date) return Math.floor(val.getTime() / 1000);
  return Math.floor(Date.now() / 1000);
}

async function main() {
  const lines: string[] = ["-- Firebase → D1 migration", "-- Generated: " + new Date().toISOString(), ""];

  // ─── Users ──────────────────────────────────────────────────────────────────
  console.log("Exporting users...");
  const usersSnap = await db.collection("users").get();
  lines.push("-- USERS");
  for (const doc of usersSnap.docs) {
    const d = doc.data();
    lines.push(
      `INSERT OR IGNORE INTO users (id, email, password_hash, name, phone, address, city, state, zip, role, created_at, updated_at) VALUES (` +
      `${esc(doc.id)}, ${esc(d.email?.toLowerCase())}, ${esc("__FIREBASE_MIGRATED__")}, ` +
      `${esc(d.name || d.displayName)}, ${esc(d.phone)}, ${esc(d.address)}, ` +
      `${esc(d.city)}, ${esc(d.state)}, ${esc(d.zip)}, ` +
      `${esc(d.role || "customer")}, ${toUnix(d.createdAt)}, ${toUnix(d.updatedAt || d.createdAt)});`
    );
  }
  console.log(`  → ${usersSnap.size} users`);

  // ─── Consultations ───────────────────────────────────────────────────────────
  console.log("Exporting consultations...");
  const consultSnap = await db.collection("consultations").get();
  lines.push("", "-- CONSULTATIONS");
  for (const doc of consultSnap.docs) {
    const d = doc.data();
    const n = d.notifications ?? {};
    lines.push(
      `INSERT OR IGNORE INTO consultations (` +
      `id, user_id, user_name, user_email, user_phone, pet_name, pet_type, concern, date, time, ` +
      `status, payment_status, stripe_customer_id, stripe_payment_method_id, stripe_payment_intent_id, ` +
      `stripe_refund_id, promo_code, amount_cents, notif_confirmation_sent, notif_reminder_sent, ` +
      `notif_video_link_sent, notif_payment_failed_sent, cancelled_at, cancelled_by, created_at, updated_at` +
      `) VALUES (` +
      `${esc(doc.id)}, ${esc(d.userId)}, ${esc(d.userName)}, ${esc(d.userEmail)}, ${esc(d.userPhone)}, ` +
      `${esc(d.petName)}, ${esc(d.petType)}, ${esc(d.concern)}, ${esc(d.date)}, ${esc(d.time)}, ` +
      `${esc(d.status || "pending")}, ${esc(d.paymentStatus || "unpaid")}, ` +
      `${esc(d.stripeCustomerId)}, ${esc(d.stripePaymentMethodId)}, ${esc(d.stripePaymentIntentId)}, ` +
      `${esc(d.stripeRefundId)}, ${esc(d.promoCode)}, ${esc(d.amountCents ?? null)}, ` +
      `${n.confirmationSent ? 1 : 0}, ${n.reminderSent ? 1 : 0}, ${n.videoLinkSent ? 1 : 0}, ` +
      `${d.paymentFailedNotificationSent ? 1 : 0}, ` +
      `${d.cancelledAt ? toUnix(d.cancelledAt) : "NULL"}, ${esc(d.cancelledBy)}, ` +
      `${toUnix(d.createdAt)}, ${toUnix(d.updatedAt || d.createdAt)});`
    );

    // Messages subcollection
    const msgSnap = await doc.ref.collection("messages").get();
    if (!msgSnap.empty) {
      lines.push(`-- Messages for consultation ${doc.id}`);
      for (const msg of msgSnap.docs) {
        const m = msg.data();
        lines.push(
          `INSERT OR IGNORE INTO messages (id, consultation_id, sender_id, sender_type, text, created_at) VALUES (` +
          `${esc(msg.id)}, ${esc(doc.id)}, ${esc(m.senderId)}, ${esc(m.senderType)}, ${esc(m.text)}, ${toUnix(m.createdAt)});`
        );
      }
    }
  }
  console.log(`  → ${consultSnap.size} consultations`);

  // ─── Settings ────────────────────────────────────────────────────────────────
  console.log("Exporting settings...");
  const vetDoc = await db.collection("settings").doc("vetContact").get();
  if (vetDoc.exists) {
    const d = vetDoc.data()!;
    lines.push("", "-- SETTINGS");
    if (d.name) lines.push(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('vet_name', ${esc(d.name)}, unixepoch());`);
    if (d.email) lines.push(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('vet_email', ${esc(d.email)}, unixepoch());`);
    if (d.phone) lines.push(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('vet_phone', ${esc(d.phone)}, unixepoch());`);
    console.log("  → vet contact settings exported");
  }

  lines.push("", "-- Migration complete");
  const outFile = path.join(outputDir, "migrate.sql");
  fs.writeFileSync(outFile, lines.join("\n"));
  console.log(`\nDone! SQL written to: ${outFile}`);
  console.log("\nApply to local D1:  npx wrangler d1 execute stockyard-db --local --file=scripts/output/migrate.sql");
  console.log("Apply to remote D1: npx wrangler d1 execute stockyard-db --remote --file=scripts/output/migrate.sql");
  console.log("\nNOTE: Users migrated with password_hash='__FIREBASE_MIGRATED__'.");
  console.log("      These users must reset their password via the forgot-password flow.");
}

main().catch(console.error).finally(() => process.exit(0));
