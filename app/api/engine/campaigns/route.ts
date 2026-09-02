import { NextRequest, NextResponse } from 'next/server';
import * as engine from '@/src/engine.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Engine campaigns (the new relational job engine — distinct from the legacy KV
// /api/campaigns).
//   GET  → list this company's campaigns.
//   POST → create a campaign + its first frozen version (content/sender/provider).
export async function GET(req: NextRequest) {
  const company = req.headers.get('x-company') || 'LagosTSQ';
  return NextResponse.json({ campaigns: await engine.listCampaigns(company) });
}

export async function POST(req: NextRequest) {
  try {
    const company = req.headers.get('x-company') || 'LagosTSQ';
    const b = await req.json();
    const campaign = await engine.createCampaign(company, { name: b.name });
    const version = await engine.addVersion(company, campaign.id, {
      subject: b.subject, html: b.html, text: b.text,
      senderKey: b.senderKey, providerKey: b.providerKey, replyTo: b.replyTo, attachments: b.attachments,
    });
    return NextResponse.json({ campaign, version });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
