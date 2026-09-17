'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import ResultModal, { type ResultVariant } from '@/components/ResultModal';

// PUBLIC SMS opt-in page. This is the documented consent path for 10DLC
// registration — the disclosure language here must match the campaign's
// Opt-In Workflow Description.
type OptInResult = { ok: boolean; consented: boolean; phone: string; state: 'subscribed' | 'not_subscribed' };

export default function OptInPage() {
  const [form, setForm] = useState({ name: '', phone: '', consent: false });
  const [modalOpen, setModalOpen] = useState(false);

  // React Query mutation — exposes isPending / isError / data etc. Idempotent on
  // the server (repeat submits update the existing record instead of erroring).
  const optIn = useMutation<OptInResult, Error, typeof form>({
    mutationFn: async (payload) => {
      const r = await fetch('/api/optin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, company: 'Native125th' }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Something went wrong. Please try again.');
      return d as OptInResult;
    },
    onSuccess: (d) => {
      setModalOpen(true);
      if (d.consented) setForm({ name: '', phone: '', consent: false }); // clear after a real opt-in
    },
    onError: () => setModalOpen(true),
  });

  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  // Modal content reflects the resulting subscription STATE.
  let modal: { variant: ResultVariant; title: string; message: string } = { variant: 'info', title: '', message: '' };
  if (optIn.isError) {
    modal = { variant: 'error', title: 'Something went wrong', message: optIn.error?.message || 'Please try again.' };
  } else if (optIn.data?.consented) {
    modal = {
      variant: 'success', title: "You're subscribed! 🎉",
      message: "You'll get Native Harlem texts — events, specials, promotions, and reservation reminders. Reply STOP anytime to opt out, or HELP for help.",
    };
  } else if (optIn.data) {
    modal = {
      variant: 'info', title: 'Details saved — but not subscribed',
      message: "We saved your info, but you did NOT opt in to text messages. To receive Native Harlem texts, check the consent box and submit again.",
    };
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#1a1220', padding: 20, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 460, background: '#241a2e', border: '1px solid #3a2c47', borderRadius: 16, padding: 28, color: '#ece7f1' }}>
        <div style={{ fontSize: 13, letterSpacing: 2, color: '#d9b26a', fontWeight: 700 }}>NATIVE HARLEM</div>
        <h1 style={{ fontSize: 24, margin: '6px 0 4px' }}>Get our texts</h1>
        <p style={{ color: '#b6acc2', fontSize: 14, marginTop: 0 }}>
          Sunday brunch drops, event announcements and specials — straight to your phone.
        </p>

        <form onSubmit={(e) => { e.preventDefault(); optIn.mutate(form); }} style={{ marginTop: 18, display: 'grid', gap: 12 }}>
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
              <b style={{ color: '#d9b26a' }}>Optional:</b> By checking this box, I agree to receive recurring automated marketing
              text messages (events, specials, promotions, and reservation reminders) from Native Harlem at the number provided.
              Consent is not a condition of any purchase.
              Message frequency may vary. Message &amp; data rates may apply. Reply HELP for help and STOP to opt out.
              See our{' '}
              <a href="/privacy" style={{ color: '#d9b26a' }}>Privacy Policy</a> and{' '}
              <a href="/privacy#terms" style={{ color: '#d9b26a' }}>Terms &amp; Conditions</a>.
              Your mobile information will not be sold or shared with third parties for promotional or marketing purposes.
            </span>
          </label>

          <button type="submit" disabled={optIn.isPending}
            style={{ marginTop: 6, padding: '12px 14px', borderRadius: 10, border: 'none', background: '#d9b26a', color: '#241a2e', fontWeight: 700, fontSize: 15, cursor: optIn.isPending ? 'default' : 'pointer', opacity: optIn.isPending ? 0.7 : 1 }}>
            {optIn.isPending ? 'Submitting…' : 'Sign me up'}
          </button>
        </form>

        <p style={{ color: '#7d7390', fontSize: 11, marginTop: 18, lineHeight: 1.5 }}>
          Native Harlem · 2319 Frederick Douglass Blvd, New York, NY 10027 · 212 913 0226.
          Your mobile information will not be sold or shared with third parties for promotional or marketing purposes.
          Text messages are sent by Native Harlem.
        </p>
      </div>

      <ResultModal
        open={modalOpen}
        variant={modal.variant}
        title={modal.title}
        message={modal.message}
        actionLabel={optIn.isError ? 'Try again' : 'Done'}
        onClose={() => { setModalOpen(false); optIn.reset(); }}
      />
    </div>
  );
}
