'use client';
import { useState } from 'react';

// PUBLIC SMS opt-in page. This is the documented consent path for 10DLC
// registration — the disclosure language here must match the campaign's
// Opt-In Workflow Description.
export default function OptInPage() {
  const [form, setForm] = useState({ name: '', phone: '', consent: false });
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending'); setErr('');
    try {
      const r = await fetch('/api/optin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, company: 'Native125th' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Something went wrong.');
      setStatus('done');
    } catch (e: any) { setErr(e.message); setStatus('error'); }
  }

  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#1a1220', padding: 20, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 460, background: '#241a2e', border: '1px solid #3a2c47', borderRadius: 16, padding: 28, color: '#ece7f1' }}>
        <div style={{ fontSize: 13, letterSpacing: 2, color: '#d9b26a', fontWeight: 700 }}>NATIVE HARLEM</div>
        <h1 style={{ fontSize: 24, margin: '6px 0 4px' }}>Get our texts</h1>
        <p style={{ color: '#b6acc2', fontSize: 14, marginTop: 0 }}>
          Sunday brunch drops, event announcements and specials — straight to your phone.
        </p>

        {status === 'done' ? (
          <div style={{ marginTop: 20, padding: 16, borderRadius: 10, background: '#1e3a2a', color: '#a7e0bd', fontSize: 15 }}>
            ✓ You’re on the list! We’ll text you from Native Harlem. Reply STOP anytime to opt out.
          </div>
        ) : (
          <form onSubmit={submit} style={{ marginTop: 18, display: 'grid', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#cabfd8' }}>
              Name (optional)
              <input value={form.name} onChange={set('name')} placeholder="Your name"
                style={{ padding: '11px 12px', borderRadius: 9, border: '1px solid #3a2c47', background: '#1a1220', color: '#fff', fontSize: 15 }} />
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#cabfd8' }}>
              Mobile number
              <input value={form.phone} onChange={set('phone')} type="tel" required placeholder="(212) 555-0100"
                style={{ padding: '11px 12px', borderRadius: 9, border: '1px solid #3a2c47', background: '#1a1220', color: '#fff', fontSize: 15 }} />
            </label>

            {/* Optional (unchecked by default). Carriers reject "forced opt-in":
                the consent checkbox must NOT be required when the phone field is. */}
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12.5, color: '#b6acc2', lineHeight: 1.5, marginTop: 4 }}>
              <input type="checkbox" checked={form.consent} onChange={set('consent')} style={{ marginTop: 3 }} />
              <span>
                <b style={{ color: '#d9b26a' }}>Optional:</b> By checking this box, I agree to receive recurring marketing text messages
                from Native Harlem at the number provided. Consent is not a condition of any purchase.
                Message frequency may vary. Message &amp; data rates may apply. Reply HELP for help and STOP to opt out.
                See our{' '}
                <a href="/privacy" style={{ color: '#d9b26a' }}>Privacy Policy</a> and{' '}
                <a href="/privacy#terms" style={{ color: '#d9b26a' }}>Terms &amp; Conditions</a>.
              </span>
            </label>

            {status === 'error' && <div style={{ color: '#ff9a9a', fontSize: 13 }}>{err}</div>}

            <button type="submit" disabled={status === 'sending'}
              style={{ marginTop: 6, padding: '12px 14px', borderRadius: 10, border: 'none', background: '#d9b26a', color: '#241a2e', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
              {status === 'sending' ? 'Submitting…' : 'Sign me up'}
            </button>
          </form>
        )}

        <p style={{ color: '#7d7390', fontSize: 11, marginTop: 18, lineHeight: 1.5 }}>
          Native Harlem · 2319 Frederick Douglass Blvd, New York, NY 10027 · 212 913 0226.
          We never share your mobile opt-in data with third parties.
          Text messages are sent by Click Build Technologies LLC on behalf of Native Harlem.
        </p>
      </div>
    </div>
  );
}
