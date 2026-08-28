'use client';
import { useState, type ReactNode } from 'react';
import { Search, Bell, HelpCircle, Settings, ChevronDown, LogOut, User } from 'lucide-react';
import { useConfig } from '@/lib/hooks';

export default function Topbar({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { data: config } = useConfig();

  async function logout() {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    window.location.href = '/login';
  }

  return (
    <header className="topbar">
      <div>
        <h1>{title}</h1>
        {subtitle && <div className="sub">{subtitle}</div>}
      </div>
      <div className="spacer" />
      <div className="topbar-actions">
        {actions}
        <span className={`badge ${config?.smtpReady ? 'completed' : 'scheduled'}`}>
          {config?.smtpReady ? 'SMTP: operational' : 'SMTP: not configured (dry run)'}
        </span>
        <button className="icon-btn" title="Help"><HelpCircle size={17} /></button>
        <button className="icon-btn" title="Notifications"><Bell size={17} /><span className="dot" /></button>
        <button className="icon-btn" title="Settings"><Settings size={17} /></button>

        <div className="usermenu">
          <button className="trigger" onClick={() => setOpen((o) => !o)}>
            <span className="avatar">A</span>
            <span className="who"><b>Admin</b><small>admin@lagosmailer.com</small></span>
            <ChevronDown size={15} color="var(--text-dim)" />
          </button>
          {open && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={() => setOpen(false)} />
              <div className="menu-pop">
                <div className="head">
                  <span className="avatar">A</span>
                  <div className="who"><b style={{ fontSize: 13 }}>Admin</b><br /><small className="muted">admin@lagosmailer.com</small></div>
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
