'use client';
import { ShieldCheck, ShieldAlert, Database, KeyRound } from 'lucide-react';
import Topbar from '@/components/Topbar';
import { useConfig } from '@/lib/hooks';

export default function SettingsPage() {
  const { data: config } = useConfig();
  const ready = config?.smtpReady;
  return (
    <>
      <Topbar title="Settings" subtitle="SMTP, data and account configuration" />
      <div className="page grid" style={{ gridTemplateColumns: '1fr 1fr', maxWidth: 1000 }}>
        <div className="card pad">
          <div className="row gap8" style={{ color: ready ? 'var(--green)' : 'var(--amber)' }}>
            {ready ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}<h3 style={{ margin: 0 }}>Email (SMTP)</h3>
          </div>
          {ready ? <p className="muted mt12">Configured. Sending as <b>{config?.from}</b>.</p> : (
            <>
              <p className="muted mt12">Not configured — the app runs in dry-run mode. Set these environment variables (in <code>.env</code> locally, or in Vercel → Project → Settings → Environment Variables):</p>
              <pre className="card" style={{ padding: 12, fontSize: 12, overflowX: 'auto' }}>{`SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@yourdomain.com
SMTP_PASSWORD=your-16-char-app-password
MAILER_FROM=you@yourdomain.com`}</pre>
              <p className="faint" style={{ fontSize: 12 }}>Gmail/Workspace needs an App Password with 2-Step Verification on.</p>
            </>
          )}
        </div>

        <div className="card pad">
          <div className="row gap8"><Database size={18} color="var(--accent)" /><h3 style={{ margin: 0 }}>Data (Supabase)</h3></div>
          <p className="muted mt12">Leads, campaigns and send history are stored in a Supabase Postgres table <code>crm_store</code>. Required environment variables:</p>
          <pre className="card" style={{ padding: 12, fontSize: 12, overflowX: 'auto' }}>{`SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...`}</pre>
          <p className="faint" style={{ fontSize: 12 }}>Provided automatically by the Vercel Supabase Marketplace integration.</p>
        </div>

        <div className="card pad">
          <div className="row gap8"><KeyRound size={18} color="var(--purple)" /><h3 style={{ margin: 0 }}>Authentication</h3></div>
          <p className="muted mt12">Login is guarded by an env-configured operator account.</p>
          <pre className="card" style={{ padding: 12, fontSize: 12, overflowX: 'auto' }}>{`AUTH_EMAIL=admin@lagosmailer.com
AUTH_PASSWORD=change-me
SESSION_SECRET=long-random-string`}</pre>
        </div>
      </div>
    </>
  );
}
