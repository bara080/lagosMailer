'use client';
import { useRef, useState } from 'react';
import { Upload, Trash2, Copy, Check, Image as ImageIcon, FileText, FolderOpen } from 'lucide-react';
import Topbar from '@/components/Topbar';
import { useAssets, useUploadAsset, useDeleteAsset, useRegisterAssetUrl } from '@/lib/hooks';
import { useConfirm } from '@/components/ConfirmProvider';
import { EmptyState } from '@/components/ui';

export default function AssetsPage() {
  const { data, isLoading } = useAssets();
  const upload = useUploadAsset();
  const register = useRegisterAssetUrl();
  const del = useDeleteAsset();
  const confirm = useConfirm();
  const assets = data?.assets ?? [];
  const blobReady = data?.blobReady ?? false;

  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');

  async function addUrl() {
    const url = urlInput.trim();
    if (!/^https?:\/\//i.test(url)) { setErr('Enter a full URL starting with http(s)://'); return; }
    setErr(null);
    try { await register.mutateAsync({ url }); setUrlInput(''); } catch (e: any) { setErr(e.message); }
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setErr(null);
    for (const file of Array.from(files)) {
      try { await upload.mutateAsync(file); } catch (e: any) { setErr(e.message); }
    }
  }
  async function copyLink(url: string) {
    try { await navigator.clipboard.writeText(url); setCopied(url); setTimeout(() => setCopied(null), 1500); } catch { /* ignore */ }
  }
  const isImage = (t: string) => t.startsWith('image/');
  const kb = (n: number) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

  return (
    <>
      <Topbar title="Assets" subtitle="Upload and manage images & files for your emails"
        actions={
          <button className="btn" disabled={!blobReady || upload.isPending} onClick={() => inputRef.current?.click()}>
            <Upload size={15} /> {upload.isPending ? 'Uploading…' : 'Upload'}
          </button>
        } />
      <div className="page">
        <input ref={inputRef} type="file" multiple hidden onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />

        {!blobReady && (
          <div className="card pad" style={{ borderColor: 'var(--amber)', marginBottom: 16 }}>
            <b style={{ color: 'var(--amber)' }}>File storage isn’t enabled yet</b>
            <p className="muted mt8" style={{ fontSize: 13, margin: '8px 0 0' }}>
              Add <code>BLOB_READ_WRITE_TOKEN</code> (Vercel Blob) to upload and store files. Everything else works — you just can’t upload until the store is connected.
            </p>
          </div>
        )}

        {/* Drop zone */}
        <div
          className="card"
          onDragOver={(e) => { e.preventDefault(); if (blobReady) setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (blobReady) handleFiles(e.dataTransfer.files); }}
          onClick={() => blobReady && inputRef.current?.click()}
          style={{
            padding: 28, textAlign: 'center', cursor: blobReady ? 'pointer' : 'not-allowed',
            border: `1.5px dashed ${drag ? 'var(--accent)' : 'var(--border-2)'}`,
            background: drag ? 'var(--accent-soft)' : 'var(--surface)', opacity: blobReady ? 1 : 0.6,
          }}>
          <FolderOpen size={26} style={{ color: 'var(--text-dim)' }} />
          <div style={{ marginTop: 8, fontWeight: 600 }}>Drop files here or click to upload</div>
          <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>Images (JPG, PNG, WebP) show inline in emails; other files attach as downloads.</div>
        </div>

        {/* Add by URL — register an already-hosted file (no upload, no Blob) */}
        <div className="row gap8 mt12">
          <input className="input" style={{ fontSize: 13 }} value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } }}
            placeholder="…or paste a hosted image/file URL to add it (e.g. your flyer or logo link)" />
          <button className="btn ghost" disabled={register.isPending} onClick={addUrl}>Add URL</button>
        </div>

        {err && <p className="mt12" style={{ color: 'var(--red)', fontSize: 13 }}>{err}</p>}

        {/* Grid */}
        <div className="mt16">
          {isLoading ? <div className="skeleton" style={{ height: 160 }} /> :
            assets.length === 0 ? <EmptyState title="No assets yet" hint="Upload a flyer or logo to reuse across campaigns." /> : (
              <div className="assets-grid">
                {assets.map((a) => (
                  <div key={a.id} className="asset-card">
                    <div className="asset-thumb">
                      {isImage(a.contentType)
                        ? <img src={a.url} alt={a.name} />
                        : <div className="asset-file"><FileText size={30} /></div>}
                    </div>
                    <div className="asset-meta">
                      <div className="row gap6" style={{ minWidth: 0 }}>
                        {isImage(a.contentType) ? <ImageIcon size={13} /> : <FileText size={13} />}
                        <span className="asset-name" title={a.name}>{a.name}</span>
                      </div>
                      <span className="faint" style={{ fontSize: 11 }}>{kb(a.size)}</span>
                    </div>
                    <div className="asset-actions">
                      <button className="btn ghost sm" onClick={() => copyLink(a.url)} title="Copy link to use">
                        {copied === a.url ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy link</>}
                      </button>
                      <button className="btn ghost sm danger" disabled={del.isPending}
                        onClick={async () => { if (await confirm({ title: 'Delete asset?', message: <>Delete <b>“{a.name}”</b>? This can’t be undone.</>, confirmLabel: 'Delete', danger: true })) del.mutate(a.id); }} title="Delete">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>

        <p className="faint mt16" style={{ fontSize: 12 }}>
          To use an asset in an email: open <b>Compose → Content</b> and click <b>Add file</b>, or copy a link here and paste it (e.g. as your signature logo).
        </p>
      </div>
    </>
  );
}
