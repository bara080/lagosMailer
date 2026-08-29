'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Plus, Search, Trash2, Send, ChevronRight, X, Mail, Globe, Phone, MapPin, Sheet } from 'lucide-react';
import Topbar from '@/components/Topbar';
import { StageBadge, TableSkeleton, EmptyState } from '@/components/ui';
import { useAddLead, useConfig, useDeleteLead, useImportCsv, useLeads, useSyncSheet, useUpdateLead } from '@/lib/hooks';
import { useConfirm } from '@/components/ConfirmProvider';
import type { Lead } from '@/lib/api';

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

  const { data, isLoading } = useLeads({ stage: tab, q });
  const { data: config } = useConfig();
  const del = useDeleteLead();
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
  const open = useMemo(() => leads.find((l) => l.id === openId) ?? null, [leads, openId]);

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
                    <th>Lead</th><th>Email</th><th>Category</th><th>Stage</th><th>Contacted</th><th>Added</th><th />
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.id} style={{ cursor: 'pointer', background: openId === l.id ? 'var(--surface-2)' : undefined }}>
                      <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} /></td>
                      <td onClick={() => setOpenId(l.id)}>
                        <div className="lead-cell">
                          <span className="avatar">{(l.business || l.name || '?')[0].toUpperCase()}</span>
                          <div><b>{l.business || l.name || '—'}</b><small>{l.name}</small></div>
                        </div>
                      </td>
                      <td onClick={() => setOpenId(l.id)} className="muted">{l.email}</td>
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

function ImportModal({ onClose }: { onClose: () => void }) {
  const imp = useImportCsv();
  const [csv, setCsv] = useState('email,name,business,category\n');
  return (
    <Modal title="Import leads (CSV)" onClose={onClose}>
      <p className="muted" style={{ fontSize: 12 }}>Paste CSV with a header row. Recognized columns: email, name, business, category, phone, instagram, website, source.</p>
      <textarea className="input mt8" style={{ minHeight: 160, fontFamily: 'monospace', fontSize: 12 }} value={csv} onChange={(e) => setCsv(e.target.value)} />
      <div className="row right mt16 gap8">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={imp.isPending} onClick={async () => {
          const r = await imp.mutateAsync(csv); alert(`Imported ${r.added} lead(s).`); onClose();
        }}>Import</button>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'grid', placeItems: 'center', zIndex: 50 }} onClick={onClose}>
      <div className="card pad" style={{ width: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h3 style={{ margin: 0 }}>{title}</h3>
          <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={onClose}><X size={14} /></button></div>
        {children}
      </div>
    </div>
  );
}
