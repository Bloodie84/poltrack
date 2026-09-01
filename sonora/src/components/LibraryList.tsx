'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import CoverArt from './CoverArt';
import Modal from './Modal';
import ShareSheet from './ShareSheet';
import StatsPanel from './StatsPanel';
import TrackEditModal, { type EditableTrack } from './TrackEditModal';
import { usePlayer } from './PlayerProvider';
import { useToast } from './Toast';
import { copyText } from '@/lib/clipboard';
import { formatCount, formatDate, formatTime, plural } from '@/lib/format';
import { trackHref, type Visibility } from '@/lib/types';
import {
  ChartIcon, DownloadIcon, EditIcon, LinkIcon, PauseIcon, PlayIcon, ShareIcon, TrashIcon,
} from './icons';

export interface LibraryTrack {
  id: string;
  short_id: string;
  slug: string;
  title: string;
  artist: string;
  description: string | null;
  genre: string | null;
  cover_url: string | null;
  duration: number;
  visibility: Visibility;
  downloads_enabled: boolean;
  play_count: number;
  download_count: number;
  created_at: string;
  waveform: number[] | null;
}

export default function LibraryList({
  tracks: initial,
  origin,
}: {
  tracks: LibraryTrack[];
  origin: string;
}) {
  const player = usePlayer();
  const toast = useToast();

  const [tracks, setTracks] = useState(initial);
  const [editing, setEditing] = useState<LibraryTrack | null>(null);
  const [sharing, setSharing] = useState<LibraryTrack | null>(null);
  const [openStats, setOpenStats] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<LibraryTrack | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const urlOf = useMemo(() => (t: LibraryTrack) => `${origin}${trackHref(t)}`, [origin]);

  const toggleDownloads = async (t: LibraryTrack) => {
    const next = !t.downloads_enabled;
    setTracks((list) => list.map((x) => (x.id === t.id ? { ...x, downloads_enabled: next } : x)));
    setBusyId(t.id);
    try {
      const res = await fetch(`/api/tracks/${t.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ downloadsEnabled: next }),
      });
      if (!res.ok) throw new Error();
      toast(next ? 'Downloads enabled' : 'Downloads disabled');
    } catch {
      setTracks((list) => list.map((x) => (x.id === t.id ? { ...x, downloads_enabled: !next } : x)));
      toast('Could not update downloads');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (t: LibraryTrack) => {
    setBusyId(t.id);
    try {
      const res = await fetch(`/api/tracks/${t.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setTracks((list) => list.filter((x) => x.id !== t.id));
      if (player.isCurrent(t.id)) player.close();
      toast('Track deleted');
    } catch {
      toast('Could not delete the track');
    } finally {
      setBusyId(null);
      setConfirmDelete(null);
    }
  };

  if (tracks.length === 0) {
    return (
      <div className="empty">
        <p className="empty__title">No tracks yet</p>
        <p style={{ marginBottom: 18 }}>Upload your first file and you will get a link to share.</p>
        <Link href="/upload" className="btn btn--primary">Upload a track</Link>
      </div>
    );
  }

  return (
    <>
      <ul className="tracklist">
        {tracks.map((t) => {
          const isCurrent = player.isCurrent(t.id);
          const playing = isCurrent && player.playing;
          return (
            <li key={t.id} className={`trackrow ${isCurrent ? 'trackrow--current' : ''}`}>
              <div className="trackrow__main">
                <button
                  type="button"
                  className="trackrow__play"
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
                  aria-label={playing ? `Pause ${t.title}` : `Play ${t.title}`}
                >
                  <CoverArt url={t.cover_url} alt="" size={46} radius={9} />
                  <span className="trackrow__playicon">
                    {playing ? <PauseIcon size={15} /> : <PlayIcon size={15} />}
                  </span>
                </button>

                <div className="trackrow__info">
                  <Link href={trackHref(t)} className="trackrow__title truncate">{t.title}</Link>
                  <div className="row row--wrap" style={{ gap: 7 }}>
                    <span className={`chip chip--${t.visibility}`}>{t.visibility}</span>
                    <span className="meta">{formatTime(t.duration)}</span>
                    <span className="meta__dot" />
                    <span className="meta">{formatCount(t.play_count)} {plural(t.play_count, 'play')}</span>
                    <span className="meta__dot" />
                    <span className="meta">
                      {formatCount(t.download_count)} {plural(t.download_count, 'download')}
                    </span>
                    <span className="meta__dot" />
                    <span className="meta">{formatDate(t.created_at)}</span>
                  </div>
                </div>

                <div className="trackrow__actions">
                  <button
                    type="button"
                    className={`btn btn--ghost btn--icon btn--sm ${t.downloads_enabled ? 'is-on' : ''}`}
                    onClick={() => toggleDownloads(t)}
                    disabled={busyId === t.id}
                    aria-pressed={t.downloads_enabled}
                    title={t.downloads_enabled ? 'Downloads on' : 'Downloads off'}
                    aria-label={t.downloads_enabled ? 'Disable downloads' : 'Enable downloads'}
                  >
                    <DownloadIcon size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon btn--sm"
                    onClick={async () => {
                      if (await copyText(urlOf(t))) toast('Link copied');
                      else toast('Could not copy the link');
                    }}
                    title="Copy link"
                    aria-label={`Copy link to ${t.title}`}
                  >
                    <LinkIcon size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon btn--sm"
                    onClick={() => setSharing(t)}
                    title="Share"
                    aria-label={`Share ${t.title}`}
                  >
                    <ShareIcon size={16} />
                  </button>
                  <button
                    type="button"
                    className={`btn btn--ghost btn--icon btn--sm ${openStats === t.id ? 'is-on' : ''}`}
                    onClick={() => setOpenStats((id) => (id === t.id ? null : t.id))}
                    title="Statistics"
                    aria-label={`Statistics for ${t.title}`}
                    aria-expanded={openStats === t.id}
                  >
                    <ChartIcon size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon btn--sm"
                    onClick={() => setEditing(t)}
                    title="Edit"
                    aria-label={`Edit ${t.title}`}
                  >
                    <EditIcon size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon btn--sm trackrow__delete"
                    onClick={() => setConfirmDelete(t)}
                    title="Delete"
                    aria-label={`Delete ${t.title}`}
                  >
                    <TrashIcon size={16} />
                  </button>
                </div>
              </div>

              {openStats === t.id && <StatsPanel trackId={t.id} />}
            </li>
          );
        })}
      </ul>

      {editing && (
        <TrackEditModal
          track={editing as EditableTrack}
          onClose={() => setEditing(null)}
          onSaved={(patch) =>
            setTracks((list) =>
              list.map((x) => (x.id === editing.id ? { ...x, ...patch } as LibraryTrack : x))
            )
          }
        />
      )}

      {sharing && (
        <ShareSheet
          url={urlOf(sharing)}
          title={sharing.title}
          artist={sharing.artist}
          onClose={() => setSharing(null)}
        />
      )}

      {confirmDelete && (
        <Modal label="Delete track" onClose={() => setConfirmDelete(null)}>
          <h2 style={{ fontSize: 17, marginBottom: 8 }}>Delete this track?</h2>
          <p className="hint" style={{ marginBottom: 18 }}>
            <strong style={{ color: 'var(--text-2)' }}>{confirmDelete.title}</strong> and its audio
            file will be permanently removed. Any link you shared will stop working.
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn btn--danger"
              style={{ flex: 1 }}
              onClick={() => remove(confirmDelete)}
              disabled={busyId === confirmDelete.id}
            >
              {busyId === confirmDelete.id && <span className="spinner" />} Delete
            </button>
            <button type="button" className="btn btn--outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
