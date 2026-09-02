import { NextRequest, NextResponse } from 'next/server';
import * as engine from '@/src/engine.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Delete an engine campaign (cascades its versions → runs → recipients).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const company = req.headers.get('x-company') || 'LagosTSQ';
  const { id } = await params;
  return NextResponse.json(await engine.deleteCampaign(company, id));
}
