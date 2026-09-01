import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/src/store.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Audience preview for Compose: given an audience filter, return the true counts
// (computed DB-side, so it works at 63k where loading all leads would not) plus
// one sample lead for the personalization preview.
//   emailable — all emailable leads matching the filter (ignores skipEmailed)
//   remaining — after skipEmailed (the rolling-batch "not yet emailed" count)
//   sample    — first matching lead, for the {{name}}/{{business}} preview
export async function POST(req: NextRequest) {
  const company = req.headers.get('x-company') || 'LagosTSQ';
  const f = await req.json().catch(() => ({}));
  const base = { ...f, limit: undefined };
  const [emailable, remaining, sampleArr] = await Promise.all([
    store.audienceCount(company, { ...base, skipEmailed: false }),
    store.audienceCount(company, base),
    store.resolveAudience(company, { ...base, limit: 1 }),
  ]);
  return NextResponse.json({ emailable, remaining, sample: sampleArr[0] ?? null });
}
