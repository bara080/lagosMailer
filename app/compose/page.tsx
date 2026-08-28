'use client';
import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Users, Check, Zap, Send, Clock, FlaskConical, Eye } from 'lucide-react';
import Topbar from '@/components/Topbar';
import { useCreateCampaign, useLeads, useSendCampaign } from '@/lib/hooks';
import type { Lead } from '@/lib/api';

const VARS = ['{{name}}', '{{business}}', '{{category}}', '{{email}}'];
const STAGES = [
  { key: 'all', label: 'All leads' }, { key: 'new', label: 'New' }, { key: 'contacted', label: 'Contacted' },
  { key: 'replied', label: 'Replied' }, { key: 'qualified', label: 'Qualified' }, { key: 'won', label: 'Won' },
];

function render(tpl: string, l: Partial<Lead>) {
  return (tpl || '')
    .replaceAll('{{name}}', l.name || 'there').replaceAll('{{business}}', l.business || 'your business')
    .replaceAll('{{category}}', l.category || '').replaceAll('{{email}}', l.email || '');
}

function ComposeInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const ids = useMemo(() => (sp.get('ids') || '').split(',').map(Number).filter(Boolean), [sp]);

  const [step, setStep] = useState(1);
  const [stage, setStage] = useState('all');
  const [form, setForm] = useState({
    name: 'New campaign', fromName: '', replyTo: '', subject: 'Quick question about {{business}}',
    html: '<p>Hi {{name}},</p>\n<p>I came across {{business}} and think we can help.</p>\n<p>Best,<br>The lagosMailer Team</p>',
    text: 'Hi {{name}}, I came across {{business}} and think we can help. Best, The lagosMailer Team',
  });
  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });
  const [result, setResult] = useState<any>(null);

  const create = useCreateCampaign();
  const send = useSendCampaign();

  const { data: leadData } = useLeads({ stage: ids.length ? 'all' : stage });
  const recipients = useMemo(() => {
    const all = leadData?.leads ?? [];
    const base = ids.length ? all.filter((l) => ids.includes(l.id)) : all;
    return base.filter((l) => l.email && l.stage !== 'unsub');
  }, [leadData, ids, stage]);
  const sample = recipients[0] ?? { name: 'Tunde', business: 'Lagos Cuts', category: 'barber', email: 'sample@example.com' };

  const audience = ids.length ? { ids } : { stage };

  async function finalize(dryRun: boolean) {
    const camp = await create.mutateAsync({
      name: form.name, subject: form.subject, html: form.html, text: form.text,
      fromName: form.fromName, replyTo: form.replyTo, audience, status: 'draft',
    } as any);
    const out = await send.mutateAsync({ id: camp.id, dryRun });
    setResult({ ...out, name: form.name });
  }

  return (
    <>
      <Topbar title="Compose Campaign"
        actions={<>
          <button className="btn ghost" onClick={() => router.push('/campaigns')}>Save Draft</button>
          {step < 3 ? <button className="btn" onClick={() => setStep(step + 1)}>Next →</button>
            : <button className="btn" disabled={send.isPending || create.isPending} onClick={() => finalize(false)}><Send size={15} /> Send campaign</button>}
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
                <div style={{ fontSize: 34, fontWeight: 750 }}>{recipients.length.toLocaleString()}</div>
                <div className="muted">leads will receive this campaign</div>
              </div>
              {ids.length ? <p className="muted mt12">Targeting <b>{ids.length}</b> hand-picked lead(s) from the Leads page.</p> : (
                <>
                  <label className="field mt16"><span>Filter by stage</span>
                    <select className="input" value={stage} onChange={(e) => setStage(e.target.value)}>
                      {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </label>
                  <p className="faint mt12" style={{ fontSize: 12 }}>Unsubscribed leads and leads without an email are excluded automatically.</p>
                </>
              )}
            </div>
            <div className="card pad">
              <h3 style={{ marginTop: 0 }}>Personalize</h3>
              <p className="muted" style={{ fontSize: 13 }}>These variables are replaced per-recipient in the subject and body.</p>
              <div className="pill-tabs mt12">
                {VARS.map((v) => <span key={v} className="chip" style={{ cursor: 'pointer' }} onClick={() => setForm((f) => ({ ...f, html: f.html + ' ' + v }))}>{v}</span>)}
              </div>
              <p className="faint mt16" style={{ fontSize: 12 }}>Tip: click a variable to append it to the body, or type it anywhere.</p>
            </div>
          </div>
        )}

        {/* Step 2: Content */}
        {step === 2 && (
          <div className="grid mt16" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="card pad">
              <h3 style={{ marginTop: 0 }}>Email settings</h3>
              <label className="field mt12"><span>Campaign name</span><input className="input" value={form.name} onChange={set('name')} /></label>
              <div className="row gap12 mt12">
                <label className="field grow"><span>From name</span><input className="input" value={form.fromName} onChange={set('fromName')} placeholder="lagosMailer Team" /></label>
                <label className="field grow"><span>Reply-To</span><input className="input" value={form.replyTo} onChange={set('replyTo')} placeholder="support@…" /></label>
              </div>
              <label className="field mt12"><span>Subject line</span><input className="input" value={form.subject} onChange={set('subject')} /></label>
              <label className="field mt12"><span>HTML body</span><textarea className="input" style={{ minHeight: 150 }} value={form.html} onChange={set('html')} /></label>
              <label className="field mt12"><span>Plain-text fallback</span><textarea className="input" style={{ minHeight: 80 }} value={form.text} onChange={set('text')} /></label>
            </div>
            <div className="card pad">
              <div className="row between"><h3 style={{ marginTop: 0 }}>Preview</h3><span className="muted" style={{ fontSize: 12 }}>as {sample.name}</span></div>
              <div className="card mt12" style={{ background: '#fff', color: '#111', padding: 18, borderRadius: 8 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>{render(form.subject, sample)}</div>
                <div dangerouslySetInnerHTML={{ __html: render(form.html, sample) }} />
              </div>
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
                  <h3 style={{ marginTop: 0 }}>Result</h3>
                  <p>{result.dryRun ? `DRY RUN — ${result.total} recipient(s), nothing sent.` : `Sent ${result.sent}/${result.total}.`}</p>
                  <div className="stack gap6" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {result.results.slice(0, 12).map((r: any, i: number) => <div key={i} className="faint">{r.status.padEnd(9)} {r.email}{r.error ? ' — ' + r.error : ''}</div>)}
                  </div>
                  <button className="btn ghost mt12" onClick={() => router.push('/campaigns')}>Go to Campaigns →</button>
                </div>
              )}
            </div>
            <div className="card pad detail">
              <h3 style={{ marginTop: 0 }}>Campaign Summary</h3>
              <div className="kv"><span className="k">Recipients</span><b>{recipients.length.toLocaleString()}</b></div>
              <div className="kv"><span className="k">Campaign</span><span>{form.name}</span></div>
              <div className="kv"><span className="k">Subject</span><span style={{ maxWidth: 150, textAlign: 'right' }}>{render(form.subject, sample)}</span></div>
              <div className="kv"><span className="k">Track Opens</span><span className="faint">soon</span></div>
              <button className="btn ghost mt16" style={{ width: '100%' }} disabled={send.isPending} onClick={() => finalize(true)}><Eye size={15} /> Preview (dry run)</button>
              <button className="btn mt8" style={{ width: '100%' }} disabled={send.isPending || create.isPending} onClick={() => finalize(false)}><Zap size={15} /> Send now</button>
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
