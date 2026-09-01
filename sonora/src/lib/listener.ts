import 'server-only';

import { createHash } from 'node:crypto';

/**
 * Stable, non-reversible identifier for an anonymous listener. Used to count
 * unique listeners without storing an IP address.
 */
export function listenerHash(request: Request, userId?: string | null): string {
  if (userId) return `u:${userId}`;
  const h = request.headers;
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    h.get('cf-connecting-ip') ||
    'unknown';
  const ua = h.get('user-agent') ?? '';
  const salt = process.env.LISTENER_SALT ?? 'sonora-listener-salt';
  return createHash('sha256').update(`${ip}|${ua}|${salt}`).digest('hex').slice(0, 32);
}
