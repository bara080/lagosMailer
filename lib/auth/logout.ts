'use client';

// Small client-side logout action the UI can call from any component
// (e.g. `onClick={() => logout()}`). Posts to the logout route to clear the
// httpOnly session cookie, then sends the user back to /login.
export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } finally {
    window.location.href = '/login';
  }
}
