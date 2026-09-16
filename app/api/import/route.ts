import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/src/store.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // large imports scan all existing emails for dedup

// Minimal CSV parser (quoted fields + embedded commas/newlines).
function parseCsv(txt: string) {
  const rows: string[][] = [];
  let row: string[] = [], field = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) {
      if (c === '"' && txt[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows.shift()!.map((h) => h.trim().toLowerCase());
  return rows
    .filter((r) => r.some((v) => v.trim()))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

// GET → all existing (lowercased) emails for the company. The upload UI fetches
// this once and does dedup/validation client-side, so it never POSTs a whole
// large file up (which exceeds the request-body limit → 413 "Request Entity Too
// Large"). Only the net-new rows are POSTed back, in small chunks.
export async function GET(req: NextRequest) {
  const company = req.headers.get('x-company') || 'LagosTSQ';
  return NextResponse.json({ emails: await store.existingEmails(company) });
}

export async function POST(req: NextRequest) {
  const company = req.headers.get('x-company') || 'LagosTSQ';
  const body = await req.json();
  // Upload path: `presorted` rows are already validated + deduped client-side and
  // arrive in small chunks → straight insert (no re-scan, no giant payload).
  if (body.presorted && Array.isArray(body.rows)) {
    return NextResponse.json(await store.insertLeads(company, body.rows));
  }
  // Legacy path: a raw `csv` string (paste box) or pre-parsed `rows`. `dryRun`
  // returns the validation+dedup preview without writing.
  const rows = Array.isArray(body.rows) ? body.rows : parseCsv(body.csv || '');
  if (body.dryRun) return NextResponse.json(await store.previewImport(company, rows));
  return NextResponse.json(await store.importCsv(company, rows));
}
