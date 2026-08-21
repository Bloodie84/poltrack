'use client';

import dynamic from 'next/dynamic';
import type { MapScreenProps } from './MapScreen';

/**
 * MapLibre a besoin du DOM et de WebGL : rendre la carte côté serveur ne
 * produirait rien d'utile et provoquerait une divergence d'hydratation.
 */
const MapScreen = dynamic(() => import('./MapScreen').then((m) => m.MapScreen), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-surface-0 text-sm text-ink-2">
      Chargement de la carte…
    </div>
  ),
});

export function MapScreenLoader(props: MapScreenProps) {
  return <MapScreen {...props} />;
}
