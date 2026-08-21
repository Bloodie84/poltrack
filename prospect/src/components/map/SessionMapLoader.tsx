'use client';

import dynamic from 'next/dynamic';
import type { SessionMapProps } from './SessionMap';

/** MapLibre exige le DOM : la carte de consultation est chargée côté client. */
const SessionMap = dynamic(() => import('./SessionMap').then((m) => m.SessionMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center rounded-2xl border border-line text-sm text-ink-2">
      Chargement de la carte…
    </div>
  ),
});

export function SessionMapLoader(props: SessionMapProps) {
  return <SessionMap {...props} />;
}
