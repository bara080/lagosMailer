// Supabase Storage backend for asset uploads. Reliable everywhere (local + prod)
// via the service-role client — no Vercel Blob token or OIDC environment needed.
// Files land in a public bucket so their URLs work as inline email images.
import { getSupabase } from './supabase.js';

const BUCKET = 'assets';
let ensured = false;

const FILE_SIZE_LIMIT = '50MB';

// Create the public bucket on first use (idempotent), with a generous per-file
// size limit so large flyers/PDFs can be uploaded directly.
async function ensureBucket() {
  if (ensured) return;
  const sb = getSupabase();
  const { data } = await sb.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await sb.storage.createBucket(BUCKET, { public: true, fileSizeLimit: FILE_SIZE_LIMIT });
    if (error && !/exist/i.test(error.message)) throw new Error(`create bucket failed: ${error.message}`);
  } else if (data.file_size_limit == null || data.file_size_limit < 50 * 1024 * 1024) {
    await sb.storage.updateBucket(BUCKET, { public: true, fileSizeLimit: FILE_SIZE_LIMIT });
  }
  ensured = true;
}

// Create a signed URL the BROWSER can upload to directly — the file never passes
// through our serverless function, so there's no ~4.5MB request-body limit.
export async function createUploadUrl({ company, filename }) {
  await ensureBucket();
  const sb = getSupabase();
  const safe = String(filename || 'file').replace(/[^\w.\-]+/g, '_');
  const path = `${company}/${Date.now().toString(36)}-${safe}`;
  const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw new Error(`could not start upload: ${error.message}`);
  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
  return { signedUrl: data.signedUrl, path, url: pub.publicUrl };
}

export function storageReady() {
  return !!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
         !!(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Upload a file buffer → returns its public URL and storage path.
export async function uploadToStorage({ company, filename, buffer, contentType }) {
  await ensureBucket();
  const sb = getSupabase();
  const safe = String(filename || 'file').replace(/[^\w.\-]+/g, '_');
  const path = `${company}/${Date.now().toString(36)}-${safe}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, buffer, {
    contentType: contentType || 'application/octet-stream', upsert: true,
  });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

// Delete a stored object by its path.
export async function removeFromStorage(path) {
  if (!path) return;
  const sb = getSupabase();
  await sb.storage.from(BUCKET).remove([path]);
}
