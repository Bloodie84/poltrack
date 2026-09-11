import 'server-only';

import { createAdminClient } from './supabase/admin';
import { hasUnlockPass } from './unlock';

export interface ViewableTrack {
  id: string;
  owner_id: string;
  /** The master: what a download serves, always. */
  audio_path: string;
  /** The lighter copy, when one was made: what playback serves. */
  stream_path: string | null;
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
 * The link's own controls are applied here too: a link that has expired stops
 * serving audio, and a link behind a password serves it only to a browser
 * carrying a valid pass. Hiding the buttons would not be security — the routes
 * that sign storage URLs are the ones that have to refuse.
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
    .select(
      'id, owner_id, short_id, audio_path, visibility, downloads_enabled, title, artist, expires_at, has_password, track_files(original_filename, stream_path)'
    )
    .eq('id', id)
    .maybeSingle();

  if (!data?.audio_path) return null;

  const isOwner = data.owner_id === viewerId;
  if (data.visibility === 'private' && !isOwner) return null;

  if (!isOwner) {
    if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return null;
    if (data.has_password && !(await hasUnlockPass(data.short_id))) return null;
  }

  // A row must never name a file its owner does not own. The database refuses
  // to store one (tracks_audio_path_owned), and this refuses to sign one, so a
  // row written before that constraint existed cannot be used either.
  if (!data.audio_path.startsWith(`${data.owner_id}/`)) {
    console.error(`Refusing to sign ${data.audio_path}: outside owner ${data.owner_id}`);
    return null;
  }

  type FileRow = { original_filename: string; stream_path: string | null };
  const files = data.track_files as FileRow[] | FileRow | null;
  const file = Array.isArray(files) ? files[0] : files;

  // The same rule as the master: a path outside the owner's folder is not
  // signed, whatever the row says.
  const streamPath =
    file?.stream_path && file.stream_path.startsWith(`${data.owner_id}/`) ? file.stream_path : null;

  return {
    id: data.id,
    owner_id: data.owner_id,
    audio_path: data.audio_path,
    stream_path: streamPath,
    visibility: data.visibility,
    downloads_enabled: data.downloads_enabled,
    title: data.title,
    artist: data.artist,
    original_filename: file?.original_filename ?? null,
  };
}

/**
 * The listening page's view of a track that is behind a password, loaded only
 * once the pass has been verified.
 *
 * Every other path to a track page goes through `track_by_short_id`, so the
 * database stays the authority on who may read what. This is the one exception,
 * and it is the same shape as the exception above: the check happens here, in
 * the open, and the service role is reached only after it passes. A locked
 * track is invisible to that function by design — that is what makes the lock
 * real — so there has to be something on this side of it.
 */
export interface SharedTrack {
  id: string;
  owner_id: string;
  short_id: string;
  slug: string;
  title: string;
  artist: string;
  description: string | null;
  genre: string | null;
  cover_url: string | null;
  duration: number;
  visibility: 'public' | 'unlisted' | 'private';
  downloads_enabled: boolean;
  play_count: number;
  created_at: string;
  format: string | null;
  bitrate: number | null;
  sample_rate: number | null;
  waveform: unknown;
}

export async function loadUnlockedTrack(
  shortId: string,
  viewerId: string | null
): Promise<SharedTrack | null> {
  if (!(await hasUnlockPass(shortId))) return null;

  const { data } = await createAdminClient()
    .from('tracks')
    // One literal: the client infers the row type from the text of the select.
    .select('id, owner_id, short_id, slug, title, artist, description, genre, cover_url, duration, visibility, downloads_enabled, play_count, created_at, expires_at, track_files(format, bitrate, sample_rate, waveform)')
    .eq('short_id', shortId)
    .maybeSingle();

  if (!data) return null;
  // The pass answers for the password and for nothing else: a private track is
  // still the owner's alone, and an expired link is still expired.
  if (data.visibility === 'private' && data.owner_id !== viewerId) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return null;

  const files = data.track_files as
    | { format: string | null; bitrate: number | null; sample_rate: number | null; waveform: unknown }[]
    | { format: string | null; bitrate: number | null; sample_rate: number | null; waveform: unknown }
    | null;
  const file = Array.isArray(files) ? files[0] : files;

  return {
    id: data.id,
    owner_id: data.owner_id,
    short_id: data.short_id,
    slug: data.slug,
    title: data.title,
    artist: data.artist,
    description: data.description,
    genre: data.genre,
    cover_url: data.cover_url,
    duration: data.duration,
    visibility: data.visibility,
    downloads_enabled: data.downloads_enabled,
    play_count: data.play_count,
    created_at: data.created_at,
    format: file?.format ?? null,
    bitrate: file?.bitrate ?? null,
    sample_rate: file?.sample_rate ?? null,
    waveform: file?.waveform ?? null,
  };
}
