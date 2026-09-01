import 'server-only';

import { createClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

let cached: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Service-role client. Bypasses RLS, so it must only ever be used inside route
 * handlers after the caller's permissions have been checked explicitly.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  if (!cached) {
    cached = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
