'use client';

/**
 * A lighter copy of a track, made in the browser for playback.
 *
 * Why here and not on a server: the file is already in this browser, and a
 * server-side pipeline for 500 MB uploads is a queue, a worker and a bill.
 * Encoding where the audio already is costs the artist some seconds once and
 * costs every listener afterwards nothing — a phone opening a link pulls four
 * megabytes instead of fifty.
 *
 * It is deliberately skippable. Anything too long, too large, or already small
 * enough is left alone, and a failure here is not an error: the track is
 * published exactly as it would have been before, streaming its master.
 */

import { putToSignedUrl, requestSignedUpload } from './uploadClient';

/** 128 kbps stereo is the point where the saving stops being worth the loss. */
export const RENDITION_BITRATE = 128_000;

/** Beyond this the decode alone would hold more memory than a phone has. */
const MAX_SOURCE_BYTES = 150 * 1024 * 1024;
const MAX_SECONDS = 12 * 60;

/** Above this the master is already small; a second copy would save nothing. */
const ALREADY_LIGHT_BITRATE = 192_000;
const ALREADY_LIGHT_FORMATS = new Set(['mp3', 'aac', 'm4a']);

export interface RenditionSource {
  file: File;
  format: string;
  duration: number;
  bitrate: number | null;
}

export function shouldMakeRendition({ file, format, duration, bitrate }: RenditionSource): boolean {
  if (typeof window === 'undefined') return false;
  if (file.size > MAX_SOURCE_BYTES) return false;
  if (!duration || duration > MAX_SECONDS) return false;
  if (ALREADY_LIGHT_FORMATS.has(format.toLowerCase()) && (bitrate ?? 0) <= ALREADY_LIGHT_BITRATE) {
    return false;
  }
  // Nothing is gained by encoding a file that is already smaller than the copy
  // would be, whatever its format.
  return file.size > (RENDITION_BITRATE / 8) * duration * 1.15;
}

function toPcm(channel: Float32Array): Int16Array {
  const out = new Int16Array(channel.length);
  for (let i = 0; i < channel.length; i += 1) {
    const s = Math.max(-1, Math.min(1, channel[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/**
 * Encodes an already-decoded buffer to MP3. Yields to the event loop between
 * blocks so the page keeps responding — this runs for tens of seconds on a long
 * track and a frozen tab would look like a crash.
 */
async function encode(
  buffer: AudioBuffer,
  onProgress: (ratio: number) => void,
  signal?: AbortSignal
): Promise<Blob> {
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const channels = Math.min(buffer.numberOfChannels, 2);
  const encoder = new Mp3Encoder(channels, buffer.sampleRate, RENDITION_BITRATE / 1000);

  const left = toPcm(buffer.getChannelData(0));
  const right = channels === 2 ? toPcm(buffer.getChannelData(1)) : null;

  const BLOCK = 1152 * 50;
  const parts: Uint8Array[] = [];

  for (let offset = 0; offset < left.length; offset += BLOCK) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const end = Math.min(offset + BLOCK, left.length);
    const chunk = right
      ? encoder.encodeBuffer(left.subarray(offset, end), right.subarray(offset, end))
      : encoder.encodeBuffer(left.subarray(offset, end));
    if (chunk.length > 0) parts.push(new Uint8Array(chunk));
    onProgress(end / left.length);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const tail = encoder.flush();
  if (tail.length > 0) parts.push(new Uint8Array(tail));

  return new Blob(parts as BlobPart[], { type: 'audio/mpeg' });
}

/**
 * Decodes at the source's own rate — the waveform's decode runs at 11 kHz to
 * stay cheap, which is fine for drawing and useless for listening — and
 * encodes. Returns null whenever it cannot, which is never an error.
 */
export async function makeRendition(
  file: File,
  onProgress: (ratio: number) => void,
  signal?: AbortSignal
): Promise<{ blob: Blob; bitrate: number } | null> {
  const AC: typeof AudioContext | undefined =
    typeof window === 'undefined'
      ? undefined
      : window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;

  let ctx: AudioContext | null = null;
  try {
    ctx = new AC();
    const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    const blob = await encode(decoded, onProgress, signal);
    // A copy that did not come out smaller has no reason to exist.
    if (blob.size === 0 || blob.size >= file.size) return null;
    return { blob, bitrate: RENDITION_BITRATE };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return null;
  } finally {
    try {
      await ctx?.close();
    } catch {
      /* already closed */
    }
  }
}

export interface StreamCopy {
  path: string;
  byteSize: number;
  bitrate: number;
}

/**
 * Makes the copy and puts it in storage, reporting 0 → 1 while it encodes and
 * null when it is over one way or the other.
 *
 * Never rejects. It is started early and awaited late — at publish time — and a
 * rejection nobody was waiting for yet would surface as an unhandled error in
 * the console for something that is, by design, optional.
 */
export async function makeStreamCopy(
  source: File,
  onProgress: (ratio: number | null) => void,
  signal?: AbortSignal
): Promise<StreamCopy | null> {
  try {
    onProgress(0);
    const made = await makeRendition(source, onProgress, signal);
    if (!made) return null;

    const name = `${source.name.replace(/\.[^.]+$/, '')}.stream.mp3`;
    const file = new File([made.blob], name, { type: 'audio/mpeg' });
    const target = await requestSignedUpload('audio', file);
    await putToSignedUrl(target, file, 'audio/mpeg', () => {}, signal);

    return { path: target.path, byteSize: file.size, bitrate: made.bitrate };
  } catch {
    return null;
  } finally {
    onProgress(null);
  }
}
