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

export async function POST(req: NextRequest) {
  const company = req.headers.get('x-company') || 'LagosTSQ';
  const body = await req.json();
  // Accept either pre-parsed `rows` (from the client-side CSV/Excel parser) or a
  // raw `csv` string (paste box / legacy callers). `dryRun` returns the
  // validation+dedup preview without writing.
  const rows = Array.isArray(body.rows) ? body.rows : parseCsv(body.csv || '');
  if (body.dryRun) return NextResponse.json(await store.previewImport(company, rows));
  return NextResponse.json(await store.importCsv(company, rows));
}
