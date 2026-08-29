import { NextRequest, NextResponse } from 'next/server';
import { put, del } from '@vercel/blob';
import * as store from '@/src/store.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const hasBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

// List this company's uploaded assets (reusable library).
export async function GET(req: NextRequest) {
  const company = req.headers.get('x-company') || 'LagosTSQ';
  const assets = await store.listAssets(company);
  return NextResponse.json({ assets, blobReady: hasBlob() });
}

// Upload a file to Vercel Blob, then register its metadata in Supabase.
// Body is multipart/form-data with a `file` field.
export async function POST(req: NextRequest) {
  try {
    if (!hasBlob()) {
      return NextResponse.json({ error: 'File storage is not configured yet. Add BLOB_READ_WRITE_TOKEN (Vercel Blob) to enable uploads.' }, { status: 503 });
    }
    const company = req.headers.get('x-company') || 'LagosTSQ';
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });

    const safeName = file.name.replace(/[^\w.\-]+/g, '_');
    const key = `${company}/${Date.now().toString(36)}-${safeName}`;
    const blob = await put(key, file, { access: 'public', contentType: file.type || 'application/octet-stream' });

    const asset = await store.addAsset(company, {
      url: blob.url, name: file.name, contentType: file.type || 'application/octet-stream', size: file.size,
    });
    await store.logActivity(company, { type: 'asset', text: `Uploaded asset "${file.name}"` });
    return NextResponse.json({ asset });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

// Delete an asset from Blob + the registry.
export async function DELETE(req: NextRequest) {
  try {
    const company = req.headers.get('x-company') || 'LagosTSQ';
    const id = Number(new URL(req.url).searchParams.get('id'));
    const gone = await store.removeAsset(company, id);
    if (gone?.url && hasBlob()) { try { await del(gone.url); } catch { /* already gone */ } }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
