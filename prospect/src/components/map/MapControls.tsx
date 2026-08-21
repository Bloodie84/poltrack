'use client';

import { cn } from '@/lib/cn';
import type { GeolocationStatus } from '@/hooks/useGeolocation';

export type MapControlsProps = {
  /** La carte est-elle prête à recevoir des commandes de caméra ? */
  ready: boolean;
  follow: boolean;
  gpsStatus: GeolocationStatus;
  isFullscreen: boolean;
  onRecenter: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleFullscreen: () => void;
};

const CONTROL =
  'tap-target flex items-center justify-center rounded-xl border border-line ' +
  'bg-surface-1/90 text-ink-0 backdrop-blur transition-colors hover:bg-surface-2 ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ' +
  'disabled:cursor-not-allowed disabled:opacity-40';

/** Contrôles flottants, alignés à droite pour un usage au pouce. */
export function MapControls({
  ready,
  follow,
  gpsStatus,
  isFullscreen,
  onRecenter,
  onZoomIn,
  onZoomOut,
  onToggleFullscreen,
}: MapControlsProps) {
  // Le nom accessible reste stable : c'est `aria-pressed` qui porte l'état,
  // conformément au motif ARIA du bouton bascule.
  const recenterHint =
    gpsStatus === 'tracking'
      ? follow
        ? 'Suivi actif — la carte suit votre position'
        : 'Recentrer sur ma position'
      : 'Activer le GPS et centrer sur ma position';

  return (
    <div className="pointer-events-none absolute top-4 right-3 z-10 flex flex-col gap-2 pt-safe">
      <button
        type="button"
        onClick={onRecenter}
        disabled={!ready}
        aria-pressed={follow}
        aria-label="Suivre ma position"
        title={recenterHint}
        className={cn(
          CONTROL,
          'pointer-events-auto size-12',
          follow && 'border-accent text-accent',
        )}
      >
        <CrosshairIcon active={follow} />
      </button>

      <button
        type="button"
        onClick={onZoomIn}
        disabled={!ready}
        aria-label="Zoomer"
        className={cn(CONTROL, 'pointer-events-auto size-12 text-xl')}
      >
        +
      </button>

      <button
        type="button"
        onClick={onZoomOut}
        disabled={!ready}
        aria-label="Dézoomer"
        className={cn(CONTROL, 'pointer-events-auto size-12 text-xl')}
      >
        −
      </button>

      <button
        type="button"
        onClick={onToggleFullscreen}
        aria-pressed={isFullscreen}
        aria-label={isFullscreen ? 'Quitter le plein écran' : 'Passer en plein écran'}
        className={cn(CONTROL, 'pointer-events-auto size-12')}
      >
        <FullscreenIcon expanded={isFullscreen} />
      </button>
    </div>
  );
}

function CrosshairIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-6" fill="none" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="6.5" stroke="currentColor" />
      <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" stroke="currentColor" strokeLinecap="round" />
      {active ? <circle cx="12" cy="12" r="2.6" fill="currentColor" /> : null}
    </svg>
  );
}

function FullscreenIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {expanded ? (
        <path d="M9 3v6H3M15 21v-6h6M3 15h6v6M21 9h-6V3" />
      ) : (
        <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" />
      )}
    </svg>
  );
}
