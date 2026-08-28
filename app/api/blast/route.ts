import { NextRequest, NextResponse } from 'next/server';
import { runBlast } from '@/lib/send.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const out = await runBlast({
      ids: (body.ids || []).map(Number),
      subject: body.subject || '',
      html: body.html || '',
      text: body.text || '',
      dryRun: !!body.dryRun,
    });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
