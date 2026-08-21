'use client';

import { useEffect, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import { fetchTracksInBbox } from '@/lib/session/actions';
import { periodRange, type PeriodId } from '@/lib/session/period';
import type { BBox } from '@/lib/geo/types';

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Délai avant requête, pour ne pas interroger le serveur à chaque pixel. */
const DEBOUNCE_MS = 400;

export type TrackHistory = {
  features: FeatureCollection;
  loading: boolean;
  error: string | null;
};

/**
 * Charge les traces passées visibles dans l'emprise courante.
 *
 * Le filtrage est fait par la base sur l'emprise ET la période : l'historique
 * peut compter des centaines de sorties, il n'est jamais chargé en entier.
 */
export function useTrackHistory(
  viewport: BBox | null,
  period: PeriodId | null,
): TrackHistory {
  const [history, setHistory] = useState<TrackHistory>({
    features: EMPTY,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!period || !viewport) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setHistory((previous) => ({ ...previous, loading: true }));

      const { from } = periodRange(period, new Date());
      const result = await fetchTracksInBbox({
        west: viewport[0],
        south: viewport[1],
        east: viewport[2],
        north: viewport[3],
        from: from ? from.toISOString() : null,
      });

      if (cancelled) return;

      setHistory(
        result.ok
          ? {
              features: (result.geojson as FeatureCollection | null) ?? EMPTY,
              loading: false,
              error: null,
            }
          : { features: EMPTY, loading: false, error: result.message },
      );
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [viewport, period]);

  // Historique désactivé : le résultat est dérivé, sans état à réinitialiser.
  return period && viewport ? history : { features: EMPTY, loading: false, error: null };
}
