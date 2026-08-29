'use client';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import Sidebar from './Sidebar';

// Renders the app shell (sidebar + content) for authenticated pages only.
// Bare routes like /login must NOT show the nav shell — rendering it there
// leaks the app surface to unauthenticated visitors.
const BARE_ROUTES = ['/login', '/optin', '/privacy'];

export default function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (BARE_ROUTES.includes(pathname)) return <>{children}</>;
  return (
    <div className="app">
      <Sidebar />
      <div className="content">{children}</div>
    </div>
  );
}
