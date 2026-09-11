import 'server-only';

import { createAdminClient } from './supabase/admin';

export interface ViewableTrack {
  id: string;
  owner_id: string;
  audio_path: string;
  visibility: 'public' | 'unlisted' | 'private';
  downloads_enabled: boolean;
  title: string;
  artist: string;
  original_filename: string | null;
}

/**
 * Loads a track by its id for playback or download.
 *
 * Row Level Security cannot be the gate here: an unlisted track is invisible
 * to a bulk reader by design, and these routes have to serve it to whoever
 * holds the link. So the id — 128 unguessable bits — is the capability, and
 * the visibility rule is applied here, in the open, before the service role is
 * used for anything.
 *
 * Returns null when the caller may not have it, so a caller can answer 404
 * without distinguishing "absent" from "not yours".
 */
export async function loadTrackForViewer(
  id: string,
  viewerId: string | null
): Promise<ViewableTrack | null> {
  const admin = createAdminClient();

  const { data } = await admin
    .from('tracks')
    .select('id, owner_id, audio_path, visibility, downloads_enabled, title, artist, track_files(original_filename)')
    .eq('id', id)
    .maybeSingle();

  if (!data?.audio_path) return null;
  if (data.visibility === 'private' && data.owner_id !== viewerId) return null;

  // A row must never name a file its owner does not own. The database refuses
  // to store one (tracks_audio_path_owned), and this refuses to sign one, so a
  // row written before that constraint existed cannot be used either.
  if (!data.audio_path.startsWith(`${data.owner_id}/`)) {
    console.error(`Refusing to sign ${data.audio_path}: outside owner ${data.owner_id}`);
    return null;
  }

  const files = data.track_files as { original_filename: string }[] | { original_filename: string } | null;
  const originalName = Array.isArray(files) ? files[0]?.original_filename : files?.original_filename;

  return {
    id: data.id,
    owner_id: data.owner_id,
    audio_path: data.audio_path,
    visibility: data.visibility,
    downloads_enabled: data.downloads_enabled,
    title: data.title,
    artist: data.artist,
    original_filename: originalName ?? null,
  };
}
