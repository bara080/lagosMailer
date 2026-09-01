import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/src/store.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Read this company's editable settings (signature, etc.).
export async function GET(req: NextRequest) {
  const company = req.headers.get('x-company') || 'LagosTSQ';
  const settings = await store.getSettings(company);
  return NextResponse.json({ settings });
}

// Update editable settings. Currently: the per-company email signature.
export async function POST(req: NextRequest) {
  try {
    const company = req.headers.get('x-company') || 'LagosTSQ';
    const body = await req.json();
    const patch: Record<string, unknown> = {};
    if ('signature' in body) patch.signature = body.signature;
    if ('dailyCap' in body) {
      const n = Number(body.dailyCap);
      patch.dailyCap = Number.isFinite(n) && n > 0 ? Math.floor(n) : null; // null → default
    }
    await store.setSettings(company, patch);
    const settings = await store.getSettings(company);
    return NextResponse.json({ ok: true, settings });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
