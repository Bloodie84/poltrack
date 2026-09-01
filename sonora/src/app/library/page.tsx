import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import LibraryList, { type LibraryTrack } from '@/components/LibraryList';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getOrigin } from '@/lib/site';
import { formatCount, plural } from '@/lib/format';
import { EyeIcon, UploadIcon } from '@/components/icons';
import { profileHref } from '@/lib/types';

export const metadata: Metadata = { title: 'My tracks' };
export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=%2Flibrary');

  const guest = user.is_anonymous === true || !user.email;

  const { data: profile } = await supabase
    .from('profiles')
    .select('slug, short_id')
    .eq('id', user.id)
    .maybeSingle();

  const { data, error } = await supabase
    .from('tracks')
    .select(
      'id, short_id, slug, title, artist, description, genre, cover_url, duration, visibility, downloads_enabled, play_count, download_count, created_at, track_files(waveform)'
    )
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });

  const origin = await getOrigin();

  const tracks: LibraryTrack[] = (data ?? []).map((t) => {
    const file = Array.isArray(t.track_files) ? t.track_files[0] : t.track_files;
    return {
      id: t.id,
      short_id: t.short_id,
      slug: t.slug,
      title: t.title,
      artist: t.artist,
      description: t.description,
      genre: t.genre,
      cover_url: t.cover_url,
      duration: t.duration,
      visibility: t.visibility,
      downloads_enabled: t.downloads_enabled,
      play_count: t.play_count,
      download_count: t.download_count,
      created_at: t.created_at,
      waveform: Array.isArray(file?.waveform) ? (file.waveform as number[]) : null,
    };
  });

  const publicCount = tracks.filter((t) => t.visibility === 'public').length;
  const totalPlays = tracks.reduce((sum, t) => sum + t.play_count, 0);
  const totalDownloads = tracks.reduce((sum, t) => sum + t.download_count, 0);

  return (
    <div className="container">
      <div className="row row--between row--wrap" style={{ marginBottom: 20, gap: 14 }}>
        <div className="stack stack--4">
          <h1 style={{ fontSize: 26 }}>My tracks</h1>
          <p className="hint">
            {tracks.length} {plural(tracks.length, 'track')} · {formatCount(totalPlays)}{' '}
            {plural(totalPlays, 'play')} · {formatCount(totalDownloads)}{' '}
            {plural(totalDownloads, 'download')}
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {profile && publicCount > 0 && (
            <Link href={profileHref(profile)} className="btn">
              <EyeIcon size={15} /> Public page
            </Link>
          )}
          <Link href="/upload" className="btn btn--primary">
            <UploadIcon size={15} /> Upload
          </Link>
        </div>
      </div>

      {guest && tracks.length > 0 && (
        <div className="guest-note">
          <span>
            <strong>These tracks live in this browser.</strong> Clear your site data and you lose
            the way back to them — the links themselves keep working.
          </span>
          <Link href="/settings" className="btn btn--sm">Keep them</Link>
        </div>
      )}

      {error ? (
        <div className="alert alert--error">Could not load your tracks. Refresh to try again.</div>
      ) : (
        <LibraryList tracks={tracks} origin={origin} />
      )}
    </div>
  );
}
