import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/src/store.js';
import { uploadToStorage, removeFromStorage, storageReady } from '@/lib/storage.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// List this company's uploaded assets (reusable library). `blobReady` (kept for
// the client's naming) reflects whether the upload backend — Supabase Storage —
// is configured; it always is here, so uploads are enabled.
export async function GET(req: NextRequest) {
  const company = req.headers.get('x-company') || 'LagosTSQ';
  const assets = await store.listAssets(company);
  return NextResponse.json({ assets, blobReady: storageReady() });
}

// POST accepts either:
//  - application/json { url, name?, contentType?, size? } → register an already-
//    hosted asset (no upload), or
//  - multipart/form-data with a `file` field → upload to Supabase Storage.
export async function POST(req: NextRequest) {
  try {
    const company = req.headers.get('x-company') || 'LagosTSQ';

    // URL registration path.
    if ((req.headers.get('content-type') || '').includes('application/json')) {
      const body = await req.json().catch(() => ({}));
      const url = String(body.url || '').trim();
      if (!/^https?:\/\//i.test(url)) return NextResponse.json({ error: 'Provide a valid URL.' }, { status: 400 });
      const name = String(body.name || url.split('/').pop()?.split('?')[0] || 'asset');
      const ext = (name.split('.').pop() || '').toLowerCase();
      const isImg = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext);
      const asset = await store.addAsset(company, {
        url, name, contentType: body.contentType || (isImg ? `image/${ext === 'jpg' ? 'jpeg' : ext}` : 'application/octet-stream'), size: body.size || 0, backend: 'external',
      });
      await store.logActivity(company, { type: 'asset', text: `Linked asset "${name}"` });
      return NextResponse.json({ asset });
    }

    // Upload path — Supabase Storage (works everywhere, no Blob token/OIDC needed).
    if (!storageReady()) {
      return NextResponse.json({ error: 'File storage is not configured (Supabase).' }, { status: 503 });
    }
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const { url, path } = await uploadToStorage({ company, filename: file.name, buffer, contentType: file.type });
    const asset = await store.addAsset(company, {
      url, name: file.name, contentType: file.type || 'application/octet-stream', size: file.size, backend: 'supabase', path,
    });
    await store.logActivity(company, { type: 'asset', text: `Uploaded asset "${file.name}"` });
    return NextResponse.json({ asset });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

// Delete an asset from Storage (if we host it) + the registry.
export async function DELETE(req: NextRequest) {
  try {
    const company = req.headers.get('x-company') || 'LagosTSQ';
    const id = Number(new URL(req.url).searchParams.get('id'));
    const gone = await store.removeAsset(company, id);
    if (gone?.backend === 'supabase' && gone?.path) { try { await removeFromStorage(gone.path); } catch { /* already gone */ } }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
