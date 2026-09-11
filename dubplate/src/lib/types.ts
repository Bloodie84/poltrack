export type Visibility = 'public' | 'unlisted' | 'private';

export interface Profile {
  id: string;
  display_name: string;
  short_id: string;
  slug: string;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export function profileHref(p: { slug: string; short_id: string }) {
  return `/u/${p.slug}-${p.short_id}`;
}

export interface Track {
  id: string;
  owner_id: string;
  short_id: string;
  slug: string;
  title: string;
  artist: string;
  description: string | null;
  genre: string | null;
  cover_url: string | null;
  cover_path: string | null;
  audio_path: string;
  duration: number;
  visibility: Visibility;
  downloads_enabled: boolean;
  play_count: number;
  download_count: number;
  created_at: string;
  updated_at: string;
}

export interface TrackFile {
  id: string;
  track_id: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  format: string | null;
  byte_size: number;
  duration: number | null;
  bitrate: number | null;
  sample_rate: number | null;
  channels: number | null;
  waveform: number[] | null;
  created_at: string;
}

export type TrackWithFile = Track & { track_files: TrackFile | TrackFile[] | null };

/** Shape used by the player everywhere in the app. */
export interface PlayableTrack {
  id: string;
  shortId: string;
  slug: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  duration: number;
  waveform: number[] | null;
  downloadsEnabled: boolean;
}

export function trackHref(t: { slug: string; short_id: string } | { slug: string; shortId: string }) {
  const shortId = 'short_id' in t ? t.short_id : t.shortId;
  return `/track/${t.slug}-${shortId}`;
}

export function toPlayable(t: Track, waveform: number[] | null = null): PlayableTrack {
  return {
    id: t.id,
    shortId: t.short_id,
    slug: t.slug,
    title: t.title,
    artist: t.artist,
    coverUrl: t.cover_url,
    duration: t.duration,
    waveform,
    downloadsEnabled: t.downloads_enabled,
  };
}

export function firstFile(t: TrackWithFile): TrackFile | null {
  const f = t.track_files;
  if (!f) return null;
  return Array.isArray(f) ? (f[0] ?? null) : f;
}
