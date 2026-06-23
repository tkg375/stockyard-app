/**
 * Creates / resets the vet account in D1.
 * Run: node scripts/create-vet-account.mjs --remote
 *
 * Generates a temporary password, sets role='vet', prints it to console.
 * The vet should change it on first login.
 */

import { execSync } from "child_process";
import { createHash } from "crypto";

const REMOTE = process.argv.includes("--remote");
const VET_EMAIL = "stockyardanimalhealth@gmail.com";
const VET_NAME = "Dr. Meleah McMillen";
const VET_ID = "vet-dr-mcmillen";

// Simple bcrypt-compatible hash using the wrangler execute approach
// We'll store a known temp password as bcrypt hash computed locally
// bcrypt hash of "StockyardVet2026!" with salt rounds 12
// Pre-computed: $2b$12$... — we generate it via node
import bcrypt from "bcryptjs";
const TEMP_PASSWORD = "StockyardVet2026!";
const hash = await bcrypt.hash(TEMP_PASSWORD, 12);

const flag = REMOTE ? "--remote" : "--local";
const sql = `
INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at)
VALUES ('${VET_ID}', '${VET_EMAIL}', '${hash.replace(/'/g, "''")}', '${VET_NAME}', 'vet', unixepoch(), unixepoch())
ON CONFLICT(email) DO UPDATE SET
  password_hash = '${hash.replace(/'/g, "''")}',
  role = 'vet',
  name = '${VET_NAME}',
  updated_at = unixepoch();
`.trim();

// Write to temp file and execute
import { writeFileSync, unlinkSync } from "fs";
const tmpFile = "/tmp/create_vet.sql";
writeFileSync(tmpFile, sql);

try {
  execSync(`cd "${process.cwd()}" && npx wrangler d1 execute stockyard-db ${flag} --file=${tmpFile}`, { stdio: "inherit" });
  console.log("\n✅ Vet account created/reset:");
  console.log(`   Email:    ${VET_EMAIL}`);
  console.log(`   Password: ${TEMP_PASSWORD}`);
  console.log(`   Role:     vet`);
  console.log("\n⚠️  Change this password after first login!");
} finally {
  unlinkSync(tmpFile);
}
