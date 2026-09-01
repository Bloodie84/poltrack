import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import TrackView from '@/components/TrackView';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { shortIdFromParam } from '@/lib/slug';
import { absoluteUrl } from '@/lib/site';
import { profileHref, trackHref } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

const SELECT =
  'id, owner_id, short_id, slug, title, artist, description, genre, cover_url, duration, visibility, downloads_enabled, play_count, created_at, track_files(format, bitrate, sample_rate, waveform)';

/** RLS decides what comes back: a private track is simply not there for others. */
async function loadTrack(slugParam: string) {
  const shortId = shortIdFromParam(slugParam);
  if (!shortId) return null;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('tracks').select(SELECT).eq('short_id', shortId).maybeSingle();
  if (!data) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The artist page is only offered for a track that is public itself —
  // linking from an unlisted page would point at a listing it is not part of.
  let profile: { display_name: string; slug: string; short_id: string } | null = null;
  if (data.visibility === 'public') {
    const { data: owner } = await supabase
      .from('profiles')
      .select('display_name, slug, short_id')
      .eq('id', data.owner_id)
      .maybeSingle();
    profile = owner ?? null;
  }

  return { track: data, viewerId: user?.id ?? null, profile };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadTrack(slug);
  if (!result) return { title: 'Track not found' };

  const { track } = result;
  const url = await absoluteUrl(trackHref(track));
  const listed = track.visibility === 'public';

  return {
    title: `${track.title} — ${track.artist}`,
    description: track.description ?? `Listen to ${track.title} by ${track.artist}.`,
    alternates: { canonical: url },
    robots: listed ? undefined : { index: false, follow: false },
    openGraph: {
      type: 'music.song',
      title: `${track.title} — ${track.artist}`,
      description: track.description ?? `Listen to ${track.title} by ${track.artist}.`,
      url,
      images: track.cover_url ? [{ url: track.cover_url }] : undefined,
    },
    twitter: {
      card: track.cover_url ? 'summary_large_image' : 'summary',
      title: `${track.title} — ${track.artist}`,
      images: track.cover_url ? [track.cover_url] : undefined,
    },
  };
}

export default async function TrackPage({ params }: Params) {
  const { slug } = await params;
  const result = await loadTrack(slug);
  if (!result) notFound();

  const { track, viewerId, profile } = result;
  const file = Array.isArray(track.track_files) ? track.track_files[0] : track.track_files;
  const waveform = Array.isArray(file?.waveform) ? (file.waveform as number[]) : null;
  const shareUrl = await absoluteUrl(trackHref(track));

  return (
    <div className="container">
      <TrackView
        track={{
          id: track.id,
          shortId: track.short_id,
          slug: track.slug,
          title: track.title,
          artist: track.artist,
          coverUrl: track.cover_url,
          duration: track.duration,
          waveform,
          downloadsEnabled: track.downloads_enabled,
        }}
        shareUrl={shareUrl}
        description={track.description}
        genre={track.genre}
        createdAt={track.created_at}
        playCount={track.play_count}
        isOwner={viewerId === track.owner_id}
        visibility={track.visibility}
        artistPage={profile ? { name: profile.display_name, href: profileHref(profile) } : null}
        fileInfo={
          file
            ? { format: file.format, bitrate: file.bitrate, sampleRate: file.sample_rate }
            : null
        }
      />
    </div>
  );
}
