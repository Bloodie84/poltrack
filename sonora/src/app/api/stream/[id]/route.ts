import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fail } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIGNED_TTL_SECONDS = 60 * 60;

/**
 * Streaming entry point. The permission check happens here, against RLS: if the
 * caller is not allowed to see the track the query simply returns nothing.
 * We then redirect to a short-lived signed storage URL, which supports HTTP
 * range requests — playback starts immediately and seeking does not download
 * the whole file.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail('Not found.', 404);

  const supabase = await createSupabaseServerClient();
  const { data: track } = await supabase
    .from('tracks')
    .select('id, audio_path')
    .eq('id', id)
    .maybeSingle();

  if (!track?.audio_path) return fail('Not found.', 404);

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from('audio')
    .createSignedUrl(track.audio_path as string, SIGNED_TTL_SECONDS);

  if (error || !data?.signedUrl) return fail('This track is temporarily unavailable.', 503);

  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    headers: { 'Cache-Control': 'private, max-age=300' },
  });
}
