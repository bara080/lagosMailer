'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export default function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({
      defaultOptions: {
        queries: {
          // Refresh when the user returns to the tab and when the network
          // reconnects, so lists (campaigns, leads, stats) don't show stale state.
          refetchOnWindowFocus: true,
          refetchOnReconnect: true,
          retry: 1,
        },
      },
    }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
