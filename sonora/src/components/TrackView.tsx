'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import CoverArt from './CoverArt';
import ShareSheet from './ShareSheet';
import VisibilityChip from './VisibilityChip';
import Waveform from './Waveform';
import { usePlayer } from './PlayerProvider';
import { useToast } from './Toast';
import { copyText } from '@/lib/clipboard';
import {
  formatBitrate, formatCount, formatDate, formatSampleRate, formatTime, plural,
} from '@/lib/format';
import type { PlayableTrack } from '@/lib/types';
import {
  AlertIcon, ChevronRightIcon, DownloadIcon, EditIcon, LinkIcon, MuteIcon, PauseIcon,
  PlayIcon, RepeatIcon, ShareIcon, VolumeIcon,
} from './icons';

interface Props {
  track: PlayableTrack;
  shareUrl: string;
  description: string | null;
  genre: string | null;
  createdAt: string;
  playCount: number;
  isOwner: boolean;
  visibility: 'public' | 'unlisted' | 'private';
  /** The uploader's public page, when this track is public. */
  artistPage: { name: string; href: string } | null;
  fileInfo: {
    format: string | null;
    bitrate: number | null;
    sampleRate: number | null;
  } | null;
}

export default function TrackView({
  track, shareUrl, description, genre, createdAt, playCount, isOwner, visibility, fileInfo,
  artistPage,
}: Props) {
  const p = usePlayer();
  const toast = useToast();
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const isCurrent = p.isCurrent(track.id);
  const playing = isCurrent && p.playing;
  const duration = (isCurrent && p.duration) || track.duration || 0;
  const currentTime = isCurrent ? p.currentTime : 0;
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const onSeek = (ratio: number) => {
    if (isCurrent) p.seekRatio(ratio);
  };

  const copy = async () => {
    if (await copyText(shareUrl)) {
      setCopied(true);
      toast('Link copied');
    } else {
      toast('Could not copy the link');
    }
  };

  return (
    <article className="track fade-in">
      <div className="track__head">
        <CoverArt
          url={track.coverUrl}
          peaks={track.waveform}
          alt={`${track.title} cover`}
          className="track__cover"
          priority
        />

        <div className="track__intro">
          <div className="row row--wrap" style={{ gap: 8, marginBottom: 12 }}>
            <VisibilityChip value={visibility} />
            {genre && <span className="chip">{genre}</span>}
            {isOwner && (
              <Link href="/library" className="chip" style={{ gap: 5 }}>
                <EditIcon size={12} /> Manage
              </Link>
            )}
          </div>

          <h1 className="track__title">{track.title}</h1>
          <p className="track__artist">{track.artist}</p>

          {artistPage && (
            <Link href={artistPage.href} className="track__artist-link">
              All tracks by {artistPage.name} <ChevronRightIcon size={13} />
            </Link>
          )}

          <div className="row row--wrap track__meta">
            <span className="meta">{formatTime(track.duration)}</span>
            <span className="meta__dot" />
            <span className="meta">{formatCount(playCount)} {plural(playCount, 'play')}</span>
            <span className="meta__dot" />
            <span className="meta">{formatDate(createdAt)}</span>
            {fileInfo?.format && (
              <>
                <span className="meta__dot" />
                <span className="meta">{fileInfo.format.toUpperCase()}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <section className="track__player panel">
        <div className="track__transport">
          <button
            type="button"
            className="playbtn"
            onClick={() => (isCurrent ? p.toggle() : p.play(track))}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {isCurrent && p.loading && !playing ? (
              <span className="spinner" style={{ width: 20, height: 20 }} />
            ) : playing ? (
              <PauseIcon size={22} />
            ) : (
              <PlayIcon size={22} />
            )}
          </button>

          <div className="track__wave">
            <Waveform
              peaks={track.waveform}
              progress={progress}
              buffered={isCurrent ? p.buffered : 0}
              onSeek={onSeek}
              height={84}
              barWidth={3}
              gap={2}
              ariaLabel="Seek in track"
            />
            <div className="row row--between track__times">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        </div>

        {isCurrent && p.error && (
          <div className="alert alert--error" style={{ marginTop: 14 }} role="alert">
            <AlertIcon size={16} /> <span>{p.error}</span>
          </div>
        )}

        <div className="track__tools">
          <div className="row" style={{ gap: 4 }}>
            <button
              type="button"
              className={`btn btn--ghost btn--icon btn--sm ${p.repeat ? 'is-on' : ''}`}
              onClick={p.toggleRepeat}
              aria-pressed={p.repeat}
              title="Repeat"
              aria-label="Repeat"
            >
              <RepeatIcon size={16} />
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--icon btn--sm"
              onClick={p.toggleMute}
              title={p.muted ? 'Unmute' : 'Mute'}
              aria-label={p.muted ? 'Unmute' : 'Mute'}
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

          <div className="spacer" />

          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn--sm" onClick={copy}>
              <LinkIcon size={15} /> {copied ? 'Copied' : 'Copy link'}
            </button>
            <button type="button" className="btn btn--sm" onClick={() => setShareOpen(true)}>
              <ShareIcon size={15} /> Share
            </button>
            {(track.downloadsEnabled || isOwner) && (
              <a className="btn btn--sm btn--primary" href={`/api/download/${track.id}`}>
                <DownloadIcon size={15} /> Download
              </a>
            )}
          </div>
        </div>
      </section>

      {description && (
        <section className="track__description">
          <h2 className="section-title" style={{ marginBottom: 10 }}>About</h2>
          <p>{description}</p>
        </section>
      )}

      {fileInfo && (fileInfo.bitrate || fileInfo.sampleRate) && (
        <section className="track__specs">
          {fileInfo.format && <span><b>{fileInfo.format.toUpperCase()}</b> format</span>}
          {fileInfo.bitrate ? <span><b>{formatBitrate(fileInfo.bitrate)}</b></span> : null}
          {fileInfo.sampleRate ? <span><b>{formatSampleRate(fileInfo.sampleRate)}</b></span> : null}
        </section>
      )}

      {shareOpen && (
        <ShareSheet
          url={shareUrl}
          title={track.title}
          artist={track.artist}
          onClose={() => setShareOpen(false)}
        />
      )}
    </article>
  );
}
