/* Client-side audio inspection: duration, sample rate, bitrate, channels and
   the peak data used to draw the waveform. No third-party dependency. */

export const WAVEFORM_BUCKETS = 240;

export const ACCEPTED_EXTENSIONS = ['.mp3', '.wav', '.flac', '.m4a', '.aac'] as const;

export const ACCEPTED_MIME = [
  'audio/mpeg', 'audio/mp3',
  'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave',
  'audio/flac', 'audio/x-flac',
  'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/aacp',
];

export const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500 MB, matches the bucket limit

/**
 * Above this size we skip the decode pass. Decoding is what produces the
 * waveform, and it needs the whole file in memory; for a very large master the
 * duration still comes from the container header (or the media element), and
 * the player falls back to a plain progress bar rather than a fake shape.
 */
const MAX_DECODE_BYTES = 300 * 1024 * 1024;

export interface AudioAnalysis {
  duration: number;
  sampleRate: number | null;
  channels: number | null;
  bitrate: number | null;
  format: string;
  byteSize: number;
  peaks: number[] | null;
}

export function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
}

export function formatOf(file: File): string {
  const ext = extensionOf(file.name).replace('.', '');
  if (ext) return ext === 'm4a' ? 'm4a' : ext;
  if (file.type.includes('mpeg')) return 'mp3';
  if (file.type.includes('wav')) return 'wav';
  if (file.type.includes('flac')) return 'flac';
  if (file.type.includes('mp4') || file.type.includes('aac')) return 'm4a';
  return 'audio';
}

export function isAcceptedAudio(file: File): boolean {
  const ext = extensionOf(file.name);
  if ((ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) return true;
  return ACCEPTED_MIME.includes(file.type);
}

/* -------------------------------------------------------------------------
   Container header parsing — gives exact figures where it is cheap to do so.
   ------------------------------------------------------------------------- */

interface HeaderInfo {
  sampleRate?: number;
  channels?: number;
  bitrate?: number;
  duration?: number;
}

function parseWav(view: DataView): HeaderInfo | null {
  if (view.byteLength < 44) return null;
  const tag = (o: number) => String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let offset = 12;
  let fmt: { channels: number; sampleRate: number; bitrate: number; byteRate: number } | null = null;
  while (offset + 8 <= view.byteLength) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    if (id === 'fmt ' && offset + 8 + 16 <= view.byteLength) {
      const channels = view.getUint16(offset + 10, true);
      const sampleRate = view.getUint32(offset + 12, true);
      const byteRate = view.getUint32(offset + 16, true);
      fmt = { channels, sampleRate, bitrate: byteRate * 8, byteRate };
    }
    if (id === 'data' && fmt) {
      // The header is only the first slice of the file, but the data chunk
      // declares its own length — enough for an exact duration.
      return {
        channels: fmt.channels,
        sampleRate: fmt.sampleRate,
        bitrate: fmt.bitrate,
        duration: fmt.byteRate > 0 ? size / fmt.byteRate : undefined,
      };
    }
    offset += 8 + size + (size % 2);
  }
  return fmt ? { channels: fmt.channels, sampleRate: fmt.sampleRate, bitrate: fmt.bitrate } : null;
}

function parseFlac(view: DataView): HeaderInfo | null {
  if (view.byteLength < 42) return null;
  if (view.getUint32(0, false) !== 0x664c6143) return null; // "fLaC"
  // STREAMINFO block starts at byte 4 (header) + 4 => data at 8
  const b = (i: number) => view.getUint8(8 + i);
  const sampleRate = (b(10) << 12) | (b(11) << 4) | (b(12) >> 4);
  const channels = ((b(12) >> 1) & 0x07) + 1;
  const bitsPerSample = (((b(12) & 0x01) << 4) | (b(13) >> 4)) + 1;
  const totalSamples = ((b(13) & 0x0f) * 2 ** 32) + (b(14) << 24 >>> 0) + (b(15) << 16) + (b(16) << 8) + b(17);
  if (!sampleRate) return null;
  const duration = totalSamples ? totalSamples / sampleRate : undefined;
  return { sampleRate, channels, duration, bitrate: duration ? undefined : bitsPerSample * sampleRate * channels };
}

const MPEG_BITRATES_V1L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MPEG_BITRATES_V2L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const MPEG_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG1
  2: [22050, 24000, 16000], // MPEG2
  0: [11025, 12000, 8000],  // MPEG2.5
};

