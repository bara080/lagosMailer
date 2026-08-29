import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth/session';
import { runTestSend } from '@/lib/send.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Send ONE test email to the logged-in user's OWN address. Creates no lead and
// never touches the campaign audience — the safe way to try a draft.
export async function POST(req: NextRequest) {
  try {
    const company = req.headers.get('x-company') || 'LagosTSQ';
    const session = await readSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    // Recipient is always the operator's own email — not caller-controlled.
    const out = await runTestSend({
      company, to: session.email,
      subject: body.subject || '', html: body.html || '', text: body.text || '',
      attachments: body.attachments || [],
    });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
