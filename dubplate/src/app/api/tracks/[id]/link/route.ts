import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { fail, json } from '@/lib/validation';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/** A year is already far past the point where "temporary" means anything. */
const MAX_AHEAD_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * The owner's controls on a link: a password, and a date it stops working.
 *
 * The password is never hashed here. `set_track_password` does it inside the
 * database, checks ownership against auth.uid() rather than trusting this
 * route, and refuses anything shorter than six characters — so there is no path
 * by which a plain password is stored or a hash is read back out.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('You must be signed in.', 401);

  let body: { password?: unknown; expiresAt?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail('Invalid request body.');
  }

  if ('password' in body) {
    const password = body.password === null ? null : String(body.password);
    if (password !== null && password.length > 0 && password.length < 6) {
      return fail('A link password must be at least 6 characters.');
    }
    const { data: ok, error } = await supabase.rpc('set_track_password', {
      p_track_id: id,
      p_password: password && password.length ? password : null,
    });
    if (error) return fail(error.message, 500);
    if (!ok) return fail('Track not found.', 404);
  }

  if ('expiresAt' in body) {
    let expiresAt: string | null = null;
    if (body.expiresAt !== null && body.expiresAt !== '') {
      const at = new Date(String(body.expiresAt));
      if (Number.isNaN(at.getTime())) return fail('That is not a valid date.');
      if (at.getTime() > Date.now() + MAX_AHEAD_MS) {
        return fail('An expiry that far ahead is the same as no expiry.');
      }
      expiresAt = at.toISOString();
    }
    // RLS restricts this update to the caller's own rows.
    const { data, error } = await supabase
      .from('tracks')
      .update({ expires_at: expiresAt })
      .eq('id', id)
      .eq('owner_id', user.id)
      .select('id')
      .maybeSingle();
    if (error) return fail(error.message, 500);
    if (!data) return fail('Track not found.', 404);
  }

  const { data: track } = await supabase
    .from('tracks')
    .select('expires_at, has_password')
    .eq('id', id)
    .eq('owner_id', user.id)
    .maybeSingle();

  return json({
    expiresAt: track?.expires_at ?? null,
    hasPassword: Boolean(track?.has_password),
  });
}