function parseMp3(view: DataView): HeaderInfo | null {
  let start = 0;
  // Skip an ID3v2 tag if present.
  if (view.byteLength > 10 && view.getUint8(0) === 0x49 && view.getUint8(1) === 0x44 && view.getUint8(2) === 0x33) {
    const size =
      (view.getUint8(6) << 21) | (view.getUint8(7) << 14) | (view.getUint8(8) << 7) | view.getUint8(9);
    start = 10 + size;
  }
  for (let i = start; i < Math.min(view.byteLength - 4, start + 200000); i += 1) {
    if (view.getUint8(i) !== 0xff || (view.getUint8(i + 1) & 0xe0) !== 0xe0) continue;
    const b1 = view.getUint8(i + 1);
    const b2 = view.getUint8(i + 2);
    const b3 = view.getUint8(i + 3);
    const versionBits = (b1 >> 3) & 0x03;
    const layerBits = (b1 >> 1) & 0x03;
    if (layerBits === 0 || versionBits === 1) continue;
    const rateIndex = (b2 >> 2) & 0x03;
    const bitrateIndex = (b2 >> 4) & 0x0f;
    if (rateIndex === 3 || bitrateIndex === 0 || bitrateIndex === 15) continue;
    const rates = MPEG_RATES[versionBits === 3 ? 3 : versionBits === 2 ? 2 : 0];
    const sampleRate = rates?.[rateIndex];
    const table = versionBits === 3 ? MPEG_BITRATES_V1L3 : MPEG_BITRATES_V2L3;
    const bitrate = table[bitrateIndex] * 1000;
    const channels = ((b3 >> 6) & 0x03) === 3 ? 1 : 2;
    if (!sampleRate) continue;
    return { sampleRate, channels, bitrate };
  }
  return null;
}

async function readHeader(file: File): Promise<HeaderInfo | null> {
  const slice = await file.slice(0, Math.min(file.size, 256 * 1024)).arrayBuffer();
  const view = new DataView(slice);
  const ext = extensionOf(file.name);
  try {
    if (ext === '.wav') return parseWav(view);
    if (ext === '.flac') return parseFlac(view);
    if (ext === '.mp3') return parseMp3(view);
    return parseWav(view) ?? parseFlac(view) ?? parseMp3(view);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------
   Decoding
   ------------------------------------------------------------------------- */

type Ctx = AudioContext | OfflineAudioContext;

function makeDecodeContext(): Ctx | null {
  const AC: typeof AudioContext | undefined =
    typeof window === 'undefined'
      ? undefined
      : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  // Decoding at a low rate keeps memory flat even for a 300 MB WAV: the audio
  // is resampled while it is decoded, so we never hold the full-rate PCM.
  try {
    return new AC({ sampleRate: 11025 });
  } catch {
    try {
      return new AC();
    } catch {
      return null;
    }
  }
}

function computePeaks(buffer: AudioBuffer, buckets = WAVEFORM_BUCKETS): number[] {
  const channels = Math.min(buffer.numberOfChannels, 2);
  const length = buffer.length;
  const step = Math.max(1, Math.floor(length / buckets));
  const data: Float32Array[] = [];
  for (let c = 0; c < channels; c += 1) data.push(buffer.getChannelData(c));

  const peaks: number[] = [];
  for (let b = 0; b < buckets; b += 1) {
    const start = b * step;
    const end = Math.min(length, start + step);
    let sum = 0;
    let count = 0;
    for (let i = start; i < end; i += 1) {
      for (let c = 0; c < channels; c += 1) {
        const v = data[c][i];
        sum += v * v;
        count += 1;
      }
    }
    peaks.push(count ? Math.sqrt(sum / count) : 0);
  }

  const max = Math.max(...peaks, 1e-6);
  // Mild curve so quiet passages stay visible without flattening the shape.
  return peaks.map((p) => Number(Math.min(1, (p / max) ** 0.72).toFixed(3)));
}

async function durationFromElement(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement('audio');
    const done = (value: number) => {
      URL.revokeObjectURL(url);
      el.removeAttribute('src');
      resolve(value);
    };
    el.preload = 'metadata';
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : 0);
    el.onerror = () => done(0);
    setTimeout(() => done(Number.isFinite(el.duration) ? el.duration : 0), 12000);
    el.src = url;
  });
}

/**
 * Reads the file once and returns everything the publish screen needs.
 * `onProgress` reports 0 → 1 across the read + decode phases.
 */
export async function analyzeAudioFile(
  file: File,
  onProgress?: (ratio: number) => void
): Promise<AudioAnalysis> {
  onProgress?.(0.05);
  const header = await readHeader(file);
  onProgress?.(0.15);

  let duration = header?.duration ?? 0;
  let peaks: number[] | null = null;
  let sampleRate = header?.sampleRate ?? null;
  let channels = header?.channels ?? null;

  const ctx = file.size <= MAX_DECODE_BYTES ? makeDecodeContext() : null;
  if (ctx) {
    try {
      const raw = await file.arrayBuffer();
      onProgress?.(0.5);
      const buffer = await ctx.decodeAudioData(raw);
      duration = buffer.duration;
      channels = channels ?? buffer.numberOfChannels;
      peaks = computePeaks(buffer);
      onProgress?.(0.95);
    } catch {
      peaks = null;
    } finally {
      if ('close' in ctx && typeof ctx.close === 'function') {
        try {
          await (ctx as AudioContext).close();
        } catch {
          /* already closed */
        }
      }
    }
  }

  if (!duration) duration = await durationFromElement(file);

  let bitrate = header?.bitrate ?? null;
  if (!bitrate && duration > 0) bitrate = Math.round((file.size * 8) / duration);

  onProgress?.(1);

  return {
    duration: Math.max(0, Math.round(duration * 1000) / 1000),
    sampleRate,
    channels,
    bitrate,
    format: formatOf(file),
    byteSize: file.size,
    peaks,
  };
}
