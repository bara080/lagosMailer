// Server-only Supabase client, lazily initialized with the SERVICE ROLE key
// (bypasses Row Level Security). The client is created on first use so that
// `next build` does not crash before the environment variables are set.
import { createClient } from '@supabase/supabase-js';

let client = null;

export function getSupabase() {
  if (client) return client;

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Accept the new Supabase key format (SUPABASE_SECRET_KEY, sb_secret_…) or the
  // legacy service-role JWT (SUPABASE_SERVICE_ROLE_KEY). Both bypass RLS.
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Supabase is not configured: set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).',
    );
  }

  client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
