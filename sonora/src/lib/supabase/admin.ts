import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { requireEnv } from '../env';
import type { Database } from './database.types';

let cached: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Service-role client. Bypasses RLS, so it must only ever be used inside route
 * handlers after the caller's permissions have been checked explicitly.
 */
export function createAdminClient() {
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  if (!cached) {
    cached = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
