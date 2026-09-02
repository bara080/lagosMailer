'use client';
import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, HelpCircle, Settings, ChevronDown, LogOut, User, CheckCircle2, AlertCircle, PauseCircle, Clock, StopCircle } from 'lucide-react';
import { useConfig, useMe, useNotifications } from '@/lib/hooks';
import CompanySwitcher from './CompanySwitcher';

// Notification appearance + label per event type.
const NOTIF: Record<string, { icon: any; color: string; label: string }> = {
  'run.completed': { icon: CheckCircle2, color: 'var(--green)', label: 'Run completed' },
  'stage.health_gated': { icon: AlertCircle, color: 'var(--red)', label: 'Auto-paused — high failure rate' },
  'stage.gated': { icon: PauseCircle, color: 'var(--amber)', label: 'Stage gate — needs approval' },
  'quota.waiting': { icon: Clock, color: 'var(--amber)', label: 'Daily cap reached' },
  'run.stop': { icon: StopCircle, color: 'var(--text-dim)', label: 'Run stopped' },
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function notifDetail(n: { type: string; campaign: string; data: any }) {
  const d = n.data || {};
  if (n.type === 'run.completed') return `${n.campaign} · ${(d.accepted ?? 0).toLocaleString()} accepted`;
  if (n.type === 'stage.health_gated') return `${n.campaign} · stage ${d.stage} at ${d.rate}% fail/bounce`;
  if (n.type === 'stage.gated') return `${n.campaign} · stage ${d.completed} done — review to continue`;
  if (n.type === 'quota.waiting') return `${n.campaign} · resumes after midnight`;
  return n.campaign;
}

export default function Topbar({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bell, setBell] = useState(false);
  const { data: config } = useConfig();
  const { data: me } = useMe();
  const { data: notif } = useNotifications();
  const items = notif?.items ?? [];
  const unread = notif?.unread ?? 0;

  const email = me?.user?.email ?? '';
  const initial = (email[0] || 'U').toUpperCase();
  const role = me?.user?.role;

  async function logout() {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    window.location.href = '/login';
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <CompanySwitcher />
        <span className="tb-sub">{subtitle ? `${title} · ${subtitle}` : title}</span>
      </div>
      <div className="spacer" />
      <div className="topbar-actions">
        {actions}
        <span className={`badge ${config?.smtpReady ? 'completed' : 'scheduled'}`}>
          {config?.smtpReady ? 'SMTP: operational' : 'SMTP: not configured'}
        </span>
        <button className="icon-btn" title="Help"><HelpCircle size={17} /></button>

        {/* Notifications */}
        <div className="usermenu">
          <button className="icon-btn" title="Notifications" onClick={() => setBell((b) => !b)}>
            <Bell size={17} />{unread > 0 && <span className="dot" />}
          </button>
          {bell && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={() => setBell(false)} />
              <div className="menu-pop" style={{ right: 0, left: 'auto', width: 340, maxHeight: 420, overflowY: 'auto', padding: 0 }}>
                <div className="row between" style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                  <b style={{ fontSize: 13 }}>Notifications</b>
                  {unread > 0 && <span className="badge scheduled" style={{ fontSize: 11 }}>{unread} need attention</span>}
                </div>
                {items.length === 0 ? (
                  <p className="faint" style={{ fontSize: 12.5, padding: 16, margin: 0 }}>No notifications yet. Run activity shows up here.</p>
                ) : items.map((n) => {
                  const meta = NOTIF[n.type] || { icon: Bell, color: 'var(--text-dim)', label: n.type };
                  const Icon = meta.icon;
                  const clickable = !!n.run_id;
                  return (
                    <button key={n.id} className="mi" style={{ alignItems: 'flex-start', gap: 10, padding: '10px 14px', cursor: clickable ? 'pointer' : 'default', background: n.actionable ? 'var(--surface-2)' : undefined, width: '100%' }}
                      onClick={() => { if (clickable) { router.push(`/runs?run=${n.run_id}`); setBell(false); } }}>
                      <Icon size={16} color={meta.color} style={{ flexShrink: 0, marginTop: 1 }} />
                      <span style={{ minWidth: 0, textAlign: 'left' }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: meta.color }}>{meta.label}</span>
                        <span className="faint" style={{ display: 'block', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{notifDetail(n)}</span>
                        <span className="faint" style={{ fontSize: 11 }}>{timeAgo(n.created_at)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <button className="icon-btn" title="Settings" onClick={() => router.push('/settings')}><Settings size={17} /></button>

        <div className="usermenu">
          <button className="trigger" onClick={() => setOpen((o) => !o)} title={email}>
            <span className="avatar">{initial}</span>
            <ChevronDown size={15} color="var(--text-dim)" />
          </button>
          {open && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={() => setOpen(false)} />
              <div className="menu-pop">
                <div className="head">
                  <span className="avatar">{initial}</span>
                  <div className="who">
                    <b style={{ fontSize: 13 }}>{email || 'Not signed in'}</b>
                    {role && <><br /><small className="muted">{role}</small></>}
                  </div>
                </div>
                <div className="sep" />
                <button className="mi"><User size={15} /> Profile</button>
                <button className="mi" onClick={() => { router.push('/settings'); setOpen(false); }}><Settings size={15} /> Account settings</button>
                <div className="sep" />
                <button className="mi danger" onClick={logout}><LogOut size={15} /> Log out</button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
