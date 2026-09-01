'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import CoverArt from './CoverArt';
import ShareSheet from './ShareSheet';
import Switch from './Switch';
import VisibilityPicker from './VisibilityPicker';
import Waveform from './Waveform';
import { useToast } from './Toast';
import { copyText } from '@/lib/clipboard';
import { analyzeAudioFile, isAcceptedAudio, MAX_FILE_BYTES, type AudioAnalysis } from '@/lib/audio';
import { formatBitrate, formatBytes, formatSampleRate, formatTime } from '@/lib/format';
import { audioMime, imageMime } from '@/lib/mime';
import { putToSignedUrl, requestSignedUpload } from '@/lib/uploadClient';
import type { Visibility } from '@/lib/types';
import {
  AlertIcon, CheckIcon, CloseIcon, FileIcon, ImageIcon, LinkIcon, ShareIcon, UploadIcon,
} from './icons';

type Stage = 'idle' | 'working' | 'ready' | 'publishing' | 'done';

const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.webp,.avif';
const AUDIO_ACCEPT = '.mp3,.wav,.flac,.m4a,.aac,audio/*';

export default function UploadStudio({ defaultArtist }: { defaultArtist: string }) {
  const toast = useToast();

  const [stage, setStage] = useState<Stage>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [uploadRatio, setUploadRatio] = useState(0);
  const [analysisRatio, setAnalysisRatio] = useState(0);
  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null);
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState(defaultArtist);
  const [description, setDescription] = useState('');
  const [genre, setGenre] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [downloadsEnabled, setDownloadsEnabled] = useState(false);

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);

  const [publishedHref, setPublishedHref] = useState<string | null>(null);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const dragDepth = useRef(0);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (!coverPreview) return;
    return () => URL.revokeObjectURL(coverPreview);
  }, [coverPreview]);

  /* ------------------------------------------------------------------ */

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStage('idle');
    setFile(null);
    setAnalysis(null);
    setAudioPath(null);
    setUploadRatio(0);
    setAnalysisRatio(0);
    setError(null);
    setTitle('');
    setCoverFile(null);
    setCoverPreview(null);
    setCoverPath(null);
  }, []);

  const startWithFile = useCallback(
    async (picked: File) => {
      setError(null);

      if (!isAcceptedAudio(picked)) {
        setError('Unsupported file. Use MP3, WAV, FLAC, M4A or AAC.');
        return;
      }
      if (picked.size > MAX_FILE_BYTES) {
        setError(`That file is ${formatBytes(picked.size)} — the limit is 500 MB.`);
        return;
      }

      setFile(picked);
      setStage('working');
      setUploadRatio(0);
      setAnalysisRatio(0);
      setAnalysis(null);
      setAudioPath(null);
      setTitle((current) => current || picked.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim());

      const controller = new AbortController();
      abortRef.current = controller;

      // Analyse and upload at the same time: the form is usable immediately.
      const analysisTask = analyzeAudioFile(picked, setAnalysisRatio)
        .then((result) => {
          setAnalysis(result);
          return result;
        })
        .catch(() => {
          setAnalysis({
            duration: 0,
            sampleRate: null,
            channels: null,
            bitrate: null,
            format: picked.name.split('.').pop()?.toLowerCase() ?? 'audio',
            byteSize: picked.size,
            peaks: null,
          });
          return null;
        });

      const uploadTask = (async () => {
        const target = await requestSignedUpload('audio', picked);
        await putToSignedUrl(
          target,
          picked,
          audioMime(picked.name, picked.type || undefined),
          setUploadRatio,
          controller.signal
        );
        return target.path;
      })();

      try {
        const [, path] = await Promise.all([analysisTask, uploadTask]);
        setAudioPath(path);
        setStage('ready');
      } catch (e) {
        if ((e as DOMException)?.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'The upload failed.');
        setStage('idle');
        setFile(null);
      }
    },
    []
  );

  const onCoverPicked = useCallback(
    async (picked: File) => {
      if (!/\.(jpe?g|png|webp|avif)$/i.test(picked.name)) {
        toast('Cover must be a JPG, PNG, WebP or AVIF image');
        return;
      }
      if (picked.size > 5 * 1024 * 1024) {
        toast('Cover must be smaller than 5 MB');
        return;
      }
      setCoverFile(picked);
      setCoverPreview(URL.createObjectURL(picked));
      setCoverBusy(true);
      try {
        const target = await requestSignedUpload('cover', picked);
        await putToSignedUrl(target, picked, imageMime(picked.name, picked.type || undefined), () => {});
        setCoverPath(target.path);
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Cover upload failed');
        setCoverFile(null);
        setCoverPreview(null);
        setCoverPath(null);
      } finally {
        setCoverBusy(false);
      }
    },
    [toast]
  );

  const publish = async () => {
    if (!audioPath || !title.trim() || !artist.trim()) return;
    setStage('publishing');
    setError(null);

    try {
      const res = await fetch('/api/tracks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          artist,
          description,
          genre,
          visibility,
          downloadsEnabled,
          audioPath,
          coverPath,
          duration: analysis?.duration ?? 0,
          file: {
            originalFilename: file?.name,
            mimeType: audioMime(file?.name ?? '', file?.type || undefined),
            format: analysis?.format,
            byteSize: file?.size ?? 0,
            bitrate: analysis?.bitrate,
            sampleRate: analysis?.sampleRate,
            channels: analysis?.channels,
            waveform: analysis?.peaks,
          },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Could not publish the track.');

      setPublishedHref(body.href);
      setPublishedUrl(`${window.location.origin}${body.href}`);
      setStage('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not publish the track.');
      setStage('ready');
    }
  };

  /* ------------------------------------------------------------------ */

  if (stage === 'done' && publishedHref && publishedUrl) {
    return (
      <div className="card upload-done fade-in">
        <div className="upload-done__badge"><CheckIcon size={22} /></div>
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Your track is live</h1>
        <p className="hint" style={{ marginBottom: 20 }}>
          {visibility === 'private'
            ? 'Only you can open this link while the track is private.'
            : 'Send this link — it opens straight into the player, no account needed.'}
        </p>

        <div className="share-link" style={{ marginBottom: 16 }}>
          <span className="truncate">{publishedUrl}</span>
          <button
            type="button"
            className="btn btn--sm btn--primary"
            onClick={async () => {
              if (await copyText(publishedUrl)) toast('Link copied');
            }}
          >
            <LinkIcon size={14} /> Copy
          </button>
        </div>

        <div className="row" style={{ gap: 8 }}>
          <Link href={publishedHref} className="btn btn--primary" style={{ flex: 1 }}>Open track</Link>
          <button type="button" className="btn" onClick={() => setShareOpen(true)}>
            <ShareIcon size={15} /> Share
          </button>
          <button
            type="button"
            className="btn btn--outline"
            onClick={() => {
              setPublishedHref(null);
              setPublishedUrl(null);
              reset();
            }}
          >
            Upload another
          </button>
        </div>

        {shareOpen && (
          <ShareSheet
            url={publishedUrl}
            title={title}
            artist={artist}
            onClose={() => setShareOpen(false)}
          />
        )}
      </div>
    );
  }

  const analysing = stage === 'working' && analysisRatio < 1;
  const uploadPercent = Math.round(uploadRatio * 100);
  const canPublish = stage === 'ready' && Boolean(title.trim() && artist.trim() && audioPath);

  return (
    <div className="stack stack--24">
      <div className="stack stack--4">
        <h1 style={{ fontSize: 26 }}>Upload a track</h1>
        <p className="hint">MP3, WAV, FLAC, M4A or AAC — up to 500 MB.</p>
      </div>

      {error && (
        <div className="alert alert--error" role="alert">
          <AlertIcon size={16} /> <span>{error}</span>
        </div>
      )}

      {!file ? (
        <label
          className={`dropzone ${dragging ? 'dropzone--over' : ''}`}
          onDragEnter={(e) => {
            e.preventDefault();
            dragDepth.current += 1;
            setDragging(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => {
            e.preventDefault();
            dragDepth.current -= 1;
            if (dragDepth.current <= 0) setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            dragDepth.current = 0;
            setDragging(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) void startWithFile(dropped);
          }}
        >
          <input
            type="file"
            accept={AUDIO_ACCEPT}
            className="visually-hidden"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) void startWithFile(picked);
              e.target.value = '';
            }}
          />
          <span className="dropzone__icon"><UploadIcon size={22} /></span>
          <span className="dropzone__title">Drop an audio file here</span>
          <span className="dropzone__hint">or tap to choose from your device</span>
          <span className="dropzone__formats">MP3 · WAV · FLAC · M4A · AAC</span>
        </label>
      ) : (
        <div className="panel upload-file">
          <div className="row" style={{ gap: 12, padding: 16 }}>
            <span className="upload-file__icon"><FileIcon size={18} /></span>
            <span className="stack stack--4" style={{ minWidth: 0, flex: 1 }}>
              <span className="truncate" style={{ fontSize: 14, fontWeight: 520 }}>{file.name}</span>
              <span className="hint">
                {formatBytes(file.size)}
                {analysis?.duration ? ` · ${formatTime(analysis.duration)}` : ''}
                {analysis?.bitrate ? ` · ${formatBitrate(analysis.bitrate)}` : ''}
                {analysis?.sampleRate ? ` · ${formatSampleRate(analysis.sampleRate)}` : ''}
              </span>
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--icon btn--sm"
              onClick={reset}
              aria-label="Remove file"
              title="Remove file"
            >
              <CloseIcon size={16} />
            </button>
          </div>

          <div style={{ padding: '0 16px 16px' }}>
            {stage === 'working' ? (
              <>
                <div className="progress"><div className="progress__bar" style={{ width: `${uploadPercent}%` }} /></div>
                <div className="row row--between" style={{ marginTop: 8 }}>
                  <span className="hint row" style={{ gap: 7 }}>
                    <span className="spinner" />
                    {uploadRatio < 1
                      ? `Uploading… ${uploadPercent}%`
                      : analysing
                        ? 'Processing audio…'
                        : 'Finishing…'}
                  </span>
                  <span className="hint">{formatBytes(file.size * uploadRatio)} / {formatBytes(file.size)}</span>
                </div>
              </>
            ) : (
              <>
                <div className="row" style={{ gap: 8, color: 'var(--text)', fontSize: 13 }}>
                  <CheckIcon size={15} /> Uploaded and analysed
                </div>
                {analysis?.peaks && (
                  <div style={{ marginTop: 12 }}>
                    <Waveform peaks={analysis.peaks} progress={0} height={44} barWidth={2} gap={1} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {file && (
        <fieldset
          className="stack stack--20 upload-form"
          disabled={stage === 'publishing'}
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          <div className="upload-grid">
            <div className="stack stack--16">
              <div className="field">
                <label className="label" htmlFor="title">Title</label>
                <input
                  id="title"
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Track title"
                  maxLength={120}
                  required
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="artist">Artist</label>
                <input
                  id="artist"
                  className="input"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  placeholder="Artist name"
                  maxLength={80}
                  required
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="genre">Genre <span className="hint">— optional</span></label>
                <input
                  id="genre"
                  className="input"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  placeholder="House, Ambient, Demo…"
                  maxLength={40}
                />
              </div>
            </div>

            <div className="field">
              <span className="label">Cover <span className="hint">— optional</span></span>
              <label className="cover-picker">
                <input
                  type="file"
                  accept={IMAGE_ACCEPT}
                  className="visually-hidden"
                  onChange={(e) => {
                    const picked = e.target.files?.[0];
                    if (picked) void onCoverPicked(picked);
                    e.target.value = '';
                  }}
                />
                <CoverArt url={coverPreview} alt="" />
                <span className="cover-picker__overlay">
                  {coverBusy ? <span className="spinner" /> : <ImageIcon size={18} />}
                  <span>{coverFile ? 'Change cover' : 'Add cover'}</span>
                </span>
              </label>
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="description">Description <span className="hint">— optional</span></label>
            <textarea
              id="description"
              className="textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Anything worth knowing about this track."
              maxLength={2000}
            />
          </div>

          <div className="field">
            <span className="label">Visibility</span>
            <VisibilityPicker value={visibility} onChange={setVisibility} />
          </div>

          <Switch
            checked={downloadsEnabled}
            onChange={setDownloadsEnabled}
            label="Allow downloads"
            description="Listeners can download the original file you uploaded."
          />

          <div className="row" style={{ gap: 10 }}>
            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={publish}
              disabled={!canPublish}
              style={{ flex: 1 }}
            >
              {stage === 'publishing' && <span className="spinner" />}
              {stage === 'working' ? 'Waiting for upload…' : stage === 'publishing' ? 'Publishing…' : 'Publish track'}
            </button>
            <button type="button" className="btn btn--outline btn--lg" onClick={reset}>
              Cancel
            </button>
          </div>
        </fieldset>
      )}
    </div>
  );
}
