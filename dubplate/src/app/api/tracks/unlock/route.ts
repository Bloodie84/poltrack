import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isSecureRequest, unlockCookie } from '@/lib/unlock';
import { fail } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Opens a password-protected link.
 *
 * The comparison happens inside the database — `track_unlock` is the only thing
 * that ever touches the hash — and it answers with the track id or with nothing
 * at all. Nothing here distinguishes a wrong password from an expired link or a
 * short id that was never real, so the response cannot be used to learn which
 * links exist.
 *
 * Success sets an HttpOnly cookie signed for that one track. It is the pass the
 * page, the stream and the download all check; no session is stored on the
 * server, and a pass for one track proves nothing about another.
 */
export async function POST(request: NextRequest) {
  let body: { shortId?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail('Invalid request body.');
  }

  const shortId = typeof body.shortId === 'string' ? body.shortId.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!/^[0-9a-f]{12}$/.test(shortId)) return fail('That link is not valid.', 400);
  if (!password) return fail('Enter the password.', 400);

  const supabase = await createSupabaseServerClient();
  const { data: trackId } = await supabase.rpc('track_unlock', {
    p_short_id: shortId,
    p_password: password,
  });

  if (!trackId) return fail('That password does not open this link.', 401);

  // NextResponse, not Response.json: a plain Response has its headers guarded,
  // and Set-Cookie is one of the names that guard silently drops.
  const cookie = unlockCookie(shortId, isSecureRequest(request));
  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
