import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import TrackView from '@/components/TrackView';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { shortIdFromParam } from '@/lib/slug';
import { absoluteUrl } from '@/lib/site';
import { profileHref, trackHref } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

/**
 * Resolves a shared link. Goes through `track_by_short_id` rather than a plain
 * select: unlisted tracks are no longer readable in bulk, so the secret id has
 * to be handed to the database as an argument — which is what makes the link,
 * and only the link, the way in.
 */
async function loadTrack(slugParam: string) {
  const shortId = shortIdFromParam(slugParam);
  if (!shortId) return null;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc('track_by_short_id', { p_short_id: shortId });
  const track = Array.isArray(data) ? data[0] : data;
  if (!track) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The artist page is only offered for a track that is public itself —
  // linking from an unlisted page would point at a listing it is not part of.
  let profile: { display_name: string; slug: string; short_id: string } | null = null;
  if (track.visibility === 'public') {
    const { data: owner } = await supabase
      .from('profiles')
      .select('display_name, slug, short_id')
      .eq('id', track.owner_id)
      .maybeSingle();
    profile = owner ?? null;
  }

  return { track, viewerId: user?.id ?? null, profile };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadTrack(slug);
  if (!result) return { title: 'Track not found' };

  const { track } = result;
  const url = await absoluteUrl(trackHref(track));
  const listed = track.visibility === 'public';

  // No `images` here on purpose: opengraph-image.tsx next to this file is the
  // preview, and declaring images in metadata would override that convention.
  // Every track gets a card — artwork or not — so the large-image layout always
  // holds, where before a track without a cover unfurled as a bare line of text.
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
    },
    twitter: {
      card: 'summary_large_image',
      title: `${track.title} — ${track.artist}`,
      description: track.description ?? `Listen to ${track.title} by ${track.artist}.`,
    },
  };
}

export default async function TrackPage({ params }: Params) {
  const { slug } = await params;
  const result = await loadTrack(slug);
  if (!result) notFound();

  const { track, viewerId, profile } = result;
  const waveform = Array.isArray(track.waveform) ? (track.waveform as number[]) : null;
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
          track.format || track.bitrate || track.sample_rate
            ? { format: track.format, bitrate: track.bitrate, sampleRate: track.sample_rate }
            : null
        }
      />
    </div>
  );
}
