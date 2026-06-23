/**
 * Migrate soapNotes from Firestore consultations → D1 notes column
 * Run: node scripts/migrate-soap-notes.mjs
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const PROJECT_ID = 'stockyard-animal-health';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function getToken() {
  const configPath = path.join(os.homedir(), '.config/configstore/firebase-tools.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const token = config?.tokens?.access_token;
  if (!token) throw new Error('No Firebase access token. Run: firebase login');
  return token;
}

const TOKEN = getToken();

function fval(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return Math.floor(new Date(v.timestampValue).getTime() / 1000);
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, val]) => [k, fval(val)]));
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fval);
  return null;
}

function esc(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return val.toString();
  return `'${String(val).replace(/'/g, "''")}'`;
}

console.log('📦 Fetching consultations...');
let allDocs = [];
let pageToken = null;
do {
  const url = `${BASE_URL}/consultations?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const data = await res.json();
  if (data.documents) allDocs.push(...data.documents);
  pageToken = data.nextPageToken ?? null;
} while (pageToken);

console.log(`   → ${allDocs.length} consultations`);

const lines = [
  `-- SOAP Notes migration from Firestore`,
  `-- Generated: ${new Date().toISOString()}`,
  ``,
];

let count = 0;
for (const doc of allDocs) {
  const id = doc.name.split('/').pop();
  const notesField = doc.fields?.soapNotes;
  if (!notesField) continue;

  const notesMap = fval(notesField);
  if (!notesMap || typeof notesMap !== 'object') continue;

  // Build SOAP object matching the app's expected format
  const soap = {
    subjective: notesMap.subjective ?? '',
    objective: notesMap.objective ?? '',
    assessment: notesMap.assessment ?? '',
    plan: notesMap.plan ?? '',
  };

  const notesJson = JSON.stringify(soap);
  lines.push(`UPDATE consultations SET notes = ${esc(notesJson)}, updated_at = unixepoch() WHERE id = ${esc(id)};`);
  count++;
}

lines.push(``, `-- ${count} consultations updated`);

const outDir = path.join(process.cwd(), 'scripts', 'output');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'migrate_soap_notes.sql');
fs.writeFileSync(outFile, lines.join('\n'));

console.log(`✅ Done! ${count} SOAP notes exported.`);
console.log(`📄 SQL written to: ${outFile}`);
