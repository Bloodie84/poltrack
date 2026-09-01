import Link from 'next/link';
import TrackCardGrid, { type CardTrack } from '@/components/TrackCardGrid';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { MusicIcon, UploadIcon } from '@/components/icons';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Only `public` tracks are ever listed. Unlisted ones stay link-only.
  const { data } = await supabase
    .from('tracks')
    .select('id, short_id, slug, title, artist, cover_url, duration, play_count, downloads_enabled, track_files(waveform)')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .limit(6);

  const latest: CardTrack[] = (data ?? []).map((t) => {
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

  return (
    <div className="container">
      <section className="hero">
        <h1 className="hero__title">
          <span>Upload a track.</span>
          <br />
          <span>Get a link.</span>
          <br />
          <span>Send it.</span>
        </h1>
        <p className="hero__text">
          A quiet place to put your audio online. One link, a real player, and a download
          button when you want one. Whoever opens it listens straight away — no account needed.
        </p>

        <div className="hero__actions">
          {user ? (
            <>
              <Link href="/upload" className="btn btn--primary btn--lg">
                <UploadIcon size={16} /> Upload a track
              </Link>
              <Link href="/library" className="btn btn--outline btn--lg">
                <MusicIcon size={16} /> My tracks
              </Link>
            </>
          ) : (
            <>
              <Link href="/register" className="btn btn--primary btn--lg">Create account</Link>
              <Link href="/login" className="btn btn--outline btn--lg">Log in</Link>
            </>
          )}
        </div>
      </section>

      {latest.length > 0 && (
        <section style={{ marginTop: 56 }}>
          <h2 className="section-title" style={{ marginBottom: 16 }}>Latest public tracks</h2>
          <TrackCardGrid tracks={latest} />
        </section>
      )}
    </div>
  );
}
