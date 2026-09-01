import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import TrackCardGrid, { type CardTrack } from '@/components/TrackCardGrid';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { shortIdFromParam } from '@/lib/slug';
import { absoluteUrl } from '@/lib/site';
import { formatCount, plural } from '@/lib/format';
import { profileHref } from '@/lib/types';
import { UploadIcon } from '@/components/icons';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ handle: string }> };

/**
 * An artist's public page. It lists `public` tracks and nothing else: unlisted
 * ones stay link-only and private ones are invisible even to a signed-in
 * visitor, exactly as everywhere else in the app.
 */
async function loadProfile(handle: string) {
  const shortId = shortIdFromParam(handle);
  if (!shortId) return null;

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, short_id, slug, bio, created_at')
    .eq('short_id', shortId)
    .maybeSingle();

  if (!profile) return null;

  const { data: tracks } = await supabase
    .from('tracks')
    .select(
      'id, short_id, slug, title, artist, cover_url, duration, play_count, downloads_enabled, track_files(waveform)'
    )
    .eq('owner_id', profile.id)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .limit(100);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { profile, tracks: tracks ?? [], isSelf: user?.id === profile.id };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { handle } = await params;
  const result = await loadProfile(handle);
  if (!result) return { title: 'Artist not found' };

  const { profile, tracks } = result;
  const description =
    profile.bio ??
    `${tracks.length} public ${plural(tracks.length, 'track')} by ${profile.display_name}.`;

  return {
    title: profile.display_name,
    description,
    alternates: { canonical: await absoluteUrl(profileHref(profile)) },
    openGraph: { type: 'profile', title: profile.display_name, description },
  };
}

export default async function ProfilePage({ params }: Params) {
  const { handle } = await params;
  const result = await loadProfile(handle);
  if (!result) notFound();

  const { profile, tracks, isSelf } = result;

  const cards: CardTrack[] = tracks.map((t) => {
    const file = Array.isArray(t.track_files) ? t.track_files[0] : t.track_files;
    return {
      id: t.id,
      short_id: t.short_id,
      slug: t.slug,
      title: t.title,
      artist: t.artist,
      cover_url: t.cover_url,
      duration: t.duration,
      play_count: t.play_count,
      downloads_enabled: t.downloads_enabled,
      waveform: Array.isArray(file?.waveform) ? (file.waveform as number[]) : null,
    };
  });

  const plays = tracks.reduce((sum, t) => sum + (t.play_count ?? 0), 0);
  const initial = profile.display_name.trim().charAt(0).toUpperCase() || '·';

  return (
    <div className="container fade-in">
      <header className="profile">
        <span className="profile__mark" aria-hidden="true">{initial}</span>
        <div className="stack stack--8" style={{ minWidth: 0 }}>
          <h1 className="profile__name">{profile.display_name}</h1>
          <p className="profile__counts">
            {tracks.length} public {plural(tracks.length, 'track')} · {formatCount(plays)}{' '}
            {plural(plays, 'play')}
          </p>
          {profile.bio && <p className="profile__bio">{profile.bio}</p>}
        </div>
        {isSelf && (
          <Link href="/library" className="btn btn--sm">Manage</Link>
        )}
      </header>

      {cards.length > 0 ? (
        <TrackCardGrid tracks={cards} showArtist={false} />
      ) : (
        <div className="empty">
          <p className="empty__title">Nothing public yet</p>
          <p style={{ marginBottom: isSelf ? 18 : 0 }}>
            {isSelf
              ? 'Tracks you set to public will show up here.'
              : 'This artist has not published anything publicly.'}
          </p>
          {isSelf && (
            <Link href="/upload" className="btn btn--primary">
              <UploadIcon size={15} /> Upload a track
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
