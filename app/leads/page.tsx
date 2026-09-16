'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Plus, Search, Trash2, Send, ChevronRight, X, Mail, Globe, Phone, MapPin, Sheet, ShieldCheck, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import Topbar from '@/components/Topbar';
import { StageBadge, TableSkeleton, EmptyState } from '@/components/ui';
import { useAddLead, useConfig, useDeleteLead, useLeads, useSyncSheet, useUpdateLead, useValidationCounts, useValidateLeads, useRemoveInvalidLeads, useRefreshLeads } from '@/lib/hooks';
import { useConfirm } from '@/components/ConfirmProvider';
import { api } from '@/lib/api';
import type { Lead, ImportStats } from '@/lib/api';

const TABS = [
  { key: 'all', label: 'All' }, { key: 'new', label: 'New' }, { key: 'contacted', label: 'Contacted' },
  { key: 'replied', label: 'Replied' }, { key: 'qualified', label: 'Qualified' }, { key: 'won', label: 'Won' },
];
const STAGES = ['new', 'contacted', 'replied', 'qualified', 'won', 'unsub'];

export default function LeadsPage() {
  const router = useRouter();
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [openId, setOpenId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Server-side pagination: the API returns ONE page of leads + the exact total,
  // so the browser never loads all 63k at once.
  const PER_PAGE = 50;
  const [page, setPage] = useState(1);
  const [qDebounced, setQDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setQDebounced(q), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setPage(1); }, [tab, qDebounced]); // reset to page 1 when filter/search changes

  const { data, isLoading } = useLeads({ stage: tab, q: qDebounced, page, limit: PER_PAGE });
  const { data: config } = useConfig();
  const del = useDeleteLead();
  const { data: vc } = useValidationCounts();
  const validate = useValidateLeads();
  const removeInvalid = useRemoveInvalidLeads();
  const [vRun, setVRun] = useState<{ checked: number; valid: number; invalid: number; risky_relay: number; remaining: number } | null>(null);
  async function runValidation() {
    let acc = { checked: 0, valid: 0, invalid: 0, risky_relay: 0, remaining: 0 };
    for (let i = 0; i < 200; i++) { // safety bound
      const r = await validate.mutateAsync(2000);
      acc = { checked: acc.checked + r.checked, valid: acc.valid + r.valid, invalid: acc.invalid + r.invalid, risky_relay: acc.risky_relay + r.risky_relay, remaining: r.remaining };
      setVRun({ ...acc });
      if (r.done || r.checked === 0) break;
    }
  }
  const upd = useUpdateLead();
  const sync = useSyncSheet();
  const confirm = useConfirm();

  async function syncSheet() {
    try {
      const r = await sync.mutateAsync();
      alert(`Synced from Google Sheet: ${r.added} new lead(s) added (${r.total} rows read).`);
    } catch (e: any) {
      alert(e.message);
    }
  }
  const leads = data?.leads ?? [];
  const counts = data?.counts ?? {};
  const total = data?.total ?? 0;
  const open = useMemo(() => leads.find((l) => l.id === openId) ?? null, [leads, openId]);

  // `leads` is already the current server page.
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  const curPage = Math.min(page, pageCount);
  const pageLeads = leads;

  function toggle(id: number) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function contactSelected() {
    const ids = [...selected];
    if (ids.length) router.push(`/compose?ids=${ids.join(',')}`);
  }

  return (
    <>
      <Topbar title="Leads" subtitle="Manage your leads and build targeted campaigns"
        actions={<>
          {config?.sheetReady && (
            <button className="btn ghost" onClick={syncSheet} disabled={sync.isPending}>
              <Sheet size={15} /> {sync.isPending ? 'Syncing…' : 'Sync Google Sheet'}
            </button>
          )}
          <button className="btn ghost" onClick={() => setShowImport(true)}><Upload size={15} /> Import CSV</button>
          <button className="btn" onClick={() => setShowAdd(true)}><Plus size={15} /> Add Lead</button>
        </>} />
      <div className="page">
        <div className="pill-tabs">
          {TABS.map((t) => (
            <button key={t.key} className={`pill-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label} <span className="n">{(counts[t.key] ?? 0).toLocaleString()}</span>
            </button>
          ))}
        </div>

        <div className="row between mt16 wrap">
          <div className="searchbox" style={{ width: 280 }}>
            <Search size={15} /><input placeholder="Search leads…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {selected.size > 0 && (
            <div className="row gap8">
              <span className="muted">{selected.size} selected</span>
              <button className="btn ghost sm" onClick={contactSelected}><Send size={14} /> Contact</button>
              <button className="btn danger sm" onClick={async () => {
                if (!(await confirm({ title: 'Delete leads?', message: <>Delete <b>{selected.size}</b> lead(s)? This can’t be undone.</>, confirmLabel: 'Delete', danger: true }))) return;
                for (const id of selected) await del.mutateAsync(id);
                setSelected(new Set());
              }}><Trash2 size={14} /> Delete</button>
            </div>
          )}
        </div>

        <div className="card pad mt16" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span className="row gap8"><ShieldCheck size={16} color="var(--accent)" /><b style={{ fontSize: 14 }}>Email health</b></span>
          <span className="run-stat g">✓ {(vc?.valid ?? 0).toLocaleString()} valid</span>
          <span className="run-stat r">✗ {(vc?.invalid ?? 0).toLocaleString()} invalid</span>
          <span className="run-stat a">◑ {(vc?.risky_relay ?? 0).toLocaleString()} Apple relay</span>
          <span className="faint" style={{ fontSize: 12 }}>{(vc?.unchecked ?? 0).toLocaleString()} unchecked</span>
          <span style={{ flex: 1 }} />
          {validate.isPending && vRun && <span className="faint" style={{ fontSize: 12 }}>Validating… {vRun.checked.toLocaleString()} done · {vRun.remaining.toLocaleString()} left</span>}
          {(vc?.invalid ?? 0) > 0 && (
            <button className="btn ghost sm" disabled={removeInvalid.isPending} onClick={async () => {
              if (!(await confirm({ title: 'Remove invalid leads?', message: <>Delete <b>{(vc?.invalid ?? 0).toLocaleString()}</b> dead-domain lead(s)? They stay on the suppression list (excluded from sends even if re-imported).</>, confirmLabel: 'Remove', danger: true }))) return;
              const r = await removeInvalid.mutateAsync();
              alert(`Removed ${r.removed.toLocaleString()} invalid leads.`);
            }}><Trash2 size={14} /> Remove {(vc?.invalid ?? 0).toLocaleString()} invalid</button>
          )}
          <button className="btn ghost sm" disabled={validate.isPending || (vc?.unchecked ?? 0) === 0} onClick={runValidation}>
            <ShieldCheck size={14} /> {validate.isPending ? 'Validating…' : `Validate ${(vc?.unchecked ?? 0).toLocaleString()} emails`}
          </button>
        </div>

        <div className="row gap16 mt16" style={{ alignItems: 'flex-start' }}>
          <div className="card grow" style={{ padding: 0, overflow: 'hidden' }}>
            {isLoading ? <TableSkeleton rows={8} cols={7} /> :
              leads.length === 0 ? <EmptyState title="No leads" hint="Add a lead or import a CSV to get started." /> : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 34 }}><input type="checkbox"
                      checked={selected.size === leads.length && leads.length > 0}
                      onChange={(e) => setSelected(e.target.checked ? new Set(leads.map((l) => l.id)) : new Set())} /></th>
                    <th>Lead</th><th>Email</th><th>Phone</th><th>Category</th><th>Stage</th><th>Contacted</th><th>Added</th><th />
                  </tr>
                </thead>
                <tbody>
                  {pageLeads.map((l) => (
                    <tr key={l.id} style={{ cursor: 'pointer', background: openId === l.id ? 'var(--surface-2)' : undefined }}>
                      <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} /></td>
                      <td onClick={() => setOpenId(l.id)}>
                        <div className="lead-cell">
                          <span className="avatar">{(l.business || l.name || '?')[0].toUpperCase()}</span>
                          <div><b>{l.business || l.name || '—'}</b><small>{l.name}</small></div>
                        </div>
                      </td>
                      <td onClick={() => setOpenId(l.id)} className="muted">{l.email}</td>
                      <td onClick={() => setOpenId(l.id)} className="muted">{l.phone || '—'}</td>
                      <td onClick={() => setOpenId(l.id)}>{l.category ? <span className="chip">{l.category}</span> : '—'}</td>
                      <td onClick={() => setOpenId(l.id)}><StageBadge stage={l.stage} /></td>
                      <td onClick={() => setOpenId(l.id)} style={{ color: l.contacted_at ? 'var(--green)' : 'var(--text-faint)' }}>{l.contacted_at ? '✓' : '—'}</td>
                      <td onClick={() => setOpenId(l.id)} className="faint">{l.created_at.slice(0, 10)}</td>
                      <td onClick={() => setOpenId(l.id)}><ChevronRight size={15} color="var(--text-faint)" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {total > PER_PAGE && (
              <div className="row between" style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
                <span className="faint" style={{ fontSize: 12.5 }}>
                  Showing <b>{total === 0 ? 0 : (curPage - 1) * PER_PAGE + 1}</b>–<b>{Math.min(curPage * PER_PAGE, total)}</b> of <b>{total.toLocaleString()}</b>
                </span>
                <span className="row gap8">
                  <button className="btn ghost sm" disabled={curPage <= 1} onClick={() => setPage(curPage - 1)}>← Prev</button>
                  <span className="faint" style={{ fontSize: 12.5 }}>Page {curPage} / {pageCount}</span>
                  <button className="btn ghost sm" disabled={curPage >= pageCount} onClick={() => setPage(curPage + 1)}>Next →</button>
                </span>
              </div>
            )}
          </div>

          {open && (
            <div className="card detail pad">
              <div className="row between">
                <b>Lead Details</b>
                <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => setOpenId(null)}><X size={14} /></button>
              </div>
              <div className="row gap12 mt16">
                <span className="avatar" style={{ width: 42, height: 42, fontSize: 16 }}>{(open.business || open.name || '?')[0].toUpperCase()}</span>
                <div><b style={{ fontSize: 15 }}>{open.name || open.business}</b><div className="muted" style={{ fontSize: 12 }}>{open.business}</div></div>
              </div>
              <div className="mt16"><StageBadge stage={open.stage} /></div>

              <div className="mt16" style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-dim)' }}>CONTACT INFO</div>
              <div className="mt8 stack gap8" style={{ fontSize: 13 }}>
                {open.email && <div className="row gap8"><Mail size={14} color="var(--text-dim)" /> {open.email}</div>}
                {open.phone && <div className="row gap8"><Phone size={14} color="var(--text-dim)" /> {open.phone}</div>}
                {open.website && <div className="row gap8"><Globe size={14} color="var(--text-dim)" /> {open.website}</div>}
                {open.borough && <div className="row gap8"><MapPin size={14} color="var(--text-dim)" /> {open.borough}</div>}
              </div>

              <div className="mt16">
                <label className="field"><span>Stage</span>
                  <select className="input" value={open.stage} onChange={(e) => upd.mutate({ id: open.id, body: { stage: e.target.value as any } })}>
                    {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              </div>

              <div className="mt16 stack gap8">
                <div className="kv"><span className="k">Source</span><span>{open.source}</span></div>
                <div className="kv"><span className="k">Added</span><span>{open.created_at.slice(0, 10)}</span></div>
                <div className="kv"><span className="k">Contacted</span><span>{open.contacted_at ? open.contacted_at.slice(0, 10) : '—'}</span></div>
                <div className="kv"><span className="k">Last subject</span><span>{open.subject || '—'}</span></div>
              </div>

              <button className="btn mt16" style={{ width: '100%' }} onClick={() => router.push(`/compose?ids=${open.id}`)}><Send size={15} /> Email this lead</button>
            </div>
          )}
        </div>
      </div>

      {showAdd && <AddLeadModal onClose={() => setShowAdd(false)} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </>
  );
}

function AddLeadModal({ onClose }: { onClose: () => void }) {
  const add = useAddLead();
  const [f, setF] = useState({ business: '', name: '', email: '', category: '', phone: '' });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="Add lead" onClose={onClose}>
      <label className="field mt12"><span>Business</span><input className="input" value={f.business} onChange={set('business')} /></label>
      <label className="field mt12"><span>Contact name</span><input className="input" value={f.name} onChange={set('name')} /></label>
      <label className="field mt12"><span>Email</span><input className="input" value={f.email} onChange={set('email')} placeholder="name@example.com" /></label>
      <div className="row gap12 mt12">
        <label className="field grow"><span>Category</span><input className="input" value={f.category} onChange={set('category')} /></label>
        <label className="field grow"><span>Phone</span><input className="input" value={f.phone} onChange={set('phone')} /></label>
      </div>
      <div className="row right mt24 gap8">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={add.isPending} onClick={async () => {
          try { await add.mutateAsync(f); onClose(); } catch (e: any) { alert(e.message); }
        }}>Add lead</button>
      </div>
    </Modal>
  );
}

// Header aliases the server's importer understands (src/store.js `pick`). We keep
// only these columns from an uploaded file so the JSON payload stays small even
// for a 90k-row export with dozens of unrelated columns (spend, visits, notes…).
const RECOGNIZED_COLUMNS = new Set([
  'email', 'to_email', 'email address', 'emailaddress', 'e-mail', 'mail',
  'instagram', 'ig', 'handle', 'instagram handle',
  'business', 'business_name', 'business name', 'company', 'company name', 'organization',
  'name', 'owner', 'full name', 'fullname', 'first name', 'contact', 'contact name', 'guest name', 'guest',
  'phone', 'phone number', 'mobile', 'tel', 'telephone',
  'website', 'url', 'site', 'web',
  'category', 'type', 'vertical',
  'borough', 'city', 'area', 'location',
  'source', 'subject',
]);

type ImpStep = 'pick' | 'analyzing' | 'preview' | 'importing' | 'validating' | 'done';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IMPORT_CHUNK = 2000; // rows per POST — keeps each request well under the body limit

function pickField(r: Record<string, string>, keys: string[]): string {
  for (const k of keys) { const v = r[k]; if (v && String(v).trim()) return String(v).trim(); }
  return '';
}

// Non-developer upload layer: drop a CSV or Excel file → validation + dedup
// preview → import only the net-new → auto-run the MX validation pass.
//
// To stay under the request-body limit for big files (90k rows → ~10 MB), we do
// NOT upload the whole file. We fetch existing emails ONCE, dedup + validate in
// the browser, then POST only the net-new rows in small chunks.
function ImportModal({ onClose }: { onClose: () => void }) {
  const validate = useValidateLeads();
  const refreshLeads = useRefreshLeads();
  const confirm = useConfirm();

  const [step, setStep] = useState<ImpStep>('pick');
  const [fileName, setFileName] = useState('');
  const [newRows, setNewRows] = useState<Record<string, string>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [added, setAdded] = useState(0);
  const [progress, setProgress] = useState(0);
  const [vRun, setVRun] = useState<{ checked: number; remaining: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function fail(title: string, message: string) {
    // Surface the problem in the app's themed global modal (not a raw alert).
    confirm({ title, message, confirmLabel: 'OK' });
  }

  async function handleFile(file: File) {
    setStep('analyzing');
    try {
      const XLSX = await import('xlsx'); // lazy — keeps SheetJS out of the initial bundle
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false });
      if (!raw.length) { setStep('pick'); fail('Empty file', 'That file has no data rows.'); return; }

      // Lowercase/trim header keys (mirrors the server CSV parser) and keep only
      // recognized columns so `pick()` matches and rows stay lean.
      const kept = new Set<string>();
      const rows = raw.map((r) => {
        const o: Record<string, string> = {};
        for (const k of Object.keys(r)) {
          const key = k.trim().toLowerCase();
          if (RECOGNIZED_COLUMNS.has(key)) { o[key] = String(r[k] ?? '').trim(); kept.add(key); }
        }
        return o;
      });
      if (!kept.size) {
        setStep('pick');
        fail('No recognizable columns', 'We couldn\'t find an Email (or Instagram) column. Make sure the first row has headers like "Email", "Guest Name", "Phone".');
        return;
      }

      // Fetch existing emails once, then dedup + validate entirely client-side.
      const { emails } = await api.existingEmails();
      const existing = new Set(emails);
      const seen = new Set<string>();
      const s: ImportStats = { total: 0, blank: 0, invalid: 0, duplicate: 0, inFileDup: 0, netNew: 0 };
      const net: Record<string, string>[] = [];
      for (const r of rows) {
        if (!Object.values(r).some((v) => String(v ?? '').trim())) continue;
        s.total++;
        const email = pickField(r, ['email', 'to_email', 'email address', 'emailaddress', 'e-mail', 'mail']);
        const ig = pickField(r, ['instagram', 'ig', 'handle', 'instagram handle']);
        if (!email && !ig) { s.blank++; continue; }
        if (email) {
          const key = email.toLowerCase();
          if (!EMAIL_RE.test(key)) { s.invalid++; continue; }
          if (existing.has(key)) { s.duplicate++; continue; }
          if (seen.has(key)) { s.inFileDup++; continue; }
          seen.add(key);
        }
        s.netNew++;
        net.push(r);
      }
      setFileName(file.name);
      setColumns([...kept]);
      setNewRows(net);
      setStats(s);
      setStep('preview');
    } catch (e: any) {
      setStep('pick');
      fail('Could not read that file', e?.message || 'Unknown error while parsing the file.');
    }
  }

  async function runImport() {
    setStep('importing');
    setProgress(0);
    let total = 0;
    try {
      // Import net-new rows in small chunks so no single request is too large.
      for (let i = 0; i < newRows.length; i += IMPORT_CHUNK) {
        const chunk = newRows.slice(i, i + IMPORT_CHUNK);
        const r = await api.insertLeadRows(chunk);
        total += r.added;
        setProgress(Math.min(i + chunk.length, newRows.length));
      }
      setAdded(total);
    } catch (e: any) {
      refreshLeads();
      setStep('preview');
      fail('Import failed', `${e?.message || 'Unknown error'}. ${total.toLocaleString()} lead(s) were added before it stopped.`);
      return;
    }
    refreshLeads();

    // Auto-run the deliverability (MX) validation pass on the freshly-added leads.
    setStep('validating');
    let acc = { checked: 0, remaining: 0 };
    try {
      for (let i = 0; i < 400; i++) { // safety bound
        const v = await validate.mutateAsync(2000);
        acc = { checked: acc.checked + v.checked, remaining: v.remaining };
        setVRun({ ...acc });
        if (v.done || v.checked === 0) break;
      }
    } catch {
      /* validation is best-effort — leads are already imported; user can re-run from Email health */
    }
    setStep('done');
  }

  return (
    <Modal title="Import leads" onClose={onClose} width={480}>
      {(step === 'pick' || step === 'analyzing') && (
        <>
          <p className="muted" style={{ fontSize: 12 }}>
            Drop a <b>CSV</b> or <b>Excel</b> file (.csv, .xlsx). We auto-detect columns like
            Email, Guest Name, Phone, Company — then show you what's new vs. already in your list before importing.
          </p>
          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); if (step === 'analyzing') return; const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
            className="mt12"
            style={{
              display: 'grid', placeItems: 'center', gap: 8, padding: '28px 16px', cursor: step === 'analyzing' ? 'default' : 'pointer',
              border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 12,
              background: dragOver ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent',
              textAlign: 'center',
            }}
          >
            {step === 'analyzing' ? <Loader2 size={22} className="spin" color="var(--accent)" /> : <FileSpreadsheet size={22} color="var(--accent)" />}
            <span style={{ fontSize: 13, fontWeight: 600 }}>{step === 'analyzing' ? 'Reading & checking for duplicates…' : 'Click to choose or drag a file here'}</span>
            <span className="faint" style={{ fontSize: 12 }}>CSV or Excel · headers in the first row</span>
            <input type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              style={{ display: 'none' }} disabled={step === 'analyzing'}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </label>
        </>
      )}

      {step === 'preview' && stats && (
        <>
          <p className="muted" style={{ fontSize: 12 }}>
            <b>{fileName}</b> · {stats.total.toLocaleString()} rows · columns: {columns.join(', ')}
          </p>
          <div className="mt12" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Stat label="New to import" value={stats.netNew} tone="good" big />
            <Stat label="Already in list" value={stats.duplicate} />
            <Stat label="Duplicate in file" value={stats.inFileDup} />
            <Stat label="Invalid email" value={stats.invalid} tone={stats.invalid ? 'warn' : undefined} />
            <Stat label="Blank (no email)" value={stats.blank} />
          </div>
          {stats.netNew === 0 && <p className="muted mt12" style={{ fontSize: 12 }}>Nothing new to add — every valid email is already in your list. 🎉</p>}
          <div className="row right mt16 gap8">
            <button className="btn ghost" onClick={() => { setStep('pick'); setStats(null); setNewRows([]); }}>Back</button>
            <button className="btn" disabled={stats.netNew === 0} onClick={runImport}>
              Import {stats.netNew.toLocaleString()} new
            </button>
          </div>
        </>
      )}

      {step === 'importing' && (
        <div style={{ display: 'grid', placeItems: 'center', gap: 10, padding: '24px 8px', textAlign: 'center' }}>
          <Loader2 size={22} className="spin" color="var(--accent)" />
          <b style={{ fontSize: 14 }}>Importing…</b>
          <span className="faint" style={{ fontSize: 12 }}>{progress.toLocaleString()} / {newRows.length.toLocaleString()} added</span>
        </div>
      )}

      {step === 'validating' && (
        <div style={{ display: 'grid', placeItems: 'center', gap: 10, padding: '24px 8px', textAlign: 'center' }}>
          <Loader2 size={22} className="spin" color="var(--accent)" />
          <b style={{ fontSize: 14 }}>Added {added.toLocaleString()} — validating emails…</b>
          <span className="faint" style={{ fontSize: 12 }}>
            {vRun ? `${vRun.checked.toLocaleString()} checked · ${vRun.remaining.toLocaleString()} left` : 'Starting…'}
          </span>
        </div>
      )}

      {step === 'done' && (
        <div style={{ display: 'grid', placeItems: 'center', gap: 10, padding: '24px 8px', textAlign: 'center' }}>
          <CheckCircle2 size={26} color="var(--accent)" />
          <b style={{ fontSize: 15 }}>Imported {added.toLocaleString()} new lead(s)</b>
          <span className="faint" style={{ fontSize: 12 }}>Emails validated (syntax + MX). Invalid ones are flagged in Email health.</span>
          <button className="btn mt8" onClick={onClose}>Done</button>
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value, tone, big }: { label: string; value: number; tone?: 'good' | 'warn'; big?: boolean }) {
  const color = tone === 'good' ? 'var(--accent)' : tone === 'warn' ? 'var(--red)' : 'var(--text)';
  return (
    <div className="card" style={{ padding: '10px 12px', gridColumn: big ? '1 / -1' : undefined }}>
      <div style={{ fontSize: big ? 26 : 18, fontWeight: 700, color }}>{value.toLocaleString()}</div>
      <div className="faint" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
        {tone === 'warn' && value > 0 && <AlertTriangle size={11} />}{label}
      </div>
    </div>
  );
}

function Modal({ title, children, onClose, width = 440 }: { title: string; children: React.ReactNode; onClose: () => void; width?: number }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'grid', placeItems: 'center', zIndex: 50 }} onClick={onClose}>
      <div className="card pad" style={{ width, maxWidth: '92vw' }} onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h3 style={{ margin: 0 }}>{title}</h3>
          <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={onClose}><X size={14} /></button></div>
        {children}
      </div>
    </div>
  );
}
