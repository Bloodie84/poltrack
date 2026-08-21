import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Prospect — Carnet de terrain',
    short_name: 'Prospect',
    description:
      'Traces GPS, zones prospectées et découvertes pour vos sorties de détection.',
    start_url: '/carte',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#070b12',
    theme_color: '#070b12',
    lang: 'fr',
    dir: 'ltr',
    categories: ['navigation', 'utilities'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
