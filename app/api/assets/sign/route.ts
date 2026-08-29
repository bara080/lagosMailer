import { NextRequest, NextResponse } from 'next/server';
import { createUploadUrl, storageReady } from '@/lib/storage.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Returns a signed URL the browser uploads to DIRECTLY (bypassing this function's
// body-size limit). The client then registers the finished asset via POST /api/assets.
export async function POST(req: NextRequest) {
  try {
    if (!storageReady()) return NextResponse.json({ error: 'File storage is not configured.' }, { status: 503 });
    const company = req.headers.get('x-company') || 'LagosTSQ';
    const body = await req.json().catch(() => ({}));
    const out = await createUploadUrl({ company, filename: body.filename || 'file' });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
