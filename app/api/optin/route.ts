import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/src/store.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PUBLIC endpoint — the SMS opt-in form posts here. Records the subscriber as a
// consented lead. Used as the documented opt-in path for 10DLC registration.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const company = (body.company || 'Native125th').toString();
    const phone = String(body.phone || '').trim();
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim();

    if (!phone || phone.replace(/\D/g, '').length < 10) {
      return NextResponse.json({ error: 'Please enter a valid mobile number.' }, { status: 400 });
    }
    if (!body.consent) {
      return NextResponse.json({ error: 'Please agree to receive text messages.' }, { status: 400 });
    }

    await store.add(company, {
      name, email, phone, source: 'sms-optin', stage: 'new',
      notes: `SMS opt-in consent captured ${new Date().toISOString()} via web form`,
    });
    await store.logActivity(company, { type: 'optin', text: `New SMS opt-in: ${phone}` });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
