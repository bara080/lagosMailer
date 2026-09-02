'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Rocket, Pause, Play, StopCircle, RotateCcw, Layers, Check, AlertCircle, X, Folder, FilePlus2, Users, UserCheck, CalendarClock } from 'lucide-react';
import Topbar from '@/components/Topbar';
import { StatusBadge, EmptyState, Modal, Stepper } from '@/components/ui';
import { useConfig, useEngineCampaigns, useEngineRuns, useRunDetail, useCreateEngineCampaign, useCreateRun, useControlRun, useAudiencePreview, useEngineQuota, useRunRecipients } from '@/lib/hooks';
import type { RunStage, EngineEvent } from '@/lib/api';

// Minimal plain-text → HTML (blank line = paragraph). The engine stores both.
const toHtml = (t: string) => (t || '').trim()
  .split(/\n{2,}/).map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`).join('\n');

// Wizard audience options (card picker) → engine audienceMode.
const AUDIENCE_OPTS = [
  { key: 'all', title: 'All eligible leads', sub: 'Everyone matching, minus suppressed.', mode: 'all', icon: Users },
  { key: 'remaining', title: 'Remaining leads', sub: 'Exclude previous successful recipients.', mode: 'remaining', icon: UserCheck },
  { key: 'failed_only', title: 'Retry failed only', sub: 'Use failures from a selected prior run.', mode: 'failed_only', icon: RotateCcw },
  { key: 'custom', title: 'Custom emails (test)', sub: 'Send only to addresses you type.', mode: 'explicit', icon: FilePlus2 },
];
const DEFAULT_STAGES = [
  { label: 'Test', limit: '1', hint: 'Confirm content and delivery' },
  { label: 'Canary', limit: '200', hint: 'Validate early performance' },
  { label: 'Ramp', limit: '1000', hint: 'Increase controlled volume' },
  { label: 'Full remainder', limit: '', hint: 'Continue across quota windows' },
];

// Selectable option card (wizard steps 1 & 2).
function PickCard({ sel, icon: Icon, title, sub, onClick }: { sel: boolean; icon: any; title: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" className={`pick-card ${sel ? 'sel' : ''}`} onClick={onClick}>
      <span className="pick-ic"><Icon size={18} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="pick-title" style={{ display: 'block' }}>{title}</span>
        <span className="pick-sub">{sub}</span>
      </span>
      {sel && <Check size={16} color="var(--accent)" />}
    </button>
  );
}

// Segmented progress: accepted (green) · failed (red) · suppressed (amber) of total.
function ProgressBar({ total, accepted, failed, suppressed }: { total: number; accepted: number; failed: number; suppressed: number }) {
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  return (
    <div className="progress-track">
      <span className="seg-green" style={{ width: `${pct(accepted)}%` }} />
      <span className="seg-red" style={{ width: `${pct(failed)}%` }} />
      <span className="seg-amber" style={{ width: `${pct(suppressed)}%` }} />
    </div>
  );
}

export default function RunsPage() {
  const { data: config } = useConfig();
  const { data: campData, isLoading } = useEngineCampaigns();
  const campaigns = campData?.campaigns ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const activeCampaign = selected || campaigns[0]?.id || null;
  const { data: runData } = useEngineRuns(activeCampaign);
  const runs = runData?.runs ?? [];

  const [openRun, setOpenRun] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showLaunch, setShowLaunch] = useState(false);
  const { data: quota } = useEngineQuota();
  const quotaLimit = quota?.limit ?? config?.dailyCap ?? 1900;
  const quotaPct = Math.min(100, Math.round(((quota?.accepted ?? 0) / Math.max(1, quotaLimit)) * 100));

  return (
    <>
      <Topbar title="Campaign Runs" subtitle="Independent send jobs — launch, watch, and control each run"
        actions={<>
          <div className="row gap8" style={{ marginRight: 6 }}>
            <span className="faint" style={{ fontSize: 12 }}>Daily quota</span>
            <b style={{ fontSize: 13 }}>{(quota?.accepted ?? 0).toLocaleString()} / {quotaLimit.toLocaleString()}</b>
            <span className="bar green" style={{ width: 120, height: 6, display: 'inline-block' }}><span style={{ width: `${quotaPct}%` }} /></span>
          </div>
          <button className="btn" onClick={() => setShowNew(true)}><Plus size={15} /> New campaign</button>
        </>} />
      {openRun ? (
        <div className="page">
          <button className="btn ghost sm" onClick={() => setOpenRun(null)}>← All runs</button>
          <div className="mt12"><RunMonitor runId={openRun} campaignName={campaigns.find((c) => c.id === activeCampaign)?.name || 'Run'} /></div>
        </div>
      ) : (
      <div className="page grid" style={{ gridTemplateColumns: '280px 1fr', gap: 16 }}>
        {/* Campaigns */}
        <div className="card pad" style={{ alignSelf: 'start' }}>
          <div className="row between"><h3 style={{ margin: 0 }}>Campaigns</h3><span className="faint" style={{ fontSize: 12 }}>{campaigns.length}</span></div>
          <div className="stack gap6 mt12">
            {isLoading ? <span className="faint">Loading…</span> :
              campaigns.length === 0 ? <p className="faint" style={{ fontSize: 13 }}>No campaigns yet — create one to launch runs.</p> :
              campaigns.map((c) => (
                <button key={c.id} className={`pick-card ${activeCampaign === c.id ? 'sel' : ''}`} style={{ padding: '10px 12px' }} onClick={() => { setSelected(c.id); setOpenRun(null); }}>
                  <span className="pick-ic" style={{ width: 30, height: 30 }}><Layers size={14} /></span>
                  <span className="pick-title" style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>{c.name}</span>
                  {activeCampaign === c.id && <Check size={15} color="var(--accent)" />}
                </button>
              ))}
          </div>
        </div>

        {/* Runs of the selected campaign */}
        <div className="stack gap16">
          <div className="card pad">
            <div className="row between">
              <h3 style={{ margin: 0 }}>{campaigns.find((c) => c.id === activeCampaign)?.name || 'Runs'}</h3>
              <button className="btn" onClick={() => setShowLaunch(true)}><Rocket size={15} /> Launch run</button>
            </div>
            {!activeCampaign ? <EmptyState title="Select a campaign" hint="Pick a campaign on the left, or create one." /> :
              runs.length === 0 ? <p className="faint mt12" style={{ fontSize: 13 }}>No runs yet. Launch one to start sending.</p> : (
              <div className="stack gap10 mt12">
                {runs.map((r) => {
                  const pr = r.progress || { total: r.audience_count, accepted: 0, failed: 0, pending: r.audience_count, suppressed: 0 };
                  const total = pr.total || r.audience_count || 0;
                  const doneN = pr.accepted + pr.failed + pr.suppressed;
                  const pct = total ? Math.round((doneN / total) * 100) : 0;
                  return (
                    <div key={r.id} className="card pad run-card" onClick={() => setOpenRun(r.id)}>
                      <div className="row between">
                        <div className="row gap10" style={{ minWidth: 0 }}>
                          <StatusBadge status={r.status} />
                          <div style={{ minWidth: 0 }}>
                            <b>{total.toLocaleString()} recipients</b>
                            <small className="faint" style={{ display: 'block' }}>{r.audience_mode} · {r.started_at ? new Date(r.started_at).toLocaleString() : 'not started'}</small>
                          </div>
                        </div>
                        <div className="row gap12" style={{ flexShrink: 0 }}>
                          <span className="run-stat g"><Check size={12} /> {pr.accepted.toLocaleString()}</span>
                          {pr.failed > 0 && <span className="run-stat r"><AlertCircle size={12} /> {pr.failed.toLocaleString()}</span>}
                          <span className="run-stat">{pr.pending.toLocaleString()} left</span>
                          <button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); setOpenRun(r.id); }}>Open</button>
                        </div>
                      </div>
                      <div className="mt12"><ProgressBar total={total} accepted={pr.accepted} failed={pr.failed} suppressed={pr.suppressed} /></div>
                      <div className="row between mt6" style={{ fontSize: 12 }}>
                        <span className="faint">{pct}% processed</span>
                        <span className="faint">{doneN.toLocaleString()} / {total.toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {showNew && <NewCampaignModal senders={config?.senders ?? []} defaultProvider={config?.emailProvider ?? 'smtp'} onClose={() => setShowNew(false)} />}
      {showLaunch && <LaunchWizard campaignId={activeCampaign} companyName={config?.company || ''} onClose={() => setShowLaunch(false)} onLaunched={(runId) => { setShowLaunch(false); setSelected(null); setOpenRun(runId); }} />}
    </>
  );
}

// ── New campaign (content + sender + provider) ───────────────────────────────
function NewCampaignModal({ senders, defaultProvider, onClose }: { senders: string[]; defaultProvider: string; onClose: () => void }) {
  const create = useCreateEngineCampaign();
  const [f, setF] = useState({ name: 'New campaign', senderKey: senders[0] || '', provider: defaultProvider, subject: '', message: '', replyTo: '' });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  async function submit() {
    await create.mutateAsync({ name: f.name, subject: f.subject, html: toHtml(f.message), text: f.message, senderKey: f.senderKey, providerKey: f.provider, replyTo: f.replyTo });
    onClose();
  }
  // Live preview with sample personalization (engine uses {{name}} tokens).
  const sample = { name: 'Alex', business: 'Acme Co', category: '' };
  const fillSample = (s: string) => (s || '')
    .replace(/\{\{name\}\}/g, sample.name).replace(/\{\{business\}\}/g, sample.business)
    .replace(/\{\{category\}\}/g, sample.category).replace(/\{\{email\}\}/g, 'you@example.com');

  return (
    <Modal title="New campaign" width={860} onClose={onClose}
      footer={<>
        {create.isError && <span style={{ color: 'var(--red)', fontSize: 12, marginRight: 'auto' }}>{(create.error as any)?.message}</span>}
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={create.isPending || !f.subject} onClick={submit}>Create campaign</button>
      </>}>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Form */}
        <div>
          <label className="field"><span>Campaign name</span><input className="input" value={f.name} onChange={set('name')} /></label>
          <div className="row gap12 mt12">
            <label className="field grow"><span>Send from</span>
              <select className="input" value={f.senderKey} onChange={set('senderKey')}>{senders.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            </label>
            <label className="field grow"><span>Provider</span>
              <select className="input" value={f.provider} onChange={set('provider')}><option value="smtp">Gmail (SMTP)</option><option value="resend">Resend</option></select>
            </label>
          </div>
          <label className="field mt12"><span>Subject</span><input className="input" value={f.subject} onChange={set('subject')} placeholder="Use {{name}} / {{business}} to personalize" /></label>
          <label className="field mt12"><span>Message</span><textarea className="input" style={{ minHeight: 170 }} value={f.message} onChange={set('message')} placeholder="Write your email. Blank line = new paragraph." /></label>
          <label className="field mt12"><span>Reply-To <small className="faint">(optional)</small></span><input className="input" value={f.replyTo} onChange={set('replyTo')} /></label>
        </div>
        {/* Live preview */}
        <div>
          <div className="row between"><span className="faint" style={{ fontSize: 12, fontWeight: 600 }}>Preview</span><span className="faint" style={{ fontSize: 11 }}>as {sample.name} · {sample.business}</span></div>
          <div className="mt8" style={{ background: '#fff', color: '#111', borderRadius: 10, padding: 18, minHeight: 300 }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>From: <b>{f.senderKey || '—'}</b> · via {f.provider === 'resend' ? 'Resend' : 'Gmail'}</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>{fillSample(f.subject) || <span style={{ color: '#999', fontWeight: 400 }}>(no subject)</span>}</div>
            <div style={{ lineHeight: 1.55, fontSize: 14, wordBreak: 'break-word' }} dangerouslySetInnerHTML={{ __html: toHtml(fillSample(f.message)) || '<i style="color:#999">Your message preview appears here…</i>' }} />
          </div>
          <p className="faint mt8" style={{ fontSize: 11.5 }}>This is what each recipient sees, with their own details filled in. An unsubscribe footer is added automatically.</p>
        </div>
      </div>
    </Modal>
  );
}

// ── Launch wizard: Campaign → Audience → Cadence → Delivery → Review ─────────
const WIZARD_STEPS = ['Campaign', 'Audience', 'Cadence', 'Delivery', 'Review'];

function LaunchWizard({ campaignId: initialCampaignId, companyName, onClose, onLaunched }: {
  campaignId: string | null; companyName: string; onClose: () => void; onLaunched: (runId: string) => void;
}) {
  const { data: config } = useConfig();
  const { data: campData } = useEngineCampaigns();
  const campaigns = campData?.campaigns ?? [];
  const createCampaign = useCreateEngineCampaign();
  const createRun = useCreateRun();
  const senders = config?.senders ?? [];
  const dailyCap = config?.dailyCap ?? 1900;

  const [step, setStep] = useState(0);
  const [source, setSource] = useState<'existing' | 'fresh'>(initialCampaignId || campaigns.length ? 'existing' : 'fresh');
  const [campaignId, setCampaignId] = useState<string | null>(initialCampaignId);
  const [fresh, setFresh] = useState({ name: 'New campaign', senderKey: senders[0] || '', provider: config?.emailProvider || 'smtp', subject: '', message: '', replyTo: '' });
  const fset = (k: string) => (e: any) => setFresh((f) => ({ ...f, [k]: e.target.value }));

  const [audienceKey, setAudienceKey] = useState('all');
  const [customEmails, setCustomEmails] = useState('');
  const customList = useMemo(() => customEmails.split(/[\s,;]+/).map((s) => s.trim()).filter((e) => /^\S+@\S+\.\S+$/.test(e)), [customEmails]);
  // Reveal + focus the custom-address box when "Custom emails" is picked so it's
  // never hidden below the fold.
  const customRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (audienceKey === 'custom') { customRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); customRef.current?.focus(); } }, [audienceKey]);

  const [cadenceOn, setCadenceOn] = useState(false);
  const [gateStages, setGateStages] = useState(true);
  const [stages, setStages] = useState(DEFAULT_STAGES);
  const setStageLimit = (i: number, v: string) => setStages((s) => s.map((x, j) => (j === i ? { ...x, limit: v } : x)));

  const [chunk, setChunk] = useState('50');
  const [reviewed, setReviewed] = useState(false);

  const audOpt = AUDIENCE_OPTS.find((a) => a.key === audienceKey)!;
  const previewFilter = useMemo(() => (audienceKey === 'remaining' ? { skipEmailed: true, emailOnly: true } : { emailOnly: true }), [audienceKey]);
  const { data: aud } = useAudiencePreview(previewFilter, audienceKey === 'all' || audienceKey === 'remaining');
  const estimate = audienceKey === 'custom' ? customList.length
    : audienceKey === 'remaining' ? (aud?.remaining ?? 0)
    : audienceKey === 'all' ? (aud?.emailable ?? 0) : 0;
  const stagePlan = cadenceOn ? stages.map((s, i) => ({ label: s.label, limit: s.limit ? Number(s.limit) : null, gate: gateStages && i > 0 ? 'manual' : 'none' })) : [];
  const days = estimate > 0 ? Math.max(1, Math.ceil(estimate / dailyCap)) : 0;
  const providerLabel = (source === 'fresh' ? fresh.provider : config?.emailProvider) === 'resend' ? 'Resend' : 'Gmail';
  const campaignName = source === 'fresh' ? `${fresh.name} · new` : (campaigns.find((c) => c.id === campaignId)?.name || '—');

  async function launch() {
    let cid = campaignId;
    if (source === 'fresh') {
      const res = await createCampaign.mutateAsync({ name: fresh.name, subject: fresh.subject, html: toHtml(fresh.message), text: fresh.message, senderKey: fresh.senderKey, providerKey: fresh.provider, replyTo: fresh.replyTo });
      cid = res.campaign.id;
    }
    if (!cid) return;
    const filter: any = {};
    if (audienceKey === 'custom') filter.emails = customList;
    const res = await createRun.mutateAsync({ campaignId: cid, body: { audienceMode: audOpt.mode, audienceFilter: filter, stagePlan, dispatchChunkSize: Number(chunk) || 50 } });
    onLaunched(res.run.id);
  }

  const canNext = step === 0 ? (source === 'existing' ? !!campaignId : !!fresh.subject)
    : step === 1 ? (audienceKey !== 'custom' || customList.length > 0) : true;
  const isLast = step === WIZARD_STEPS.length - 1;
  const busy = createRun.isPending || createCampaign.isPending;

  const summary: [string, string][] = [
    ['Campaign', campaignName],
    ['Audience', estimate ? `${estimate.toLocaleString()} estimated` : audienceKey === 'failed_only' ? 'prior failures' : '—'],
    ['Duplicates', 'Excluded within run'],
    ['Cadence', cadenceOn ? `${stages.length} stages` : 'Single stage'],
    ['Provider', providerLabel],
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 920, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <div><h3 className="modal-title" style={{ margin: 0 }}>Launch a new run</h3><small className="faint">{companyName}</small></div>
          <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={onClose}><X size={15} /></button>
        </div>
        <div className="mt16"><Stepper steps={WIZARD_STEPS} current={step} /></div>

        <div className="grid" style={{ gridTemplateColumns: '1fr 300px', minHeight: 0, flex: 1, borderTop: '1px solid var(--border)', marginTop: 6 }}>
          {/* Step content */}
          <div style={{ padding: '18px 22px 8px 0', overflowY: 'auto' }}>
            {step === 0 && (<>
              <h4 style={{ margin: '0 0 4px' }}>What are you launching?</h4>
              <p className="faint" style={{ fontSize: 13, marginTop: 0 }}>A campaign stores the content; a run executes it.</p>
              <div className="stack gap10 mt12">
                <PickCard sel={source === 'existing'} icon={Folder} title="Use an existing campaign" sub="Launch a new run from saved content." onClick={() => setSource('existing')} />
                <PickCard sel={source === 'fresh'} icon={FilePlus2} title="Create a fresh campaign" sub="Compose the email, save it, then launch." onClick={() => setSource('fresh')} />
              </div>
              {source === 'existing' ? (
                <label className="field mt16"><span>Campaign</span>
                  <select className="input" value={campaignId || ''} onChange={(e) => setCampaignId(e.target.value)}>
                    <option value="" disabled>Select a campaign…</option>
                    {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              ) : (<>
                <div className="row gap12 mt16">
                  <label className="field grow"><span>Name</span><input className="input" value={fresh.name} onChange={fset('name')} /></label>
                  <label className="field grow"><span>Provider</span><select className="input" value={fresh.provider} onChange={fset('provider')}><option value="smtp">Gmail (SMTP)</option><option value="resend">Resend</option></select></label>
                </div>
                <label className="field mt12"><span>Send from</span><select className="input" value={fresh.senderKey} onChange={fset('senderKey')}>{senders.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
                <label className="field mt12"><span>Subject</span><input className="input" value={fresh.subject} onChange={fset('subject')} placeholder="Use {{name}} / {{business}}" /></label>
                <label className="field mt12"><span>Message</span><textarea className="input" style={{ minHeight: 110 }} value={fresh.message} onChange={fset('message')} placeholder="Write your email…" /></label>
              </>)}
            </>)}

            {step === 1 && (<>
              <h4 style={{ margin: '0 0 4px' }}>Select the audience</h4>
              <p className="faint" style={{ fontSize: 13, marginTop: 0 }}>The final recipients are snapshotted when the run starts.</p>
              <div className="stack gap10 mt12">
                {AUDIENCE_OPTS.map((a) => <PickCard key={a.key} sel={audienceKey === a.key} icon={a.icon} title={a.title} sub={a.key === 'all' && aud ? `${(aud.emailable ?? 0).toLocaleString()} estimated` : a.sub} onClick={() => setAudienceKey(a.key)} />)}
              </div>
              {audienceKey === 'custom' && (
                <label className="field mt12"><span>Test addresses <small className="faint">({customList.length} valid)</small></span>
                  <textarea ref={customRef} className="input" style={{ minHeight: 72, borderColor: customList.length ? undefined : 'var(--accent)' }} value={customEmails} onChange={(e) => setCustomEmails(e.target.value)} placeholder="you@example.com, teammate@example.com" />
                  {!customList.length && <small className="faint" style={{ display: 'block', marginTop: 6 }}>Enter at least one address to continue.</small>}
                </label>
              )}
            </>)}

            {step === 2 && (<>
              <h4 style={{ margin: '0 0 4px' }}>Set the cadence</h4>
              <p className="faint" style={{ fontSize: 13, marginTop: 0 }}>Start small, then increase the audience safely.</p>
              <label className="row gap8 mt8" style={{ fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={cadenceOn} onChange={(e) => setCadenceOn(e.target.checked)} />
                <span>Staged rollout <b className="faint">(Test → Canary → Ramp → remainder)</b></span>
              </label>
              {cadenceOn ? (<>
                <div className="stack gap10 mt12">
                  {stages.map((s, i) => (
                    <div key={s.label} className="card pad" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span className="pick-ic" style={{ width: 34, height: 34, fontWeight: 700 }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}><b>{s.label}</b><small className="faint" style={{ display: 'block' }}>{s.hint}</small></div>
                      {i < stages.length - 1
                        ? <input className="input" style={{ width: 130 }} type="number" min={1} value={s.limit} onChange={(e) => setStageLimit(i, e.target.value)} />
                        : <span className="faint" style={{ fontSize: 12 }}>All remaining</span>}
                    </div>
                  ))}
                </div>
                <label className="row gap8 mt12" style={{ fontSize: 13, cursor: 'pointer', alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={gateStages} onChange={(e) => setGateStages(e.target.checked)} style={{ marginTop: 2 }} />
                  <span>Gate each stage <b className="faint">— pause after Test/Canary/Ramp so you can review before ramping up (approve to continue)</b></span>
                </label>
              </>) : <p className="faint mt12" style={{ fontSize: 12 }}>Off = send the whole audience in one stage (paced by chunk size + daily cap).</p>}
            </>)}

            {step === 3 && (<>
              <h4 style={{ margin: '0 0 4px' }}>Delivery settings</h4>
              <p className="faint" style={{ fontSize: 13, marginTop: 0 }}>{source === 'fresh' ? 'Sender, provider and start are frozen for this run.' : 'This run uses the campaign’s saved sender & provider.'}</p>
              <div className="row gap12 mt12">
                <label className="field grow"><span>Send from</span>
                  {source === 'fresh'
                    ? <select className="input" value={fresh.senderKey} onChange={fset('senderKey')}>{senders.map((s) => <option key={s} value={s}>{s}</option>)}</select>
                    : <input className="input" value="Saved on campaign" disabled />}
                </label>
                <label className="field grow"><span>Provider</span>
                  {source === 'fresh'
                    ? <select className="input" value={fresh.provider} onChange={fset('provider')}><option value="smtp">Gmail (SMTP)</option><option value="resend">Resend</option></select>
                    : <input className="input" value={providerLabel} disabled />}
                </label>
              </div>
              <div className="row gap12 mt12">
                <label className="field grow"><span>Start</span><select className="input" disabled><option>Launch now</option></select></label>
                <label className="field grow"><span>Daily cap</span><input className="input" value={dailyCap} disabled /></label>
              </div>
              <label className="field mt12"><span>Chunk size <small className="faint">(recipients per batch)</small></span><input className="input" type="number" min={1} style={{ width: 150 }} value={chunk} onChange={(e) => setChunk(e.target.value)} /></label>
            </>)}

            {step === 4 && (<>
              <h4 style={{ margin: '0 0 4px' }}>Review and launch</h4>
              <p className="faint" style={{ fontSize: 13, marginTop: 0 }}>This creates a new run; it does not modify the campaign.</p>
              <div className="card mt12" style={{ padding: 0, overflow: 'hidden' }}>
                {[
                  ['Campaign', campaignName],
                  ['Audience', `${audOpt.title}${estimate ? ` · ${estimate.toLocaleString()} est.` : ''}`],
                  ['Cadence', cadenceOn ? stages.map((s, i) => (i < stages.length - 1 ? s.limit : 'remainder')).join(' → ') : 'Single stage'],
                  ['Delivery', providerLabel],
                  ['Est. finish', days ? `${days} quota day(s)` : '—'],
                ].map(([k, v]) => (
                  <div key={k} className="row between" style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)' }}>
                    <span className="faint" style={{ fontSize: 13 }}>{k}</span><b style={{ fontSize: 13 }}>{v}</b>
                  </div>
                ))}
              </div>
              <label className="row gap8 mt12" style={{ fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
                <span>I reviewed the audience, sender, cadence and duplicate policy.</span>
              </label>
              {createRun.isError && <p className="mt8" style={{ color: 'var(--red)', fontSize: 12 }}>{(createRun.error as any)?.message}</p>}
            </>)}
          </div>

          {/* Run summary */}
          <aside style={{ borderLeft: '1px solid var(--border)', padding: '18px 2px 8px 20px', overflowY: 'auto' }}>
            <h4 style={{ margin: '0 0 4px' }}>Run summary</h4>
            {summary.map(([k, v]) => (
              <div key={k} className="mt12"><div className="faint" style={{ fontSize: 12 }}>{k}</div><div style={{ fontWeight: 600 }}>{v}</div></div>
            ))}
            <div className="wizard-note mt16" style={{ background: 'var(--amber-soft)' }}>
              <CalendarClock size={15} color="var(--amber)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div><b style={{ color: 'var(--amber)' }}>Quota forecast</b><div className="faint" style={{ marginTop: 2 }}>{days ? `At ${dailyCap.toLocaleString()}/day, ~${days} day(s) to finish.` : `At ${dailyCap.toLocaleString()}/day.`}</div></div>
            </div>
          </aside>
        </div>

        <div className="row between" style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
          <span className="faint" style={{ fontSize: 12.5 }}>Step {step + 1} of {WIZARD_STEPS.length}</span>
          <span className="row gap8">
            <button className="btn ghost" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>Back</button>
            {isLast
              ? <button className="btn" disabled={!reviewed || busy} onClick={launch}><Rocket size={15} /> Launch run</button>
              : <button className="btn" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue →</button>}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Run monitor (full page): progress + tiles + cadence + tabs ───────────────
const STAGE_TONE: Record<string, string> = { complete: 'var(--green)', running: 'var(--accent)', ready: 'var(--accent)', waiting: 'var(--amber)' };
const STAGE_LABEL: Record<string, string> = { complete: 'Complete', running: 'Running', ready: 'Ready', waiting: 'Waiting' };

function StageCard({ s }: { s: RunStage }) {
  const done = s.accepted + s.failed + s.suppressed;
  const pct = s.total ? Math.round((done / s.total) * 100) : 0;
  const tone = STAGE_TONE[s.status];
  return (
    <div className="card pad" style={{ flex: 1, minWidth: 200, borderLeft: `3px solid ${s.status === 'waiting' ? 'var(--border-2)' : tone}` }}>
      <div className="row between"><span className="faint" style={{ fontSize: 12 }}>Stage {s.stage}</span><span className="run-stat" style={{ color: tone }}>● {STAGE_LABEL[s.status]}</span></div>
      <b style={{ display: 'block', marginTop: 6 }}>{s.label}</b>
      <small className="faint">{s.total.toLocaleString()} recipients</small>
      <div className="row between mt10" style={{ fontSize: 12 }}>
        {s.status === 'waiting'
          ? <span className="faint">Starts after current stage</span>
          : <><span className="run-stat g">{s.accepted.toLocaleString()} accepted</span>{s.failed > 0 ? <span className="run-stat r">{s.failed} failed</span> : <span />}<span className="faint">{pct}%</span></>}
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="card pad" style={{ minWidth: 0 }}>
      <div className="faint" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: tone }}>{value.toLocaleString()}</div>
    </div>
  );
}

function prettyEvent(t: string) {
  return ({ 'run.created': 'Run created', 'audience.snapshotted': 'Audience snapshotted', 'run.started': 'Run started', 'batch.sent': 'Batch sent', 'stage.completed': 'Stage completed', 'stage.started': 'Stage started', 'stage.gated': 'Stage gate — paused', 'quota.waiting': 'Waiting on daily quota', 'run.completed': 'Run completed', 'run.paused': 'Run paused', 'run.resume': 'Run resumed', 'run.stop': 'Run stopped', 'email.delivered': 'Delivered', 'email.bounced': 'Bounced (suppressed)', 'email.complained': 'Complaint (suppressed)' } as Record<string, string>)[t] || t;
}
function eventDetail(ev: EngineEvent) {
  const d = ev.data || {};
  if (ev.event_type === 'audience.snapshotted') return `${(d.count ?? 0).toLocaleString()} unique recipients.`;
  if (ev.event_type === 'batch.sent') return `${d.accepted ?? 0} accepted of ${d.attempted ?? 0} attempted.`;
  if (ev.event_type === 'stage.completed') return `Stage ${d.stage} done.`;
  if (ev.event_type === 'stage.started') return `Stage ${d.stage} started.`;
  if (ev.event_type === 'stage.gated') return `Stage ${d.completed} complete — awaiting approval.`;
  if (ev.event_type === 'quota.waiting') return 'Daily cap reached — waiting for reset.';
  if (ev.event_type?.startsWith('email.')) return d.email || '';
  return Object.keys(d).length ? JSON.stringify(d) : '';
}

function RunMonitor({ runId, campaignName }: { runId: string; campaignName: string }) {
  const { data } = useRunDetail(runId);
  const control = useControlRun();
  const createRun = useCreateRun();
  const [tab, setTab] = useState<'activity' | 'recipients' | 'settings'>('activity');
  const [rpage, setRpage] = useState(1);
  const { data: recs } = useRunRecipients(tab === 'recipients' ? runId : null, { page: rpage, limit: 50 });

  const run = data?.run;
  const p = data?.progress;
  const stages = data?.stages ?? [];
  const status = run?.status || '';
  const total = p?.total ?? 0;
  const accepted = p?.accepted ?? 0;
  const pct = total ? Math.round((accepted / total) * 1000) / 10 : 0;

  return (
    <div className="card pad">
      {/* Header */}
      <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div className="row gap8"><h3 style={{ margin: 0 }}>{campaignName}</h3> <StatusBadge status={status} /></div>
          <small className="faint">RUN-{runId.slice(0, 8)} · {run?.audience_mode} · {run?.dispatch_chunk_size}/batch</small>
        </div>
        <div className="row gap8">
          {status === 'gated' && <button className="btn sm" onClick={() => control.mutate({ runId, action: 'continue' })}><Play size={14} /> Continue to next stage</button>}
          {status === 'running' && <button className="btn ghost sm" onClick={() => control.mutate({ runId, action: 'pause' })}><Pause size={14} /> Pause</button>}
          {status === 'paused' && <button className="btn sm" onClick={() => control.mutate({ runId, action: 'resume' })}><Play size={14} /> Resume</button>}
          {(status === 'running' || status === 'paused' || status === 'gated') && <button className="btn ghost sm" onClick={() => control.mutate({ runId, action: 'stop' })}><StopCircle size={14} /> Stop</button>}
          {(p?.failed ?? 0) > 0 && <button className="btn ghost sm" disabled={createRun.isPending} onClick={() => createRun.mutate({ campaignId: run!.campaign_id, body: { audienceMode: 'failed_only', sourceRunId: runId } })}><RotateCcw size={14} /> Retry {p!.failed}</button>}
        </div>
      </div>

      {status === 'gated' && (
        <div className="wizard-note mt16" style={{ background: 'var(--amber-soft)' }}>
          <CalendarClock size={15} color="var(--amber)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div><b style={{ color: 'var(--amber)' }}>Paused at stage gate</b><div className="faint" style={{ marginTop: 2 }}>Stage {run?.current_stage} complete — review the results below, then <b>Continue</b> to release the next stage.</div></div>
        </div>
      )}

      {/* Big progress */}
      <div className="row between" style={{ alignItems: 'baseline', marginTop: 20 }}>
        <h2 style={{ margin: 0, fontSize: 28 }}>{pct}% complete</h2>
        <span className="faint" style={{ fontSize: 13 }}>{accepted.toLocaleString()} accepted of {total.toLocaleString()} recipients</span>
      </div>
      <div className="progress-track mt8" style={{ height: 10 }}>
        <span className="seg-green" style={{ width: `${total ? (accepted / total) * 100 : 0}%` }} />
        <span className="seg-red" style={{ width: `${total ? ((p?.failed ?? 0) / total) * 100 : 0}%` }} />
      </div>

      {/* Tiles */}
      <div className="grid mt16" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <Tile label="Accepted" value={accepted} tone="var(--green)" />
        <Tile label="Delivered" value={p?.delivered ?? 0} />
        <Tile label="Pending" value={p?.pending ?? 0} />
        <Tile label="Failed" value={(p?.failed ?? 0) + (p?.bounced ?? 0)} tone={((p?.failed ?? 0) + (p?.bounced ?? 0)) ? 'var(--red)' : undefined} />
        <Tile label="Suppressed" value={p?.suppressed ?? 0} />
      </div>

      {/* Cadence */}
      {stages.length > 1 && (<>
        <h4 style={{ margin: '22px 0 10px' }}>Cadence</h4>
        <div className="row gap12" style={{ alignItems: 'stretch', flexWrap: 'wrap' }}>
          {stages.map((s) => <StageCard key={s.stage} s={s} />)}
        </div>
      </>)}

      {/* Tabs */}
      <div className="tabs mt22" style={{ borderBottom: '1px solid var(--border)' }}>
        {(['activity', 'recipients', 'settings'] as const).map((t) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t === 'activity' ? 'Activity' : t === 'recipients' ? 'Recipients' : 'Run settings'}</button>
        ))}
      </div>

      {tab === 'activity' && (
        <div className="mt12">
          {(data?.events ?? []).map((ev) => (
            <div key={ev.id} className="row gap12" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="faint" style={{ fontSize: 12, minWidth: 130 }}>{new Date(ev.created_at).toLocaleTimeString()}</span>
              <span style={{ width: 8, height: 8, borderRadius: 8, background: 'var(--accent)', marginTop: 5, flexShrink: 0 }} />
              <div><b style={{ fontSize: 13 }}>{prettyEvent(ev.event_type)}</b>{eventDetail(ev) ? <div className="faint" style={{ fontSize: 12 }}>{eventDetail(ev)}</div> : null}</div>
            </div>
          ))}
          {!data?.events?.length && <span className="faint" style={{ fontSize: 12 }}>No activity yet.</span>}
        </div>
      )}

      {tab === 'recipients' && (
        <div className="mt12" style={{ overflowX: 'auto' }}>
          <table className="tbl"><thead><tr><th>Email</th><th>Stage</th><th>Status</th><th>Attempts</th></tr></thead>
            <tbody>{(recs?.recipients ?? []).map((r) => (
              <tr key={r.id}><td className="muted">{r.normalized_email}</td><td className="faint">{r.stage_number}</td><td><StatusBadge status={r.status} /></td><td className="faint">{r.attempt_count}</td></tr>
            ))}</tbody></table>
          {(recs?.total ?? 0) > 50 && (
            <div className="row between mt12"><span className="faint" style={{ fontSize: 12 }}>{(recs?.total ?? 0).toLocaleString()} total</span>
              <span className="row gap8"><button className="btn ghost sm" disabled={rpage <= 1} onClick={() => setRpage(rpage - 1)}>← Prev</button><span className="faint" style={{ fontSize: 12 }}>Page {rpage}</span><button className="btn ghost sm" disabled={rpage * 50 >= (recs?.total ?? 0)} onClick={() => setRpage(rpage + 1)}>Next →</button></span></div>
          )}
        </div>
      )}

      {tab === 'settings' && run && (
        <div className="card mt12" style={{ padding: 0, overflow: 'hidden' }}>
          {[
            ['Audience mode', run.audience_mode],
            ['Duplicate policy', run.duplicate_policy],
            ['Chunk size', String(run.dispatch_chunk_size)],
            ['Stages', String(stages.length)],
            ['Created', new Date(run.created_at).toLocaleString()],
            ['Started', run.started_at ? new Date(run.started_at).toLocaleString() : '—'],
            ['Completed', run.completed_at ? new Date(run.completed_at).toLocaleString() : '—'],
          ].map(([k, v]) => (
            <div key={k} className="row between" style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)' }}><span className="faint" style={{ fontSize: 13 }}>{k}</span><b style={{ fontSize: 13 }}>{v}</b></div>
          ))}
        </div>
      )}
    </div>
  );
}
