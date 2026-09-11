'use client';

import { useRef, useState } from 'react';
import Waveform from './Waveform';
import { useToast } from './Toast';
import { ACCEPTED_EXTENSIONS, analyzeAudioFile, isAcceptedAudio, type AudioAnalysis } from '@/lib/audio';
import { formatBitrate, formatSampleRate, formatTime } from '@/lib/format';
import { audioMime } from '@/lib/mime';
import { putToSignedUrl, requestSignedUpload } from '@/lib/uploadClient';
import { AlertIcon, CheckIcon, UploadIcon } from './icons';

export interface ReplacedAudio {
  duration: number;
  waveform: number[] | null;
  format: string | null;
  bitrate: number | null;
  sampleRate: number | null;
}

type Stage = 'idle' | 'reading' | 'ready' | 'uploading' | 'done';

/**
 * Swaps the audio behind a track that is already published.
 *
 * A new mix normally means deleting the track and uploading again, which
 * silently breaks every link already sent and resets the play count. This keeps
 * the row — so the link, the page and the counts are the same — and changes
 * only what is playing.
 *
 * Nothing is uploaded until the replacement is confirmed: the file is read and
 * measured in the browser first, so the artist can see what they picked and
 * back out without having sent a byte.
 */
export default function ReplaceAudio({
  trackId,
  currentDuration,
  onReplaced,
}: {
  trackId: string;
  currentDuration: number;
  onReplaced: (result: ReplacedAudio) => void;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStage('idle');
    setFile(null);
    setAnalysis(null);
    setPercent(0);
    setError(null);
  };

  const pick = async (picked: File) => {
    if (!isAcceptedAudio(picked)) {
      setError(`${picked.name} is not an audio file this platform accepts.`);
      return;
    }
    setError(null);
    setFile(picked);
    setStage('reading');
    try {
      const result = await analyzeAudioFile(picked);
      if (!result.duration) throw new Error('That file has no audible length.');
      setAnalysis(result);
      setStage('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That file could not be read.');
      setStage('idle');
      setFile(null);
    }
  };

  const replace = async () => {
    if (!file || !analysis) return;
    setStage('uploading');
    setPercent(0);
    setError(null);
    try {
      const target = await requestSignedUpload('audio', file);
      await putToSignedUrl(target, file, audioMime(file.name, file.type || undefined), (r) =>
        setPercent(Math.round(r * 100))
      );

      const res = await fetch(`/api/tracks/${trackId}/audio`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          audioPath: target.path,
          duration: analysis.duration,
          file: {
            originalFilename: file.name,
            mimeType: audioMime(file.name, file.type || undefined),
            format: analysis.format,
            byteSize: analysis.byteSize,
            bitrate: analysis.bitrate,
            sampleRate: analysis.sampleRate,
            channels: analysis.channels,
            waveform: analysis.peaks,
          },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'The file could not be replaced.');

      setStage('done');
      toast('Audio replaced — same link');
      onReplaced({
        duration: body.duration ?? analysis.duration,
        waveform: body.waveform ?? analysis.peaks,
        format: body.format ?? analysis.format,
        bitrate: body.bitrate ?? analysis.bitrate,
        sampleRate: body.sampleRate ?? analysis.sampleRate,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The file could not be replaced.');
      setStage('ready');
    }
  };

  return (
    <section className="replace" aria-label="Audio file">
      <div className="replace__head">
        <span className="label" style={{ margin: 0 }}>Audio file</span>
        <span className="hint">The link, the page and the plays stay the same.</span>
      </div>

      {error && (
        <div className="alert alert--error" role="alert">
          <AlertIcon size={16} /> <span>{error}</span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(',')}
        className="visually-hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) void pick(picked);
          e.target.value = '';
        }}
      />

      {stage === 'idle' && (
        <button type="button" className="btn btn--outline btn--sm" onClick={() => inputRef.current?.click()}>
          <UploadIcon size={15} /> Replace file
        </button>
      )}

      {stage === 'reading' && (
        <p className="hint replace__status"><span className="spinner" /> Reading {file?.name}…</p>
      )}

      {(stage === 'ready' || stage === 'uploading') && analysis && (
        <div className="replace__staged">
          <p className="replace__name truncate">{file?.name}</p>
          <p className="replace__specs">
            {formatTime(currentDuration)} → <b>{formatTime(analysis.duration)}</b>
            {analysis.format ? ` · ${analysis.format.toUpperCase()}` : ''}
            {analysis.bitrate ? ` · ${formatBitrate(analysis.bitrate)}` : ''}
            {analysis.sampleRate ? ` · ${formatSampleRate(analysis.sampleRate)}` : ''}
          </p>

          {analysis.peaks && (
            <Waveform peaks={analysis.peaks} progress={0} height={36} barWidth={2} gap={1} />
          )}

          {stage === 'uploading' ? (
            <div className="stack stack--8" style={{ marginTop: 10 }}>
              <div className="progress"><div className="progress__bar" style={{ width: `${percent}%` }} /></div>
              <p className="hint">Uploading — {percent}%</p>
            </div>
          ) : (
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <button type="button" className="btn btn--sm btn--primary" onClick={replace}>
                Replace audio
              </button>
              <button type="button" className="btn btn--sm btn--ghost" onClick={reset}>
                Keep the current file
              </button>
            </div>
          )}
        </div>
      )}

      {stage === 'done' && (
        <p className="replace__status is-done">
          <CheckIcon size={15} /> Replaced. Anyone opening the link now hears the new file.
        </p>
      )}
    </section>
  );
}
