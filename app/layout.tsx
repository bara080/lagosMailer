import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Providers from '@/components/Providers';
import Sidebar from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'lagosMailer CRM',
  description: 'Email outreach CRM + blast tool',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="app">
            <Sidebar />
            <div className="content">{children}</div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
