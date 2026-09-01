'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Database, KeyRound, PenLine, Save } from 'lucide-react';
import Topbar from '@/components/Topbar';
import { useConfig, useSetSettings } from '@/lib/hooks';
import type { Signature } from '@/lib/api';

const EMPTY_SIG: Signature = {
  enabled: true, businessName: '', tagline: '', address: '', phone: '', website: '', logoUrl: '',
  socials: { instagram: '', tiktok: '', facebook: '', x: '' },
};

const withHttp = (u: string) => (!u ? '' : /^https?:\/\//i.test(u) ? u : `https://${u}`);
const socialUrl = (kind: keyof Signature['socials'], val?: string) => {
  if (!val) return '';
  if (/^https?:\/\//i.test(val)) return val;
  const base = { instagram: 'https://instagram.com/', tiktok: 'https://tiktok.com/@', facebook: 'https://facebook.com/', x: 'https://x.com/' } as const;
  return base[kind] + val.replace(/^@/, '');
};

function SignatureEditor({ company }: { company: string }) {
  const { data: config } = useConfig();
  const save = useSetSettings();
  const [sig, setSig] = useState<Signature>(EMPTY_SIG);
  const [loaded, setLoaded] = useState(false);

  // Seed from saved config once (per company).
  useEffect(() => {
    if (config && !loaded) {
      setSig(config.signature ? { ...EMPTY_SIG, ...config.signature, socials: { ...EMPTY_SIG.socials, ...config.signature.socials } } : { ...EMPTY_SIG, businessName: company });
      setLoaded(true);
    }
  }, [config, loaded, company]);
  // Reset when company changes.
  useEffect(() => { setLoaded(false); }, [company]);

  const set = (k: keyof Signature) => (e: any) => setSig((s) => ({ ...s, [k]: e.target.value }));
  const setSocial = (k: keyof Signature['socials']) => (e: any) => setSig((s) => ({ ...s, socials: { ...s.socials, [k]: e.target.value } }));

  return (
    <div className="card pad" style={{ gridColumn: '1 / -1' }}>
      <div className="row between">
        <div className="row gap8"><PenLine size={18} color="var(--accent)" /><h3 style={{ margin: 0 }}>Email signature</h3></div>
        <label className="row gap8" style={{ fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={sig.enabled} onChange={(e) => setSig((s) => ({ ...s, enabled: e.target.checked }))} />
          Append to every email
        </label>
      </div>
      <p className="muted mt8" style={{ fontSize: 13 }}>Added automatically to the bottom of every campaign and test email for <b>{company}</b>.</p>

      <div className="grid mt16" style={{ gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Editor */}
        <div className="stack gap12">
          <label className="field"><span>Business name</span><input className="input" value={sig.businessName} onChange={set('businessName')} placeholder="Native125th" /></label>
          <label className="field"><span>Tagline</span><input className="input" value={sig.tagline} onChange={set('tagline')} placeholder="Harlem’s New Sunday Experience" /></label>
          <label className="field"><span>Address</span><input className="input" value={sig.address} onChange={set('address')} placeholder="2319 Frederick Douglass Blvd, NY NY 10027" /></label>
          <div className="row gap12">
            <label className="field grow"><span>Phone</span><input className="input" value={sig.phone} onChange={set('phone')} placeholder="212 913 0226" /></label>
            <label className="field grow"><span>Website</span><input className="input" value={sig.website} onChange={set('website')} placeholder="native125th.com" /></label>
          </div>
          <label className="field"><span>Logo URL <small className="faint">(paste, or upload via Assets later)</small></span><input className="input" value={sig.logoUrl} onChange={set('logoUrl')} placeholder="/zinga-logo.svg or https://…" /></label>
          <div className="row gap12">
            <label className="field grow"><span>Instagram</span><input className="input" value={sig.socials.instagram} onChange={setSocial('instagram')} placeholder="native125th" /></label>
            <label className="field grow"><span>TikTok</span><input className="input" value={sig.socials.tiktok} onChange={setSocial('tiktok')} placeholder="native125th" /></label>
          </div>
          <div className="row gap12">
            <label className="field grow"><span>Facebook</span><input className="input" value={sig.socials.facebook} onChange={setSocial('facebook')} placeholder="native125th" /></label>
            <label className="field grow"><span>X</span><input className="input" value={sig.socials.x} onChange={setSocial('x')} placeholder="native125th" /></label>
          </div>
          <div className="row gap8" style={{ alignItems: 'center' }}>
            <button className="btn" disabled={save.isPending} onClick={() => save.mutate({ signature: sig })}><Save size={15} /> Save signature</button>
            {save.isSuccess && <span className="faint" style={{ fontSize: 12 }}>Saved ✓</span>}
            {save.isError && <span style={{ color: 'var(--red)', fontSize: 12 }}>{(save.error as any)?.message}</span>}
          </div>
        </div>

        {/* Live preview */}
        <div>
          <div className="faint" style={{ fontSize: 12, marginBottom: 8 }}>Preview</div>
          <div style={{ background: '#fff', color: '#374151', padding: 18, borderRadius: 8, fontFamily: 'Arial, sans-serif', fontSize: 13, lineHeight: 1.55, opacity: sig.enabled ? 1 : 0.4 }}>
            <div style={{ color: '#9ca3af' }}>…your email body…</div>
            <div style={{ marginTop: 22, paddingTop: 14, borderTop: '1px solid #e5e7eb' }}>
              {sig.logoUrl ? <div style={{ display: 'inline-block', background: '#1a1220', padding: '10px 16px', borderRadius: 10, marginBottom: 12 }}><img src={sig.logoUrl} alt="" style={{ maxHeight: 46, display: 'block' }} /></div> : null}
              {sig.businessName ? <div style={{ fontWeight: 700, color: '#111827', fontSize: 14 }}>{sig.businessName}</div> : null}
              {sig.tagline ? <div>{sig.tagline}</div> : null}
              {sig.address ? <div>{sig.address}</div> : null}
              {(sig.phone || sig.website) && <div>{[sig.phone, sig.website].filter(Boolean).join(' · ')}</div>}
              <div style={{ marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {(['instagram', 'tiktok', 'facebook', 'x'] as const).map((k) => sig.socials[k] ? (
                  <a key={k} href={socialUrl(k, sig.socials[k])} style={{ color: '#6b7280', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <img src={`/social-${k}.png`} width={16} height={16} alt="" style={{ display: 'block' }} />
                    {k === 'tiktok' ? 'TikTok' : k === 'x' ? 'X' : k[0].toUpperCase() + k.slice(1)}
                  </a>
                ) : null)}
              </div>
            </div>
          </div>
          <p className="faint mt8" style={{ fontSize: 11.5 }}>You can use <code>{'{{business}}'}</code> style tokens here too — they fill in per recipient.</p>
        </div>
      </div>
    </div>
  );
}

// Per-company daily send cap — a safety valve so a large campaign can't exceed
// the provider's daily send limit. Shows today's usage and lets the operator
// change the cap.
function DailyCapCard() {
  const { data: config } = useConfig();
  const save = useSetSettings();
  const [cap, setCap] = useState('');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { if (config && !loaded) { setCap(String(config.dailyCap ?? 1900)); setLoaded(true); } }, [config, loaded]);
  useEffect(() => { setLoaded(false); }, [config?.company]);

  const sentToday = config?.sentToday ?? 0;
  const effCap = config?.dailyCap ?? 1900;
  const left = Math.max(0, effCap - sentToday);
  const pct = effCap ? Math.min(100, Math.round((sentToday / effCap) * 100)) : 0;

  return (
    <div className="card pad">
      <div className="row gap8" style={{ color: left > 0 ? 'var(--green)' : 'var(--amber)' }}>
        <ShieldCheck size={18} /><h3 style={{ margin: 0 }}>Sending safety — daily cap</h3>
      </div>
      <p className="muted mt12" style={{ fontSize: 13 }}>
        A hard limit on emails sent per day for <b>{config?.company}</b>, so a big campaign can’t blow past your provider’s daily send limit (Gmail Workspace ≈ 2,000/day). Campaigns pause at the cap and <b>auto-resume after midnight</b>.
      </p>
      <div className="row gap12 mt16" style={{ alignItems: 'baseline' }}>
        <div style={{ fontSize: 28, fontWeight: 750 }}>{sentToday.toLocaleString()}</div>
        <div className="muted">of {effCap.toLocaleString()} sent today · <b>{left.toLocaleString()}</b> left</div>
      </div>
      <div className="bar blue mt8"><span style={{ width: `${pct}%` }} /></div>
      <label className="field mt16"><span>Daily cap (emails/day)</span>
        <input className="input" type="number" min={1} value={cap} onChange={(e) => setCap(e.target.value)} placeholder="1900" />
      </label>
      <div className="row gap8 mt12">
        <button className="btn" disabled={save.isPending} onClick={() => save.mutate({ dailyCap: Number(cap) || null })}><Save size={15} /> Save cap</button>
        {save.isSuccess && <span className="faint" style={{ fontSize: 12 }}>Saved ✓</span>}
        {save.isError && <span style={{ color: 'var(--red)', fontSize: 12 }}>{(save.error as any)?.message}</span>}
      </div>
      <p className="faint mt8" style={{ fontSize: 12 }}>Default 1,900/day (headroom under Gmail Workspace’s ~2,000 limit). Counter resets at midnight, New York time.</p>
    </div>
  );
}

export default function SettingsPage() {
  const { data: config } = useConfig();
  const ready = config?.smtpReady;
  return (
    <>
      <Topbar title="Settings" subtitle="SMTP, signature, data and account configuration" />
      <div className="page grid" style={{ gridTemplateColumns: '1fr 1fr', maxWidth: 1000 }}>
        <SignatureEditor company={config?.company || 'LagosTSQ'} />

        <DailyCapCard />

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
