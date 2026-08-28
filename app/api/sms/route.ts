import { NextRequest, NextResponse } from 'next/server';
import { runSmsBlast } from '@/lib/send.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const company = req.headers.get('x-company') || 'LagosTSQ';
    const body = await req.json();
    const out = await runSmsBlast({
      company,
      ids: (body.ids || []).map(Number),
      text: body.text || '',
      dryRun: !!body.dryRun,
    });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
