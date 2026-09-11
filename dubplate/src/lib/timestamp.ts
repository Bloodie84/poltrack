/**
 * Positions inside a track, as they travel in a link: `/track/…?t=1:24`.
 *
 * The colon form is written because it is the one a person can read in a
 * message and check against what they are hearing. Plain seconds and the
 * `1m24s` shape are accepted on the way in, because that is what people paste
 * from elsewhere and there is no reason to reject a link that is obvious.
 */
export const TIMESTAMP_PARAM = 't';

/** `1:24` — minutes and seconds, hours only when there are any. */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Reads `90`, `1:24`, `1:02:03` or `1m24s`. Anything else — including a
 * negative or absurd value — is no timestamp at all, and the link then opens
 * at the beginning rather than somewhere unexplained.
 */
export function parseTimestamp(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (!value) return null;

  let seconds: number | null = null;

  if (/^\d+(\.\d+)?$/.test(value)) {
    seconds = Number(value);
  } else if (/^(\d+:)?\d{1,2}:\d{1,2}(\.\d+)?$/.test(value)) {
    const parts = value.split(':').map(Number);
    seconds = parts.reduce((acc, part) => acc * 60 + part, 0);
  } else {
    const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/);
    if (match && (match[1] || match[2] || match[3])) {
      seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
    }
  }

  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null;
  // A day of audio is beyond anything this platform accepts; past that the
  // value is a mistake or a probe, not a position.
  if (seconds > 24 * 3600) return null;
  return Math.floor(seconds);
}

/** Appends `?t=` to a share URL, keeping any query string it already carries. */
export function withTimestamp(url: string, seconds: number | null): string {
  if (seconds === null || seconds <= 0) return url;
  const [base, hash = ''] = url.split('#');
  const separator = base.includes('?') ? '&' : '?';
  const suffix = hash ? `#${hash}` : '';
  return `${base}${separator}${TIMESTAMP_PARAM}=${formatTimestamp(seconds)}${suffix}`;
}
