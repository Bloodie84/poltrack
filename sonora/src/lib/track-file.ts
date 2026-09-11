import 'server-only';
import { cleanText } from './validation';

/**
 * The analysis a browser sends about an audio file, reduced to the columns of
 * `track_files`. Two routes write this row — publishing a track and replacing
 * its audio — and they have to agree on the shape, so the reduction lives in
 * one place. Everything here arrives from a client and is therefore clamped:
 * the numbers are bounded, the strings are trimmed, and the peaks are capped.
 */
export interface FileMetaInput {
  originalFilename?: unknown;
  mimeType?: unknown;
  format?: unknown;
  byteSize?: unknown;
  bitrate?: unknown;
  sampleRate?: unknown;
  channels?: unknown;
  waveform?: unknown;
}

export interface TrackFileColumns {
  storage_path: string;
  original_filename: string;
  mime_type: string;
  format: string | null;
  byte_size: number;
  duration: number;
  bitrate: number | null;
  sample_rate: number | null;
  channels: number | null;
  waveform: number[] | null;
}

const MAX_PEAKS = 2000;

function toInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** Peaks as the waveform needs them: finite, in 0..1, three decimals, bounded. */
export function normalizeWaveform(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const peaks = value
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n))
    .map((n) => Math.min(1, Math.max(0, Number(n.toFixed(3)))))
    .slice(0, MAX_PEAKS);
  return peaks.length ? peaks : null;
}

export function trackFileColumns(
  meta: FileMetaInput,
  storagePath: string,
  duration: number
): TrackFileColumns {
  const fallbackName = storagePath.slice(storagePath.lastIndexOf('/') + 1);
  return {
    storage_path: storagePath,
    original_filename: (cleanText(meta.originalFilename, 200) ?? fallbackName).slice(0, 200),
    mime_type: cleanText(meta.mimeType, 100) ?? 'application/octet-stream',
    format: cleanText(meta.format, 12),
    byte_size: Math.max(0, Number(meta.byteSize) || 0),
    duration,
    bitrate: toInt(meta.bitrate),
    sample_rate: toInt(meta.sampleRate),
    channels: toInt(meta.channels),
    waveform: normalizeWaveform(meta.waveform),
  };
}
