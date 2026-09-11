'use client';

import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from './database.types';

export class AnonymousSignInDisabledError extends Error {
  constructor() {
    super(
      'Uploading without an account is turned off for this project. ' +
        'Log in, or enable anonymous sign-ins in Supabase (Authentication → Sign In / Providers).'
    );
    this.name = 'AnonymousSignInDisabledError';
  }
}

/**
 * Returns the current user, creating an anonymous one if there is none.
 *
 * This is what lets somebody upload without registering: they get a real
 * Supabase identity — so every Row Level Security policy keeps working exactly
 * as it does for a registered account — they just never type an e-mail. They
 * can attach one later without losing anything.
 */
export async function ensureSession(supabase: SupabaseClient<Database>): Promise<User> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return user;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    const disabled = /anonymous/i.test(error?.message ?? '') || error?.status === 422;
    throw disabled ? new AnonymousSignInDisabledError() : new Error(error?.message ?? 'Could not start a session.');
  }
  return data.user;
}

/** True when the account has no e-mail attached yet. */
export function isGuest(user: { is_anonymous?: boolean; email?: string | null } | null): boolean {
  if (!user) return false;
  return user.is_anonymous === true || !user.email;
}
