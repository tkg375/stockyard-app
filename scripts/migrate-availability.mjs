/**
 * Migrate Firebase availability → D1
 * Run: node scripts/migrate-availability.mjs
 */
import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";

const PROJECT_ID = "stockyard-animal-health";
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function getToken() {
  const configPath = path.join(os.homedir(), ".config/configstore/firebase-tools.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  return config?.tokens?.access_token;
}

function fval(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, val]) => [k, fval(val)]));
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(fval);
  return null;
}

const TOKEN = getToken();

// Fetch Firebase availability
const res = await fetch(`${BASE_URL}/settings/availability`, { headers: { Authorization: `Bearer ${TOKEN}` } });
if (!res.ok) throw new Error(`Firebase error ${res.status}: ${await res.text()}`);
const doc = await res.json();
const data = {};
for (const [k, v] of Object.entries(doc.fields ?? {})) data[k] = fval(v);

// Firebase day keys: "0"=Sun, "1"=Mon, ..., "6"=Sat
// App day keys: sun, mon, tue, wed, thu, fri, sat
const fbToApp = { "0": "sun", "1": "mon", "2": "tue", "3": "wed", "4": "thu", "5": "fri", "6": "sat" };

const weeklySchedule = {};
for (const [fbKey, appKey] of Object.entries(fbToApp)) {
  const slots = data.weeklySchedule?.[fbKey] ?? [];
  weeklySchedule[appKey] = {
    enabled: slots.length > 0,
    start: slots[0] ?? "09:00",
    end: slots[slots.length - 1] ?? "17:00",
  };
}

// Firebase blockedDates: [{date, reason}] → string[]
const blockedDates = (data.blockedDates ?? []).map((b) => (typeof b === "string" ? b : b.date)).filter(Boolean);

const availability = { weeklySchedule, blockedDates };
console.log("Converted availability:", JSON.stringify(availability, null, 2));

// Write SQL
const sql = `INSERT INTO settings (key, value, updated_at) VALUES ('availability', '${JSON.stringify(availability).replace(/'/g, "''")}', unixepoch()) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch();`;

const outFile = path.join(process.cwd(), "scripts", "output", "migrate_availability.sql");
fs.writeFileSync(outFile, sql);
console.log("\n📄 SQL written to:", outFile);

// Apply to remote D1
console.log("\n🚀 Applying to remote D1...");
execSync(`npx wrangler d1 execute stockyard-db --remote --file=${outFile}`, { stdio: "inherit" });
console.log("✅ Done!");
