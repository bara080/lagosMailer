'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, Send, PenSquare, FileText, BarChart3, Settings,
  Crown, ShieldCheck, ShieldAlert,
} from 'lucide-react';
import { useConfig } from '@/lib/hooks';

const NAV = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/campaigns', label: 'Campaigns', icon: Send },
  { href: '/compose', label: 'Compose', icon: PenSquare },
  { href: '/templates', label: 'Templates', icon: FileText },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: config } = useConfig();
  const ready = config?.smtpReady;

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="logo"><Send size={16} /></span>
        <div><b>lagosMailer</b> <span>CRM</span></div>
      </div>

      <nav className="nav">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link key={href} href={href} className={active ? 'active' : ''}>
              <Icon size={17} /> {label}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-foot">
        <div className="smtp-card">
          <div className="row" style={{ color: ready ? 'var(--green)' : 'var(--amber)' }}>
            {ready ? <ShieldCheck size={15} /> : <ShieldAlert size={15} />} SMTP Status
          </div>
          <small>{ready ? `Sending as ${config?.from}` : 'Not configured — dry-run only'}</small>
          {!ready && <Link href="/settings" className="link" style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 600 }}>Configure SMTP →</Link>}
        </div>

        <div className="pro-card">
          <b><Crown size={15} color="var(--amber)" /> Pro Plan</b>
          <small>Unlock scheduling, A/B tests &amp; open tracking.</small>
          <button className="btn ghost sm" style={{ width: '100%' }}>Upgrade now</button>
        </div>
      </div>
    </aside>
  );
}
