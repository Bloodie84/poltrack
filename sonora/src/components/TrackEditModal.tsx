'use client';

import { useState } from 'react';
import CoverArt from './CoverArt';
import Switch from './Switch';
import VisibilityPicker from './VisibilityPicker';
import { useToast } from './Toast';
import { imageMime } from '@/lib/mime';
import { putToSignedUrl, requestSignedUpload } from '@/lib/uploadClient';
import type { Visibility } from '@/lib/types';
import Modal from './Modal';
import { AlertIcon, CloseIcon, ImageIcon } from './icons';

export interface EditableTrack {
  id: string;
  title: string;
  artist: string;
  description: string | null;
  genre: string | null;
  visibility: Visibility;
  downloads_enabled: boolean;
  cover_url: string | null;
}

export default function TrackEditModal({
  track,
  onClose,
  onSaved,
}: {
  track: EditableTrack;
  onClose: () => void;
  onSaved: (patch: Partial<EditableTrack> & { slug?: string; short_id?: string }) => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist);
  const [description, setDescription] = useState(track.description ?? '');
  const [genre, setGenre] = useState(track.genre ?? '');
  const [visibility, setVisibility] = useState<Visibility>(track.visibility);
  const [downloads, setDownloads] = useState(track.downloads_enabled);
  const [coverPreview, setCoverPreview] = useState<string | null>(track.cover_url);
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickCover = async (file: File) => {
    if (!/\.(jpe?g|png|webp|avif)$/i.test(file.name)) {
      toast('Cover must be a JPG, PNG, WebP or AVIF image');
      return;
    }
    setCoverBusy(true);
    try {
      const target = await requestSignedUpload('cover', file);
      await putToSignedUrl(target, file, imageMime(file.name, file.type || undefined), () => {});
      setCoverPath(target.path);
      setCoverPreview(URL.createObjectURL(file));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Cover upload failed');
    } finally {
      setCoverBusy(false);
    }
  };

  const save = async () => {
    if (!title.trim() || !artist.trim()) {
      setError('Title and artist are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tracks/${track.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          artist,
          description,
          genre,
          visibility,
          downloadsEnabled: downloads,
          ...(coverPath ? { coverPath } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Could not save your changes.');
      onSaved(body.track);
      toast('Changes saved');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your changes.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal label="Edit track" onClose={onClose} width={520}>
      <div className="row row--between" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 17 }}>Edit track</h2>
        <button type="button" className="btn btn--ghost btn--icon btn--sm" onClick={onClose} aria-label="Close">
          <CloseIcon size={16} />
        </button>
      </div>

      <div className="stack stack--16">
        {error && (
          <div className="alert alert--error" role="alert">
            <AlertIcon size={16} /> <span>{error}</span>
          </div>
        )}

        <div className="edit-grid">
          <label className="cover-picker" style={{ width: 108 }}>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.avif"
              className="visually-hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pickCover(f);
                e.target.value = '';
              }}
            />
            <CoverArt url={coverPreview} alt="" />
            <span className="cover-picker__overlay">
              {coverBusy ? <span className="spinner" /> : <ImageIcon size={16} />}
            </span>
          </label>

          <div className="stack stack--12" style={{ flex: 1, minWidth: 0 }}>
            <div className="field">
              <label className="label" htmlFor="edit-title">Title</label>
              <input id="edit-title" className="input" value={title} maxLength={120}
                onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="field">
              <label className="label" htmlFor="edit-artist">Artist</label>
              <input id="edit-artist" className="input" value={artist} maxLength={80}
                onChange={(e) => setArtist(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="edit-genre">Genre</label>
          <input id="edit-genre" className="input" value={genre} maxLength={40}
            onChange={(e) => setGenre(e.target.value)} placeholder="Optional" />
        </div>

        <div className="field">
          <label className="label" htmlFor="edit-description">Description</label>
          <textarea id="edit-description" className="textarea" value={description} maxLength={2000}
            onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
        </div>

        <div className="field">
          <span className="label">Visibility</span>
          <VisibilityPicker value={visibility} onChange={setVisibility} name="edit-visibility" />
        </div>

        <Switch
          checked={downloads}
          onChange={setDownloads}
          label="Allow downloads"
          description="Listeners can download the original file."
        />

      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn--primary" onClick={save} disabled={busy} style={{ flex: 1 }}>
          {busy && <span className="spinner" />} Save changes
        </button>
        <button type="button" className="btn btn--outline" onClick={onClose} disabled={busy}>Cancel</button>
      </div>
    </div>
    </Modal>
  );
}
