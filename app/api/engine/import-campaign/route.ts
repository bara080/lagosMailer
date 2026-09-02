import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/src/store.js';
import * as engine from '@/src/engine.js';
import { mailerConfig } from '@/lib/send.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Bridge: clone a legacy (KV) Compose campaign into an engine campaign + frozen
// version, so its rich content can be launched as a durable run. Tokens are
// already `{{…}}` (Compose saved them via toBackend), attachments map 1:1.
// Body: { id }  (the KV campaign id)
export async function POST(req: NextRequest) {
  try {
    const company = req.headers.get('x-company') || 'LagosTSQ';
    const { id } = await req.json();
    const kv = await store.getCampaign(company, id);
    if (!kv) return NextResponse.json({ error: 'campaign not found' }, { status: 404 });

    const from = kv.fromAddress || mailerConfig(company).from;
    const senderKey = kv.fromName ? `${kv.fromName} <${from}>` : from;
    const campaign = await engine.createCampaign(company, { name: kv.name });
    const version = await engine.addVersion(company, campaign.id, {
      subject: kv.subject,
      html: kv.html,
      text: kv.text,
      senderKey,
      providerKey: mailerConfig(company).provider,
      replyTo: kv.replyTo,
      attachments: Array.isArray(kv.attachments) ? kv.attachments : [],
    });
    return NextResponse.json({ campaign, version });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
