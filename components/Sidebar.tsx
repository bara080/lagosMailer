'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Users, Send, PenSquare, MessageSquare, FileText, BarChart3, Settings,
  ShieldCheck, ShieldAlert, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { useConfig } from '@/lib/hooks';

const NAV = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/campaigns', label: 'Campaigns', icon: Send },
  { href: '/compose', label: 'Compose', icon: PenSquare },
  { href: '/sms', label: 'SMS', icon: MessageSquare },
  { href: '/templates', label: 'Templates', icon: FileText },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: config } = useConfig();
  const ready = config?.smtpReady;
  const [collapsed, setCollapsed] = useState(false);

  // Persist the collapsed state across navigations/reloads.
  useEffect(() => {
    setCollapsed(localStorage.getItem('lm_sidebar_collapsed') === '1');
  }, []);
  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem('lm_sidebar_collapsed', next ? '1' : '0');
      return next;
    });
  }

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="brand">
        <span className="logo"><Send size={16} /></span>
        {!collapsed && <div><b>lagosMailer</b> <span>CRM</span></div>}
      </div>

      <nav className="nav">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link key={href} href={href} className={active ? 'active' : ''} title={collapsed ? label : undefined}>
              <Icon size={17} /> {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-foot">
        {!collapsed && (
          <>
            <div className="smtp-card">
              <div className="row" style={{ color: ready ? 'var(--green)' : 'var(--amber)' }}>
                {ready ? <ShieldCheck size={15} /> : <ShieldAlert size={15} />} SMTP Status
              </div>
              <small>{ready ? `Sending as ${config?.from}` : 'Not configured — dry-run only'}</small>
              {!ready && <Link href="/settings" className="link" style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 600 }}>Configure SMTP →</Link>}
            </div>
          </>
        )}

        <button className="collapse-btn" onClick={toggle} title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? <PanelLeftOpen size={17} /> : <><PanelLeftClose size={17} /> Collapse</>}
        </button>
      </div>
    </aside>
  );
}
