'use client';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Zap, Send, Clock, FlaskConical, Eye, Sparkles, ArrowLeft, Paperclip, X, Image as ImageIcon, FileText, Images } from 'lucide-react';
import Topbar from '@/components/Topbar';
import { useConfirm } from '@/components/ConfirmProvider';
import { useConfig, useCreateCampaign, useLeads, useSendCampaign, useTestSend, useUploadAsset, useAssets } from '@/lib/hooks';
import type { Lead, Attachment, Asset } from '@/lib/api';

// Personalization is shown to non-developers as READABLE tokens like
// "[First name]" — never raw `{{name}}` and never HTML. The user types plain
// text; on send we convert these friendly tokens to the backend `{{…}}` tokens
// and wrap the plain text into HTML (see toBackend/plainToHtml + finalize()).
const TOKENS = [
  { label: 'First name', token: '[First name]', backend: '{{name}}' },
  { label: 'Business name', token: '[Business]', backend: '{{business}}' },
  { label: 'Category', token: '[Category]', backend: '{{category}}' },
  { label: 'Email address', token: '[Email]', backend: '{{email}}' },
];

const STAGES = [
  { key: 'all', label: 'All leads' }, { key: 'new', label: 'New' }, { key: 'contacted', label: 'Contacted' },
  { key: 'replied', label: 'Replied' }, { key: 'qualified', label: 'Qualified' }, { key: 'won', label: 'Won' },
];

// Resolve friendly tokens to a sample contact's real values — used for the
// live preview so the user sees exactly what each person receives.
function fill(tpl: string, l: Partial<Lead>) {
  return (tpl || '')
    .replaceAll('[First name]', l.name || 'there')
    .replaceAll('[Business]', l.business || 'your business')
    .replaceAll('[Category]', l.category || '')
    .replaceAll('[Email]', l.email || '');
}

