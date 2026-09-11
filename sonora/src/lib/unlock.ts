import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * Proof that somebody typed the password for a track.
 *
 * It is a cookie the browser cannot read or forge: HttpOnly, and its value is
 * an expiry plus an HMAC over the track's short id and that expiry. The server
 * keeps no session table for it — the signature is the record — and because the
 * short id is inside the signature, a pass for one track is worthless for
 * another.
 *
 * It is keyed by the short id rather than the internal one so the page can
 * check it from the URL alone: the internal id is what /api/stream and
 * /api/download take, and a locked page has no business handing it out.
 *
 * The key is derived from LISTENER_SALT with its own prefix, so the two uses of
 * that secret cannot be substituted for one another.
 */
const TTL_SECONDS = 12 * 60 * 60;

/**
 * Whether to mark the pass Secure. Taken from the request rather than from
 * NODE_ENV: a build served over plain http — a self-hosted instance, a local
 * production build — would otherwise set a cookie the browser is entitled to
 * throw away, and the password would never appear to work.
 */
export function isSecureRequest(request: Request): boolean {
  const proto = request.headers.get('x-forwarded-proto');
  if (proto) return proto.split(',')[0].trim() === 'https';
  return new URL(request.url).protocol === 'https:';
}
const PREFIX = 'sonora_unlock_';

function key(): string {
  return `unlock:${process.env.LISTENER_SALT ?? 'sonora-listener-salt'}`;
}

function sign(shortId: string, expiresAt: number): string {
  return createHmac('sha256', key()).update(`${shortId}.${expiresAt}`).digest('base64url');
}

export function cookieNameFor(shortId: string): string {
  return `${PREFIX}${shortId}`;
}

export function unlockCookie(shortId: string, secure: boolean): {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    sameSite: 'lax';
    secure: boolean;
    path: string;
    maxAge: number;
  };
} {
  const expiresAt = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  return {
    name: cookieNameFor(shortId),
    value: `${expiresAt}.${sign(shortId, expiresAt)}`,
    options: {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: TTL_SECONDS,
    },
  };
}

/** True when the request carries a pass for this track that is still valid. */
export function isUnlockedValue(shortId: string, value: string | undefined): boolean {
  if (!value) return false;
  const dot = value.indexOf('.');
  if (dot < 1) return false;

  const expiresAt = Number(value.slice(0, dot));
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;

  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(shortId, expiresAt));
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

export async function hasUnlockPass(shortId: string): Promise<boolean> {
  const jar = await cookies();
  return isUnlockedValue(shortId, jar.get(cookieNameFor(shortId))?.value);
}
