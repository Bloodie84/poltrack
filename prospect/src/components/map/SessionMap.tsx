'use client';

import { useCallback, useMemo, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { MapCanvas, EMPTY_LAYER_DATA, type MapLayerData } from './MapCanvas';
import { FRANCE_CENTER, FRANCE_ZOOM } from './constants';
import { bboxOfCollection, splitGeometries } from '@/lib/geo/bbox';
import type { TrackFeatures } from '@/lib/geo/track-feature';
import type { BasemapId } from './basemaps';

export type SessionMapProps = {
  basemapId: BasemapId;
  geojson: FeatureCollection;
};

/**
 * Carte de consultation d'une sortie : trace, départ et point de retour.
 * Aucune interaction GPS — c'est un écran d'analyse, pas de terrain.
 */
export function SessionMap({ basemapId, geojson }: SessionMapProps) {
  const [empty] = useState(() => geojson.features.length === 0);

  const { layerData, bounds, center } = useMemo(() => {
    const { lines, points } = splitGeometries(geojson);
    const box = bboxOfCollection(geojson);

    const data: MapLayerData = {
      ...EMPTY_LAYER_DATA,
      liveTrack: lines as TrackFeatures,
      markers: points,
    };

    return {
      layerData: data,
      bounds: box,
      center: box
        ? ([(box[0] + box[2]) / 2, (box[1] + box[3]) / 2] as [number, number])
        : FRANCE_CENTER,
    };
  }, [geojson]);

  const handleReady = useCallback(
    (map: MapLibreMap) => {
      if (!bounds) return;
      map.fitBounds(
        [
          [bounds[0], bounds[1]],
          [bounds[2], bounds[3]],
        ],
        { padding: 48, duration: 0, maxZoom: 17 },
      );
    },
    [bounds],
  );

  if (empty) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-2">
        Aucune trace enregistrée pour cette sortie.
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden rounded-2xl border border-line">
      <MapCanvas
        basemapId={basemapId}
        layerData={layerData}
        initialCenter={center}
        initialZoom={bounds ? 14 : FRANCE_ZOOM}
        onReady={handleReady}
      />
    </div>
  );
}
