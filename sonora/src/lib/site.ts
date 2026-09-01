import { headers } from 'next/headers';

export const SITE_NAME = 'Sonora';
export const SITE_TAGLINE = 'Upload a track. Get a link. Send it.';

/** Absolute origin of the current deployment, from env or the incoming request. */
export async function getOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, '');
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https');
    if (host) return `${proto}://${host}`;
  } catch {
    /* outside a request scope */
  }
  return 'http://localhost:3000';
}

export async function absoluteUrl(path: string): Promise<string> {
  const origin = await getOrigin();
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}
