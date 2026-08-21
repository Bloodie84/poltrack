'use client';

import { createBrowserClient } from '@supabase/ssr';
import { supabaseConfig } from '@/lib/env';
import type { Database } from './types';

export type BrowserClient = ReturnType<typeof createBrowserClient<Database>>;

let cached: BrowserClient | null = null;

/** Client navigateur, ou `null` si Supabase n'est pas configuré. */
export function getBrowserClient(): BrowserClient | null {
  const config = supabaseConfig();
  if (!config) return null;
  cached ??= createBrowserClient<Database>(config.url, config.key);
  return cached;
}
