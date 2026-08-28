// Google Sheets → leads sync via a service account (private, secure).
//
// Setup: create a Google Cloud service account, enable the Sheets API, and
// SHARE each company's sheet with the service account's email (Viewer). No
// per-user OAuth needed. Reads are scoped read-only.
//
// The sheet's first row must be a header row using columns the importer knows:
//   email (or to_email), name (or owner), business (or business_name),
//   category, phone, instagram, website, source, subject
import { JWT } from 'google-auth-library';
import * as store from '../src/store.js';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

// Per-company config. Company-prefixed env first (e.g. LAGOSTSQ_SHEET_ID),
// falling back to generic SHEET_ID / SHEET_RANGE. The service-account
// credentials are account-wide (one SA can read every shared sheet).
export function gsheetConfig(company) {
  const e = process.env;
  const p = String(company || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const pick = (name) => (p && e[`${p}_${name}`]) || e[name];
  const email = e.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (e.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'); // env stores \n escaped
  const sheetId = pick('SHEET_ID');
  const range = pick('SHEET_RANGE') || 'Sheet1';
  return { ready: !!(email && key && sheetId), email, key, sheetId, range };
}

// Fetch rows as header→value objects (reusable).
export async function fetchSheetRows({ email, key, sheetId, range }) {
  const client = new JWT({ email, key, scopes: SCOPES });
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`;
  const res = await client.request({ url });
  const values = res.data?.values || [];
  if (values.length < 2) return [];
  const header = values[0].map((h) => String(h).trim().toLowerCase());
  return values
    .slice(1)
    .filter((r) => r.some((c) => String(c ?? '').trim()))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, String(r[i] ?? '').trim()])));
}

// Sync a company's sheet into its leads (dedup-safe via store.importCsv).
export async function syncSheet(company) {
  const co = company || 'LagosTSQ';
  const cfg = gsheetConfig(co);
  if (!cfg.ready) {
    throw new Error('Google Sheets not configured for this company — set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, and a (company) SHEET_ID.');
  }
  const rows = await fetchSheetRows(cfg);
  const { added } = await store.importCsv(co, rows);
  await store.logActivity(co, { type: 'import', text: `Synced ${added} lead(s) from Google Sheet` });
  return { added, total: rows.length };
}
