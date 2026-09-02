import { NextRequest, NextResponse } from 'next/server';
import * as engine from '@/src/engine.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Paginated recipients for a run (Recipients tab). ?page&limit&status
export async function GET(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const company = req.headers.get('x-company') || 'LagosTSQ';
  const { runId } = await params;
  const sp = req.nextUrl.searchParams;
  const page = Math.max(Number(sp.get('page')) || 1, 1);
  const limit = Math.min(Math.max(Number(sp.get('limit')) || 50, 1), 200);
  const status = sp.get('status') || undefined;
  return NextResponse.json(await engine.listRecipients(company, runId, { page, limit, status }));
}
