'use client';

import Link from 'next/link';
import { usePlayer } from './PlayerProvider';
import Waveform from './Waveform';
import CoverArt from './CoverArt';
import { formatTime } from '@/lib/format';
import { trackHref } from '@/lib/types';
import {
  CloseIcon, MuteIcon, PauseIcon, PlayIcon, RepeatIcon, VolumeIcon,
} from './icons';

export default function MiniPlayer() {
  const p = usePlayer();
  const track = p.track;
  if (!track) return null;

  const duration = p.duration || track.duration || 0;
  const progress = duration > 0 ? Math.min(1, p.currentTime / duration) : 0;
  const href = trackHref(track);

  return (
    <div className="mini" role="region" aria-label="Player">
      <div className="mini__mobile-progress" aria-hidden="true">
        <span style={{ width: `${progress * 100}%` }} />
      </div>

      <div className="mini__inner">
        <Link href={href} className="mini__id" aria-label={`Open ${track.title}`}>
          <CoverArt url={track.coverUrl} peaks={track.waveform} alt="" size={40} radius={4} />
          <span className="mini__text">
            <span className="mini__title truncate">{track.title}</span>
            <span className="mini__artist truncate">{track.artist}</span>
          </span>
        </Link>

        <button
          type="button"
          className="mini__play"
          onClick={() => p.toggle()}
          aria-label={p.playing ? 'Pause' : 'Play'}
        >
          {p.loading && !p.playing ? (
            <span className="spinner" />
          ) : p.playing ? (
            <PauseIcon size={16} />
          ) : (
            <PlayIcon size={16} />
          )}
        </button>

        <div className="mini__scrub">
          <span className="mini__time">{formatTime(p.currentTime)}</span>
          <Waveform
            peaks={track.waveform}
            progress={progress}
            buffered={p.buffered}
            onSeek={p.seekRatio}
            height={28}
            barWidth={2}
            gap={1}
            ariaLabel="Seek in track"
          />
          <span className="mini__time">{formatTime(duration)}</span>
        </div>

        <div className="mini__controls">
          <button
            type="button"
            className={`btn btn--ghost btn--icon btn--sm ${p.repeat ? 'is-on' : ''}`}
            onClick={p.toggleRepeat}
            aria-pressed={p.repeat}
            aria-label="Repeat"
            title="Repeat"
          >
            <RepeatIcon size={16} />
          </button>

          <div className="mini__volume">
            <button
              type="button"
              className="btn btn--ghost btn--icon btn--sm"
              onClick={p.toggleMute}
              aria-label={p.muted ? 'Unmute' : 'Mute'}
              title={p.muted ? 'Unmute' : 'Mute'}
            >
              {p.muted || p.volume === 0 ? <MuteIcon size={16} /> : <VolumeIcon size={16} />}
            </button>
            <input
              className="range"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={p.muted ? 0 : p.volume}
              onChange={(e) => p.setVolume(Number(e.target.value))}
              aria-label="Volume"
            />
          </div>

          <button
            type="button"
            className="btn btn--ghost btn--icon btn--sm"
            onClick={p.close}
            aria-label="Close player"
            title="Close player"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
