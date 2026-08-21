'use client';

import { useEffect } from 'react';

/**
 * Enregistre le service worker en production uniquement : en développement, les
 * fichiers changent à chaque rechargement et un cache actif brouille le débogage.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('[pwa] enregistrement du service worker impossible', error);
    });
  }, []);

  return null;
}
