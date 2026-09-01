/** Content type derived from the extension — more reliable than File.type. */
const AUDIO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
};

const IMAGE_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

export function audioMime(filename: string, fallback = 'application/octet-stream'): string {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return AUDIO_MIME[ext] ?? fallback;
}

export function imageMime(filename: string, fallback = 'image/jpeg'): string {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return IMAGE_MIME[ext] ?? fallback;
}
