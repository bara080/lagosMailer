'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import './login.css';

// Login page. Ports zinga-os's (auth)/login/page.tsx behaviour (email +
// password form, error state, ?reason= notice, POST to /api/auth/login) but
// drops the shadcn/react-hook-form/zod dependencies in favour of plain React
// and the app's own dark theme.
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Surface why the user landed here (mirrors zinga's ?reason= handling).
  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get('reason');
    if (reason === 'timeout') setNotice('You were signed out after a period of inactivity.');
    else if (reason === 'expired') setNotice('Your session expired. Please sign in again.');
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || 'Login failed');
      }
      router.push('/');
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="lm-login">
      <div className="lm-login__card">
        <h1 className="lm-login__title">lagosMailer</h1>
        <p className="lm-login__subtitle">Sign in to your account</p>

        {notice && <p className="lm-login__notice">{notice}</p>}
        {err && <p className="lm-login__error">{err}</p>}

        <form onSubmit={onSubmit}>
          <div className="lm-login__field">
            <label className="lm-login__label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="lm-login__input"
              type="email"
              autoComplete="email"
              placeholder="admin@lagosmailer.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="lm-login__field">
            <label className="lm-login__label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="lm-login__input"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button className="lm-login__button" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
