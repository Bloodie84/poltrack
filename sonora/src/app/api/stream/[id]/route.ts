import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadTrackForViewer } from '@/lib/track-access';
import { fail } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIGNED_TTL_SECONDS = 10 * 60;

/**
 * Streaming entry point. The permission check happens in loadTrackForViewer,
 * before the service role touches storage. We then redirect to a short-lived
 * signed URL, which supports HTTP range requests — playback starts immediately
 * and seeking does not download the whole file.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail('Not found.', 404);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const track = await loadTrackForViewer(id, user?.id ?? null);
  if (!track) return fail('Not found.', 404);

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from('audio')
    .createSignedUrl(track.audio_path, SIGNED_TTL_SECONDS);

  if (error || !data?.signedUrl) return fail('This track is temporarily unavailable.', 503);

  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    headers: { 'Cache-Control': 'private, max-age=60' },
  });
}
