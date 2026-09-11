import type { MetadataRoute } from 'next';
import { getOrigin } from '@/lib/site';

/**
 * Public pages are the home page, a track page and an artist page. Unlisted
 * tracks also send their own `noindex`; everything personal is kept out.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await getOrigin();
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/library', '/settings', '/upload', '/login', '/register', '/auth/'],
    },
    host: origin,
  };
}
