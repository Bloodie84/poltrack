'use client';

import Link from 'next/link';
import CoverArt from './CoverArt';
import NowPlaying from './NowPlaying';
import { usePlayer } from './PlayerProvider';
import { formatCount, formatTime, plural } from '@/lib/format';
import { trackHref } from '@/lib/types';
import { PauseIcon, PlayIcon } from './icons';

export interface CardTrack {
  id: string;
  short_id: string;
  slug: string;
  title: string;
  artist: string;
  cover_url: string | null;
  duration: number;
  play_count: number;
  downloads_enabled: boolean;
  waveform: number[] | null;
}

export default function TrackCardGrid({ tracks }: { tracks: CardTrack[] }) {
  const player = usePlayer();

  return (
    <ul className="cardgrid">
      {tracks.map((t) => {
        const isCurrent = player.isCurrent(t.id);
        const playing = isCurrent && player.playing;
        return (
          <li key={t.id} className="trackcard">
            <button
              type="button"
              className="trackcard__cover"
              aria-label={playing ? `Pause ${t.title}` : `Play ${t.title}`}
              onClick={() =>
                isCurrent
                  ? player.toggle()
                  : player.play({
                      id: t.id,
                      shortId: t.short_id,
                      slug: t.slug,
                      title: t.title,
                      artist: t.artist,
                      coverUrl: t.cover_url,
                      duration: t.duration,
                      waveform: t.waveform,
                      downloadsEnabled: t.downloads_enabled,
                    })
              }
            >
              <CoverArt url={t.cover_url} peaks={t.waveform} alt="" />
              <span className={`trackcard__play ${isCurrent ? 'is-current' : ''}`}>
                {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
              </span>
              {isCurrent && (
                <span className="trackcard__levels">
                  <NowPlaying paused={!playing} />
                </span>
              )}
            </button>
            <Link href={trackHref(t)} className="trackcard__title truncate">{t.title}</Link>
            <span className="trackcard__artist truncate">{t.artist}</span>
            <span className="trackcard__meta">
              {formatTime(t.duration)} · {formatCount(t.play_count)} {plural(t.play_count, 'play')}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
