import { NextRequest, NextResponse } from 'next/server';
import * as engine from '@/src/engine.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Run detail: the run row + live per-status progress + recent audit events.
export async function GET(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const company = req.headers.get('x-company') || 'LagosTSQ';
  const { runId } = await params;
  const detail = await engine.getRunDetail(company, runId);
  if (!detail) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(detail);
}
