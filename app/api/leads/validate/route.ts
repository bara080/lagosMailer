import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/src/store.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Email list validation (syntax + MX).
//   GET  → counts by email_status.
//   POST → validate one batch of unchecked leads; returns counts + `remaining`.
//          The client loops POST until `done` (progress bar).
export async function GET(req: NextRequest) {
  const company = req.headers.get('x-company') || 'LagosTSQ';
  return NextResponse.json(await store.validationCounts(company));
}

export async function POST(req: NextRequest) {
  const company = req.headers.get('x-company') || 'LagosTSQ';
  const b = await req.json().catch(() => ({}));
  return NextResponse.json(await store.validateLeads(company, { limit: b.limit || 2000 }));
}

// DELETE → remove invalid (dead-domain) leads from the leads table (they remain
// on the suppression list).
export async function DELETE(req: NextRequest) {
  const company = req.headers.get('x-company') || 'LagosTSQ';
  return NextResponse.json(await store.deleteInvalidLeads(company));
}