// Convert friendly tokens → the backend `{{…}}` tokens the mailer understands.
function toBackend(tpl: string) {
  let out = tpl || '';
  for (const t of TOKENS) out = out.replaceAll(t.token, t.backend);
  return out;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Turn a plain-text message (blank line = new paragraph, single newline = line
// break) into safe HTML. User text is escaped; the `{{…}}` tokens pass through.
// Links: `[label](url)` → a named link (clean anchor text); a bare http(s) URL
// also becomes clickable. Guarded so we never double-wrap.
const LINK = 'color:#2563eb;text-decoration:underline';
function plainToHtml(text: string) {
  let body = escapeHtml((text || '').trim())
    // named links: [Reserve on OpenTable](https://…)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, `<a href="$2" style="${LINK}">$1</a>`);
  // bare URLs not already inside a tag (not preceded by " ' or >)
  body = body.replace(/(^|[^"'>])(https?:\/\/[^\s<]+[^\s<.,;:)\]}"'])/g, `$1<a href="$2" style="${LINK}">$2</a>`);
  return body.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('\n');
}

// A friendly "click to add" row. Inserts a readable token at the caret of the
// field the user last had focused, so it drops in exactly where they're typing.
function InsertBar({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <div className="insert-bar">
      <span className="insert-hint"><Sparkles size={12} /> Add a detail:</span>
      {TOKENS.map((t) => (
        <button type="button" key={t.token} className="chip insert" onClick={() => onInsert(t.token)}>
          + {t.label}
        </button>
      ))}
    </div>
  );
}

function ComposeInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const ids = useMemo(() => (sp.get('ids') || '').split(',').map(Number).filter(Boolean), [sp]);

  const [step, setStep] = useState(1);
  const [stage, setStage] = useState('all');
  const [form, setForm] = useState({
    name: 'New campaign', fromName: '', replyTo: '',
    subject: 'Quick question about [Business]',
    message: 'Hi [First name],\n\nI came across [Business] and think we can help.\n\nBest,\nThe lagosMailer Team',
  });
  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });
  const [result, setResult] = useState<any>(null);

  // Refs to the editable fields, so "Add a detail" inserts at the caret of the
  // field the user is actually editing.
  const subjectRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const [focusField, setFocusField] = useState<'subject' | 'message'>('message');

  function insertToken(token: string) {
    const field = focusField;
    const el = field === 'subject' ? subjectRef.current : messageRef.current;
    if (!el) { setForm((f) => ({ ...f, [field]: (f as any)[field] + token })); return; }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const next = el.value.slice(0, start) + token + el.value.slice(end);
    setForm((f) => ({ ...f, [field]: next }));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  const { data: config } = useConfig();
  const create = useCreateCampaign();
  const send = useSendCampaign();
  const test = useTestSend();
  const [testMsg, setTestMsg] = useState<string | null>(null);

  // Attachments (uploaded to Blob, registered in Supabase).
  const upload = useUploadAsset();
  const { data: assetData } = useAssets();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const blobReady = assetData?.blobReady ?? true;

  // Include an image/file by pasting its public URL — works without Blob (e.g.
  // a flyer already hosted somewhere). Images default to showing inline.
  function addByUrl() {
    const url = urlInput.trim();
    if (!/^https?:\/\//i.test(url)) { setUploadErr('Enter a full URL starting with http(s)://'); return; }
    setUploadErr(null);
    const name = (url.split('/').pop() || 'image').split('?')[0];
    const ext = (name.split('.').pop() || '').toLowerCase();
    const isImg = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext);
    setAttachments((a) => [...a, { url, name, contentType: isImg ? `image/${ext === 'jpg' ? 'jpeg' : ext}` : 'application/octet-stream', size: 0, inline: isImg }]);
    setUrlInput('');
  }

  async function onFiles(files: FileList | null) {
    if (!files) return;
    setUploadErr(null);
    for (const file of Array.from(files)) {
      try {
        const { asset } = await upload.mutateAsync(file);
        setAttachments((a) => [...a, {
          url: asset.url, name: asset.name, contentType: asset.contentType, size: asset.size,
          inline: asset.contentType.startsWith('image/'), // images show inline by default
        }]);
      } catch (e: any) { setUploadErr(e.message); }
    }
  }
  const removeAttachment = (url: string) => setAttachments((a) => a.filter((x) => x.url !== url));
  const toggleInline = (url: string) => setAttachments((a) => a.map((x) => x.url === url ? { ...x, inline: !x.inline } : x));

  // Pick an already-uploaded asset from the library (no re-upload).
  const [pickerOpen, setPickerOpen] = useState(false);
  function addFromLibrary(a: Asset) {
    if (attachments.some((x) => x.url === a.url)) return; // already attached
    const isImg = (a.contentType || '').startsWith('image/');
    setAttachments((prev) => [...prev, { url: a.url, name: a.name, contentType: a.contentType, size: a.size, inline: isImg }]);
  }

  async function sendTest() {
    setTestMsg('Sending test…');
    try {
      const out = await test.mutateAsync({
        subject: toBackend(form.subject),
        html: plainToHtml(toBackend(form.message)),
        text: toBackend(form.message),
        attachments,
      });
      setTestMsg(`✓ Test sent to ${out.to} — check your inbox.`);
    } catch (e: any) {
      setTestMsg(`✗ ${e.message}`);
    }
  }

  const [mode, setMode] = useState<'audience' | 'custom'>('audience');
  const [customEmails, setCustomEmails] = useState('');
  const [limit, setLimit] = useState('');
  const [fromAddress, setFromAddress] = useState(''); // chosen "send from" (empty = company default)
  const [skipEmailed, setSkipEmailed] = useState(true); // rolling batches: don't re-email leads
  const senders = config?.senders ?? [];
  const effectiveFrom = fromAddress || config?.from || '';

  const { data: leadData } = useLeads({ stage: ids.length ? 'all' : stage });
  const customList = useMemo(
    () => customEmails.split(/[\s,;]+/).map((s) => s.trim()).filter((e) => /^\S+@\S+\.\S+$/.test(e)),
    [customEmails],
  );
  const cap = parseInt(limit, 10);

  // Leads matching the current audience filter (used for the sample preview).
  const allEmailable = useMemo(() => {
    const all = leadData?.leads ?? [];
    const base = ids.length ? all.filter((l) => ids.includes(l.id)) : all;
    return base.filter((l) => l.email && l.stage !== 'unsub');
  }, [leadData, ids, stage]);
  // Rolling batches: exclude leads already emailed (have contacted_at).
  const audienceLeads = useMemo(
    () => (skipEmailed ? allEmailable.filter((l) => !l.contacted_at) : allEmailable),
    [allEmailable, skipEmailed],
  );
  const alreadyEmailed = allEmailable.length - audienceLeads.length;

  // How many will actually receive it (mode + cap aware).
  const recipientCount = useMemo(() => {
    const n = mode === 'custom' ? customList.length : audienceLeads.length;
    return cap > 0 ? Math.min(n, cap) : n;
  }, [mode, customList, audienceLeads, cap]);

  const sample = mode === 'custom'
    ? { name: '', business: '', category: '', email: customList[0] || 'you@example.com' }
    : audienceLeads[0] ?? { name: 'Tunde', business: 'Lagos Cuts', category: 'barber', email: 'sample@example.com' };
  const sampleLabel = sample.name || sample.business || (mode === 'custom' ? (customList[0] || 'a contact') : 'a contact');

  const audience = mode === 'custom'
    ? { emails: customList, limit: cap > 0 ? cap : undefined }
    : ids.length
      ? { ids, limit: cap > 0 ? cap : undefined, skipEmailed }
      : { stage, limit: cap > 0 ? cap : undefined, skipEmailed };

  const confirm = useConfirm();
  async function askAndSend() {
    const ok = await confirm({
      title: 'Send this campaign?',
      message: <>Send <b>“{form.name}”</b> to <b>{recipientCount.toLocaleString()}</b> {mode === 'custom' ? 'custom address(es)' : 'recipient(s)'}. This sends real emails and can’t be undone.</>,
      confirmLabel: `Send to ${recipientCount.toLocaleString()}`,
      danger: recipientCount >= 50,
      requireText: recipientCount >= 50 ? String(recipientCount) : undefined,
    });
    if (ok) finalize(false);
  }

  async function finalize(dryRun: boolean) {
    setResult(null);
    const camp = await create.mutateAsync({
      name: form.name,
      subject: toBackend(form.subject),
      html: plainToHtml(toBackend(form.message)),
      text: toBackend(form.message),
      fromName: form.fromName, fromAddress: effectiveFrom, replyTo: form.replyTo, audience, status: 'draft',
      attachments,
    } as any);
    // Kick the first batch; real sends then finish in the background via the cron.
    const out: any = await send.mutateAsync({ id: camp.id, dryRun });
    if (dryRun) {
      setResult({ ...out, name: form.name });
    } else {
      setResult({ started: true, name: form.name, total: out.total ?? recipientCount, sentNow: out.sentNow ?? 0, done: out.done });
    }
  }

  return (
    <>
      <Topbar title="Compose Campaign"
        actions={<>
          <button className="btn ghost" onClick={() => router.push('/campaigns')}>Save Draft</button>
          {step > 1 && <button className="btn ghost" onClick={() => setStep(step - 1)}><ArrowLeft size={15} /> Back</button>}
          {step < 3 ? <button className="btn" onClick={() => setStep(step + 1)}>Next →</button>
            : <button className="btn" disabled={send.isPending || create.isPending} onClick={askAndSend}><Send size={15} /> Send campaign</button>}
        </>} />
      <div className="page">
        {/* Steps */}
        <div className="card pad">
          <div className="steps">
            {['Recipients', 'Content', 'Review & Send'].map((label, i) => {
              const n = i + 1;
              return (
                <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
                  <button className={`step ${step === n ? 'active' : step > n ? 'done' : ''}`} onClick={() => setStep(n)} style={{ background: 'none', border: 'none' }}>
                    <span className="num">{step > n ? <Check size={13} /> : n}</span> {label}
                  </button>
                  {n < 3 && <span className="step-line" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step 1: Recipients */}
        {step === 1 && (
          <div className="grid mt16" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="card pad">
              <h3 style={{ marginTop: 0 }}>Audience</h3>
              <div className="row gap12" style={{ alignItems: 'baseline' }}>
                <div style={{ fontSize: 34, fontWeight: 750 }}>{recipientCount.toLocaleString()}</div>
                <div className="muted">{mode === 'custom' ? 'address(es) will receive this' : 'people will receive this campaign'}</div>
              </div>

              {!ids.length && (
                <div className="pill-tabs mt12">
                  <span className={`chip ${mode === 'audience' ? 'insert' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setMode('audience')}>My leads</span>
                  <span className={`chip ${mode === 'custom' ? 'insert' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setMode('custom')}>Custom emails (test)</span>
                </div>
              )}

              {ids.length ? (
                <p className="muted mt12">Targeting <b>{ids.length}</b> hand-picked lead(s) from the Leads page.</p>
              ) : mode === 'custom' ? (
                <>
                  <label className="field mt16"><span>Send only to these emails</span>
                    <textarea className="input" style={{ minHeight: 90 }} value={customEmails} onChange={(e) => setCustomEmails(e.target.value)}
                      placeholder={'you@example.com, colleague@example.com\n(one per line or comma-separated)'} />
                  </label>
                  <p className="faint mt8" style={{ fontSize: 12 }}>Great for a real test — sends to exactly these addresses, not your 584 leads. {customList.length > 0 && <b>{customList.length} valid</b>}</p>
                </>
              ) : (
                <>
                  <label className="field mt16"><span>Filter by stage</span>
                    <select className="input" value={stage} onChange={(e) => setStage(e.target.value)}>
                      {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </label>
                  <label className="field mt12"><span>Send to at most <small className="faint">(optional cap — e.g. 200)</small></span>
                    <input className="input" type="number" min={1} value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="all" />
                  </label>
                  <label className="row gap8 mt12" style={{ fontSize: 13, cursor: 'pointer', alignItems: 'flex-start' }}>
                    <input type="checkbox" checked={skipEmailed} onChange={(e) => setSkipEmailed(e.target.checked)} style={{ marginTop: 2 }} />
                    <span>Skip leads I’ve already emailed <b className="faint">(rolling batches — no repeats)</b></span>
                  </label>
                  <p className="faint mt12" style={{ fontSize: 12 }}>
                    {skipEmailed && alreadyEmailed > 0 ? <><b>{alreadyEmailed.toLocaleString()}</b> already emailed (excluded). <b>{audienceLeads.length.toLocaleString()}</b> not yet emailed.<br /></> : null}
                    {cap > 0 ? <>This send: the next <b>{Math.min(audienceLeads.length, cap)}</b> of {audienceLeads.length.toLocaleString()} remaining. Run it again to continue. </> : null}
                    Unsubscribed leads and leads without an email are excluded automatically.
                  </p>
                </>
              )}
            </div>
            <div className="card pad">
              <h3 style={{ marginTop: 0 }}>Personalize each email</h3>
              <p className="muted" style={{ fontSize: 13 }}>
                Drop in a contact’s details and they fill in automatically for every person — so “Business name” becomes each contact’s real business.
              </p>
              <div className="pill-tabs mt12">
                {TOKENS.map((t) => (
                  <span key={t.token} className="chip insert" style={{ cursor: 'pointer' }} onClick={() => setForm((f) => ({ ...f, message: f.message + (f.message.endsWith('\n') || !f.message ? '' : ' ') + t.token }))}>
                    + {t.label}
                  </span>
                ))}
              </div>
              <p className="faint mt16" style={{ fontSize: 12 }}>You’ll write the message next — the live preview shows exactly what each person receives.</p>
            </div>
          </div>
        )}

        {/* Step 2: Content */}
        {step === 2 && (
          <div className="grid mt16" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="card pad">
              <h3 style={{ marginTop: 0 }}>Email settings</h3>
              <label className="field mt12"><span>Campaign name</span><input className="input" value={form.name} onChange={set('name')} /></label>
              <label className="field mt12"><span>Send from</span>
                <select className="input" value={effectiveFrom} onChange={(e) => setFromAddress(e.target.value)}>
                  {senders.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <div className="row gap12 mt12">
                <label className="field grow"><span>From name</span><input className="input" value={form.fromName} onChange={set('fromName')} placeholder="Native Harlem" /></label>
                <label className="field grow"><span>Reply-To</span><input className="input" value={form.replyTo} onChange={set('replyTo')} placeholder="support@…" /></label>
              </div>

              <div className="insert-panel mt16">
                <InsertBar onInsert={insertToken} />
                <p className="faint" style={{ fontSize: 11.5, margin: '6px 2px 0' }}>
                  Click a button to drop a contact’s detail into whichever box you’re editing. It fills in automatically for each person — watch the preview →
                </p>
              </div>

              <label className="field mt12"><span>Subject line</span>
                <input ref={subjectRef} className="input" value={form.subject} onChange={set('subject')} onFocus={() => setFocusField('subject')} />
              </label>
              <label className="field mt12"><span>Message</span>
                <textarea ref={messageRef} className="input" style={{ minHeight: 190 }} value={form.message} onChange={set('message')} onFocus={() => setFocusField('message')} placeholder="Write your email here. Press Enter for a new line." />
              </label>
              <p className="faint" style={{ fontSize: 11.5, marginTop: -2 }}>Just type normally — no code needed. A blank line starts a new paragraph.</p>

              {/* Attachments */}
              <div className="mt16">
                <div className="row between">
                  <span style={{ color: 'var(--text-dim)', fontSize: 12, fontWeight: 600 }}>Attachments</span>
                  <span className="row gap6">
                    <button type="button" className="btn ghost sm" onClick={() => setPickerOpen((o) => !o)}>
                      <Images size={14} /> Library{assetData?.assets?.length ? ` (${assetData.assets.length})` : ''}
                    </button>
                    <label className="btn ghost sm" style={{ cursor: blobReady ? 'pointer' : 'not-allowed', opacity: blobReady ? 1 : 0.5 }}>
                      <Paperclip size={14} /> Add file
                      <input type="file" multiple hidden disabled={!blobReady || upload.isPending} onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
                    </label>
                  </span>
                </div>

                {/* Asset library picker — choose an already-uploaded asset (no re-upload) */}
                {pickerOpen && (
                  <div className="card mt8" style={{ padding: 10, maxHeight: 260, overflowY: 'auto' }}>
                    {!assetData?.assets?.length ? (
                      <p className="faint" style={{ fontSize: 12, margin: 4 }}>No assets yet — upload one, or add from the Assets page.</p>
                    ) : (
                      <div className="assets-picker-grid">
                        {assetData.assets.map((a) => {
                          const added = attachments.some((x) => x.url === a.url);
                          const isImg = (a.contentType || '').startsWith('image/');
                          return (
                            <button key={a.id} type="button" className="asset-pick" disabled={added}
                              onClick={() => { addFromLibrary(a); }} title={added ? 'Already added' : `Add ${a.name}`}>
                              <span className="asset-pick-thumb">
                                {isImg ? <img src={a.url} alt="" loading="lazy" decoding="async" /> : <FileText size={22} />}
                              </span>
                              <span className="asset-pick-name">{a.name}</span>
                              {added && <span className="asset-pick-added"><Check size={12} /></span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                {!blobReady && <p className="faint mt8" style={{ fontSize: 12 }}>Uploads need Vercel Blob (<code>BLOB_READ_WRITE_TOKEN</code>). Until then, paste an image URL below to include it.</p>}
                <div className="row gap8 mt8">
                  <input className="input" style={{ fontSize: 13 }} value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addByUrl(); } }}
                    placeholder="…or paste an image URL (e.g. your flyer link)" />
                  <button className="btn ghost sm" onClick={addByUrl}>Add URL</button>
                </div>
                {upload.isPending && <p className="faint mt8" style={{ fontSize: 12 }}>Uploading…</p>}
                {uploadErr && <p className="mt8" style={{ fontSize: 12, color: 'var(--red)' }}>{uploadErr}</p>}
                {attachments.length > 0 && (
                  <div className="stack gap6 mt8">
                    {attachments.map((a) => (
                      <div key={a.url} className="row between" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px' }}>
                        <span className="row gap8" style={{ fontSize: 13, minWidth: 0 }}>
                          {a.contentType.startsWith('image/') ? <ImageIcon size={14} /> : <FileText size={14} />}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                          <span className="faint">{(a.size / 1024).toFixed(0)} KB</span>
                        </span>
                        <span className="row gap8">
                          {a.contentType.startsWith('image/') && (
                            <label className="row gap6 faint" style={{ fontSize: 11.5, cursor: 'pointer' }}>
                              <input type="checkbox" checked={a.inline} onChange={() => toggleInline(a.url)} /> show in email
                            </label>
                          )}
                          <button className="icon-btn sm" title="Remove" onClick={() => removeAttachment(a.url)}><X size={13} /></button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="card pad">
              <div className="row between"><h3 style={{ marginTop: 0 }}>Preview</h3><span className="muted" style={{ fontSize: 12 }}>as {sampleLabel}</span></div>
              <div className="card mt12" style={{ background: '#fff', color: '#111', padding: 18, borderRadius: 8 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>{fill(form.subject, sample)}</div>
                <div style={{ lineHeight: 1.5, wordBreak: 'break-word' }} dangerouslySetInnerHTML={{ __html: plainToHtml(fill(form.message, sample)) }} />
                {attachments.filter((a) => a.inline && a.contentType.startsWith('image/')).map((a) => (
                  <img key={a.url} src={a.url} alt={a.name} style={{ maxWidth: '100%', height: 'auto', display: 'block', margin: '14px 0', borderRadius: 6 }} />
                ))}
                {config?.signature?.enabled && (
                  <div style={{ marginTop: 22, paddingTop: 14, borderTop: '1px solid #e5e7eb', color: '#374151', fontSize: 13, lineHeight: 1.55 }}>
                    {config.signature.logoUrl && <div style={{ display: 'inline-block', background: '#1a1220', padding: '10px 16px', borderRadius: 10, marginBottom: 12 }}><img src={config.signature.logoUrl} alt="" style={{ maxHeight: 46, display: 'block' }} /></div>}
                    {config.signature.businessName && <div style={{ fontWeight: 700, color: '#111827', fontSize: 14 }}>{config.signature.businessName}</div>}
                    {config.signature.tagline && <div>{config.signature.tagline}</div>}
                    {config.signature.address && <div>{config.signature.address}</div>}
                    {(config.signature.phone || config.signature.website) && <div>{[config.signature.phone, config.signature.website].filter(Boolean).join(' · ')}</div>}
                    <div style={{ marginTop: 8, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      {(['instagram', 'tiktok', 'facebook', 'x'] as const).map((k) => config.signature!.socials?.[k]
                        ? <span key={k} style={{ color: '#6b7280', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <img src={`/social-${k}.png`} width={16} height={16} alt="" style={{ display: 'block' }} />
                            {k === 'tiktok' ? 'TikTok' : k === 'x' ? 'X' : k[0].toUpperCase() + k.slice(1)}
                          </span> : null)}
                    </div>
                  </div>
                )}
              </div>
              <p className="faint mt12" style={{ fontSize: 12 }}>This is the real email {sampleLabel} will receive. Everyone else gets their own details filled in.</p>
              <button className="btn ghost mt12" style={{ width: '100%' }} disabled={test.isPending} onClick={sendTest}>
                <FlaskConical size={15} /> Send a test to myself
              </button>
              {testMsg && <p className="faint mt8" style={{ fontSize: 12 }}>{testMsg}</p>}
            </div>
          </div>
        )}

        {/* Step 3: Review & Send */}
        {step === 3 && (
          <div className="grid mt16" style={{ gridTemplateColumns: '2fr 1fr' }}>
            <div className="stack gap16">
              <div className="card pad">
                <h3 style={{ marginTop: 0 }}>Delivery options</h3>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                  <div className="card pad" style={{ borderColor: 'var(--accent)' }}><div className="row gap8"><Send size={16} color="var(--accent)" /> <b>Send Now</b></div><small className="muted">Send immediately</small></div>
                  <div className="card pad" style={{ opacity: .5 }}><div className="row gap8"><Clock size={16} /> <b>Schedule</b></div><small className="muted">Pro feature</small></div>
                  <div className="card pad" style={{ opacity: .5 }}><div className="row gap8"><FlaskConical size={16} /> <b>A/B Test</b></div><small className="muted">Pro feature</small></div>
                </div>
              </div>
              {result && (
                <div className="card pad">
                  <h3 style={{ marginTop: 0 }}>{result.dryRun ? 'Preview (dry run)' : result.started ? 'Sending started' : 'Result'}</h3>
                  {result.dryRun ? (
                    <>
                      <p>DRY RUN — {result.total} recipient(s), nothing sent.</p>
                      <div className="stack gap6" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                        {(result.results || []).slice(0, 12).map((r: any, i: number) => <div key={i} className="faint">{r.status.padEnd(9)} {r.email}{r.error ? ' — ' + r.error : ''}</div>)}
                      </div>
                    </>
                  ) : (
                    <>
                      <p style={{ color: 'var(--green)' }}>✓ Sending to <b>{result.total?.toLocaleString?.() ?? result.total}</b> recipient(s).</p>
                      <p className="muted" style={{ fontSize: 13 }}>
                        {result.done
                          ? 'All sent.'
                          : `${result.sentNow ?? 0} sent so far — the rest continues in the background. You can safely close this tab; track live progress on the Campaigns page.`}
                      </p>
                    </>
                  )}
                  <button className="btn ghost mt12" onClick={() => router.push('/campaigns')}>Go to Campaigns →</button>
                </div>
              )}
            </div>
            <div className="card pad detail">
              <h3 style={{ marginTop: 0 }}>Campaign Summary</h3>
              <div className="kv"><span className="k">Recipients</span><b>{recipientCount.toLocaleString()}</b></div>
              <div className="kv"><span className="k">Campaign</span><span>{form.name}</span></div>
              <div className="kv"><span className="k">Subject</span><span style={{ maxWidth: 150, textAlign: 'right' }}>{fill(form.subject, sample)}</span></div>
              <div className="kv"><span className="k">Track Opens</span><span className="faint">soon</span></div>
              <div className="kv"><span className="k">Attachments</span><span>{attachments.length ? `${attachments.length} file(s)` : <span className="faint">none — add in Content step</span>}</span></div>
              <button className="btn ghost mt16" style={{ width: '100%' }} disabled={test.isPending} onClick={sendTest}><FlaskConical size={15} /> Send a test to myself</button>
              {testMsg && <p className="faint mt8" style={{ fontSize: 12 }}>{testMsg}</p>}
              <button className="btn ghost mt8" style={{ width: '100%' }} disabled={send.isPending} onClick={() => finalize(true)}><Eye size={15} /> Preview (dry run)</button>
              <button className="btn mt8" style={{ width: '100%' }} disabled={send.isPending || create.isPending} onClick={askAndSend}><Zap size={15} /> Send now</button>
            </div>
          </div>
        )}
      </div>

    </>
  );
}

export default function ComposePage() {
  return <Suspense fallback={<div className="page"><div className="skeleton" style={{ height: 200 }} /></div>}><ComposeInner /></Suspense>;
}
