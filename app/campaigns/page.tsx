'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, CheckCircle2, FileEdit, Clock, PauseCircle, Layers, Plus, Search, Filter, Play, Eye, MoreVertical, Pause, StopCircle } from 'lucide-react';
import Topbar from '@/components/Topbar';
import { StatusBadge, TableSkeleton, EmptyState } from '@/components/ui';
import { useCampaigns, useSendCampaign, useControlCampaign } from '@/lib/hooks';
import { useConfirm } from '@/components/ConfirmProvider';
import type { Campaign } from '@/lib/api';

const TABS = ['all', 'sending', 'scheduled', 'completed', 'paused', 'draft'];

function Bar({ n, total, tone }: { n: number; total: number; tone: string }) {
  const pct = total ? Math.round((n / total) * 100) : 0;
  return (
    <div className="metric-cell">
      <b>{n.toLocaleString()}</b><span className="pct">{pct}%</span>
      <div className={`bar ${tone}`}><span style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export default function CampaignsPage() {
  const router = useRouter();
  const [tab, setTab] = useState('all');
  const { data, isLoading } = useCampaigns();
  const send = useSendCampaign();
  const control = useControlCampaign();
  const confirm = useConfirm();
  const [menu, setMenu] = useState<number | null>(null);
  const counts = data?.counts ?? {};
  const campaigns = (data?.campaigns ?? []).filter((c) => tab === 'all' || c.status === tab);

  const cards = [
    { key: 'all', label: 'All Campaigns', icon: <Layers size={18} />, tone: 'purple', n: counts.all ?? 0 },
    { key: 'sending', label: 'Sending', icon: <Send size={18} />, tone: 'blue', n: counts.sending ?? 0 },
    { key: 'completed', label: 'Completed', icon: <CheckCircle2 size={18} />, tone: 'green', n: counts.completed ?? 0 },
    { key: 'draft', label: 'Drafts', icon: <FileEdit size={18} />, tone: 'amber', n: counts.draft ?? 0 },
    { key: 'scheduled', label: 'Scheduled', icon: <Clock size={18} />, tone: 'cyan', n: counts.scheduled ?? 0 },
    { key: 'paused', label: 'Paused', icon: <PauseCircle size={18} />, tone: 'red', n: counts.paused ?? 0 },
  ];

  return (
    <>
      <Topbar title="Campaigns" subtitle="Create, manage and track your email campaigns"
        actions={<>
          <div className="searchbox"><Search size={15} /><input placeholder="Search campaigns…" /></div>
          <button className="btn ghost"><Filter size={15} /> Filters</button>
          <button className="btn" onClick={() => router.push('/compose')}><Plus size={15} /> New Campaign</button>
        </>} />
      <div className="page">
        <div className="metrics" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
          {cards.map((c) => (
            <button key={c.key} className="metric" style={{ textAlign: 'left', border: tab === c.key ? '1px solid var(--accent)' : undefined }} onClick={() => setTab(c.key)}>
              <div className="top"><span className={`ic ${c.tone}`}>{c.icon}</span><span className="lbl">{c.label}</span></div>
              <div className="val">{isLoading ? '—' : c.n}</div>
            </button>
          ))}
        </div>

        <div className="card mt16" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="tabs" style={{ padding: '0 6px' }}>
            {TABS.map((t) => <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
          </div>
          <div style={{ overflowX: 'auto' }}>
            {isLoading ? <TableSkeleton rows={5} cols={8} /> :
              campaigns.length === 0 ? <EmptyState title="No campaigns" hint="Click “New Campaign” to compose and send one." /> : (
              <table className="tbl">
                <thead><tr><th>Campaign</th><th>Status</th><th>Audience</th><th>Sent</th><th>Delivered</th><th>Replies</th><th>Bounces</th><th>Created</th><th /></tr></thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div className="lead-cell">
                          <span className="avatar">{c.name[0]?.toUpperCase()}</span>
                          <div><b>{c.name}</b><small>{c.description || c.subject}</small></div>
                        </div>
                      </td>
                      <td><StatusBadge status={c.status} /></td>
                      <td><b>{c.recipients.toLocaleString()}</b><br /><small className="faint">recipients</small></td>
                      <td><Bar n={c.sent} total={c.recipients} tone="blue" /></td>
                      <td><Bar n={c.delivered} total={c.recipients} tone="green" /></td>
                      <td><Bar n={c.replied} total={c.recipients} tone="purple" /></td>
                      <td><Bar n={c.bounces} total={c.recipients} tone="red" /></td>
                      <td className="faint">{c.created_at.slice(0, 10)}</td>
                      <td>
                        <div className="row gap6">
                          <button className="btn ghost sm" title="Preview (dry run)" onClick={() => send.mutate({ id: c.id, dryRun: true })}><Eye size={14} /></button>
                          {c.status === 'sending' ? (
                            <button className="btn ghost sm" title="Pause" onClick={() => control.mutate({ id: c.id, action: 'pause' })}><Pause size={14} /></button>
                          ) : c.status === 'paused' ? (
                            <button className="btn sm" title="Resume" onClick={() => control.mutate({ id: c.id, action: 'resume' })}><Play size={14} /></button>
                          ) : (
                            <button className="btn sm" title="Send" onClick={async () => { if (await confirm({ title: 'Send this campaign?', message: <>Send <b>“{c.name}”</b> to <b>{c.recipients.toLocaleString()}</b> recipient(s). This sends real emails and can’t be undone.</>, confirmLabel: `Send to ${c.recipients}`, danger: c.recipients >= 50, requireText: c.recipients >= 50 ? String(c.recipients) : undefined })) send.mutate({ id: c.id, dryRun: false }); }}><Play size={14} /></button>
                          )}
                          <div className="usermenu">
                            <button className="btn ghost sm" title="More" onClick={() => setMenu(menu === c.id ? null : c.id)}><MoreVertical size={14} /></button>
                            {menu === c.id && (
                              <>
                                <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={() => setMenu(null)} />
                                <div className="menu-pop" style={{ right: 0, left: 'auto' }}>
                                  {c.status === 'sending' && <button className="mi" onClick={() => { control.mutate({ id: c.id, action: 'pause' }); setMenu(null); }}><Pause size={15} /> Pause</button>}
                                  {c.status === 'paused' && <button className="mi" onClick={() => { control.mutate({ id: c.id, action: 'resume' }); setMenu(null); }}><Play size={15} /> Resume</button>}
                                  {(c.status === 'sending' || c.status === 'paused') && (
                                    <button className="mi danger" onClick={async () => { setMenu(null); if (await confirm({ title: 'Stop this campaign?', message: <>Stop <b>“{c.name}”</b>? Unsent recipients will be skipped.</>, confirmLabel: 'Stop', danger: true })) control.mutate({ id: c.id, action: 'stop' }); }}><StopCircle size={15} /> Stop</button>
                                  )}
                                  {c.status !== 'sending' && c.status !== 'paused' && <div className="menu-label">No actions for {c.status}</div>}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
