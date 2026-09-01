import type { Visibility } from './types';

export const VISIBILITIES: Visibility[] = ['public', 'unlisted', 'private'];

export function isVisibility(v: unknown): v is Visibility {
  return typeof v === 'string' && (VISIBILITIES as string[]).includes(v);
}

export function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export function cleanMultiline(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/** Keeps a storage object name safe and predictable. */
export function safeFilename(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+/, '');
  return (base || 'audio').slice(0, 120);
}

export const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.m4a', '.aac'];
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.avif'];
export const MAX_AUDIO_BYTES = 500 * 1024 * 1024;
export const MAX_COVER_BYTES = 5 * 1024 * 1024;

export function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
}

export function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

export function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
