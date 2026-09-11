import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadTrackForViewer } from '@/lib/track-access';
import { listenerHash } from '@/lib/listener';
import { fail } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Original-file download. Enforced server side: a visitor only ever gets a
 * signed URL when `downloads_enabled` is true. Hiding the button is not the
 * protection — this check is.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail('Not found.', 404);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const track = await loadTrackForViewer(id, user?.id ?? null);
  if (!track) return fail('Not found.', 404);

  const isOwner = user?.id === track.owner_id;
  if (!track.downloads_enabled && !isOwner) {
    return fail('Downloads are turned off for this track.', 403);
  }

  const extension = track.original_filename?.includes('.')
    ? track.original_filename.slice(track.original_filename.lastIndexOf('.'))
    : '';
  const downloadName = `${track.artist} - ${track.title}${extension}`.replace(/[\\/:*?"<>|]/g, '_');

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from('audio')
    .createSignedUrl(track.audio_path, 120, { download: downloadName });

  if (error || !data?.signedUrl) return fail('This file is temporarily unavailable.', 503);

  // Owners downloading their own track are not counted as a listener download.
  if (!isOwner) {
    try {
      await admin.from('downloads').insert({
        track_id: track.id,
        listener_hash: listenerHash(request, user?.id ?? null),
        user_id: user?.id ?? null,
      });
      await admin.rpc('increment_download', { p_track_id: track.id });
    } catch {
      /* statistics must never block a download */
    }
  }

  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    headers: { 'Cache-Control': 'no-store' },
  });
}
