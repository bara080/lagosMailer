'use client';
import { useState, type ReactNode } from 'react';
import { Bell, HelpCircle, Settings, ChevronDown, LogOut, User } from 'lucide-react';
import { useConfig, useMe } from '@/lib/hooks';
import CompanySwitcher from './CompanySwitcher';

export default function Topbar({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { data: config } = useConfig();
  const { data: me } = useMe();

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
        <button className="icon-btn" title="Notifications"><Bell size={17} /><span className="dot" /></button>
        <button className="icon-btn" title="Settings"><Settings size={17} /></button>

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
                <button className="mi"><Settings size={15} /> Account settings</button>
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
