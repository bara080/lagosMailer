// Google Sheets → leads sync via a service account (private, secure).
//
// The service-account credentials are account-wide (env). The SHEET per company
// is DYNAMIC: stored in the DB (company settings) and settable from the UI, so
// you can connect/change a sheet without editing env or redeploying. Falls back
// to env (`..._SHEET_ID`) if nothing is configured in the DB.
import { JWT } from 'google-auth-library';
import * as store from '../src/store.js';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

// Accept a full Google Sheets URL or a raw ID → return the ID.
export function extractSheetId(urlOrId) {
  const s = String(urlOrId || '').trim();
  const m = s.match(/\/d\/([a-zA-Z0-9\-_]+)/);
  return (m ? m[1] : s).trim();
}

function saCreds() {
  const e = process.env;
  return {
    email: e.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (e.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  };
}

// Resolve the effective sheet config for a company (DB settings first, then env).
export async function sheetConfig(company) {
  const co = company || 'LagosTSQ';
  const s = await store.getSettings(co);
  const e = process.env;
  const p = co.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const pick = (name) => (p && e[`${p}_${name}`]) || e[name];
  const { email, key } = saCreds();
  const sheetId = s.sheetId || pick('SHEET_ID') || '';
  const range = s.sheetRange || pick('SHEET_RANGE') || 'Sheet1';
  return {
    ready: !!(email && key && sheetId),
    hasCreds: !!(email && key),
    email, key, sheetId, range,
    sheetUrl: sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit` : '',
  };
}

// Persist a company's sheet (from a URL or ID) into its DB settings.
export async function setSheet(company, urlOrId, range) {
  const sheetId = extractSheetId(urlOrId);
  if (!sheetId) throw new Error('Provide a Google Sheet URL or ID');
  await store.setSettings(company || 'LagosTSQ', { sheetId, sheetRange: range || 'Sheet1' });
  return { sheetId };
}

// Fetch rows as header→value objects.
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

// Sync a company's configured sheet into its leads (dedup-safe).
export async function syncSheet(company) {
  const co = company || 'LagosTSQ';
  const cfg = await sheetConfig(co);
  if (!cfg.hasCreds) throw new Error('Google Sheets not configured: set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY.');
  if (!cfg.sheetId) throw new Error('No sheet connected for this company — paste a Google Sheet URL first.');
  const rows = await fetchSheetRows(cfg);
  const { added } = await store.importCsv(co, rows);
  await store.logActivity(co, { type: 'import', text: `Synced ${added} lead(s) from Google Sheet` });
  return { added, total: rows.length };
}
