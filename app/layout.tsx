import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Providers from '@/components/Providers';
import Shell from '@/components/Shell';

export const metadata: Metadata = {
  title: 'lagosMailer CRM',
  description: 'Email outreach CRM + blast tool',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
