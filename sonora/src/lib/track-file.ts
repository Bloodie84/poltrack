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
  /** The lighter copy made in the browser, when there is one. */
  streamPath?: unknown;
  streamByteSize?: unknown;
  streamBitrate?: unknown;
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
  stream_path: string | null;
  stream_byte_size: number | null;
  stream_bitrate: number | null;
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
  duration: number,
  streamPath: string | null = null
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
    stream_path: streamPath,
    stream_byte_size: streamPath ? Math.max(0, Number(meta.streamByteSize) || 0) : null,
    stream_bitrate: streamPath ? toInt(meta.streamBitrate) : null,
  };
}

/**
 * The path of the lighter copy, accepted only inside the caller's own folder.
 * The streaming route signs whatever this names with the service role, so a
 * path belonging to somebody else would be a way to read their storage — the
 * same reasoning that constrains the master. Returns undefined when the caller
 * sent one that is not theirs, so the route can refuse rather than store it.
 */
export function checkedStreamPath(meta: FileMetaInput, ownerId: string): string | null | undefined {
  const value = typeof meta.streamPath === 'string' ? meta.streamPath : '';
  if (!value) return null;
  return value.startsWith(`${ownerId}/`) ? value : undefined;
}
