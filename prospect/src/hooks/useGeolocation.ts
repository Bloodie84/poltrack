'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GpsFix } from '@/lib/geo/types';

export type GeolocationStatus =
  | 'idle'
  | 'unsupported'
  | 'requesting'
  | 'tracking'
  | 'denied'
  | 'error';

export type GeolocationState = {
  status: GeolocationStatus;
  fix: GpsFix | null;
  /** Message lisible en cas d'échec, `null` sinon. */
  error: string | null;
  /** Nombre de positions reçues depuis le démarrage du suivi. */
  fixCount: number;
};

const DEFAULT_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 20_000,
  // Toujours demander une mesure fraîche : une position mise en cache fausse
  // la trace et la distance parcourue.
  maximumAge: 0,
};

function toFix(position: GeolocationPosition): GpsFix {
  const { coords } = position;
  return {
    lat: coords.latitude,
    lon: coords.longitude,
    accuracyM: coords.accuracy,
    altitudeM: coords.altitude,
    altitudeAccuracyM: coords.altitudeAccuracy,
    // `heading` n'est renseigné qu'en mouvement, et vaut NaN à l'arrêt.
    headingDeg:
      coords.heading !== null && Number.isFinite(coords.heading) ? coords.heading : null,
    speedMs: coords.speed !== null && Number.isFinite(coords.speed) ? coords.speed : null,
    timestamp: position.timestamp,
  };
}

function messageFor(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Accès à la position refusé. Autorisez la géolocalisation dans les réglages du navigateur.";
    case error.POSITION_UNAVAILABLE:
      return 'Position indisponible. Vérifiez que le GPS est activé et que le ciel est dégagé.';
    case error.TIMEOUT:
      return "Le GPS n'a pas répondu à temps. Nouvelle tentative en cours…";
    default:
      return 'Erreur de géolocalisation.';
  }
}

/**
 * Suivi continu de la position via `watchPosition`.
 *
 * Le suivi n'est jamais démarré automatiquement : le navigateur exige un geste
 * utilisateur pour une demande de permission compréhensible, et la carte doit
 * rester utilisable sans GPS.
 */
export type GeolocationOptions = {
  positionOptions?: PositionOptions;
  /**
   * Appelé à chaque fix reçu, avant la mise à jour de l'état React.
   * L'enregistrement d'une sortie s'y branche : il réagit à un événement du
   * navigateur plutôt qu'à un changement d'état, ce qui évite tout effet en
   * cascade et ne perd aucun fix.
   */
  onFix?: (fix: GpsFix) => void;
};

export function useGeolocation(options: GeolocationOptions = {}): GeolocationState & {
  start: () => void;
  stop: () => void;
} {
  const [state, setState] = useState<GeolocationState>({
    status: 'idle',
    fix: null,
    error: null,
    fixCount: 0,
  });

  const watchIdRef = useRef<number | null>(null);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  });

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setState((previous) => ({ ...previous, status: 'idle' }));
  }, []);

  const start = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setState({
        status: 'unsupported',
        fix: null,
        error: "Ce navigateur ne fournit pas de géolocalisation.",
        fixCount: 0,
      });
      return;
    }

    if (watchIdRef.current !== null) return;

    setState((previous) => ({ ...previous, status: 'requesting', error: null }));

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const fix = toFix(position);
        optionsRef.current.onFix?.(fix);
        setState((previous) => ({
          status: 'tracking',
          fix,
          error: null,
          fixCount: previous.fixCount + 1,
        }));
      },
      (error) => {
        setState((previous) => ({
          // Un TIMEOUT ponctuel n'interrompt pas le watch : on garde le suivi
          // actif et on affiche seulement le message.
          status: error.code === error.PERMISSION_DENIED ? 'denied' : 'error',
          fix: previous.fix,
          error: messageFor(error),
          fixCount: previous.fixCount,
        }));

        if (error.code === error.PERMISSION_DENIED && watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
      },
      optionsRef.current.positionOptions ?? DEFAULT_OPTIONS,
    );
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  return { ...state, start, stop };
}
