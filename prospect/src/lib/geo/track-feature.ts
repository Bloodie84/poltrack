import type { Feature, FeatureCollection, LineString } from 'geojson';
import type { LatLng } from './types';

export type TrackFeatures = FeatureCollection<LineString, { kind: 'live' }>;

export const EMPTY_TRACK: TrackFeatures = { type: 'FeatureCollection', features: [] };

/**
 * Construit la trace en cours à partir des points déjà retenus.
 * Sous deux points, il n'y a pas de ligne : on n'invente pas de segment.
 */
export function buildLiveTrack(points: readonly LatLng[]): TrackFeatures {
  if (points.length < 2) return EMPTY_TRACK;

  const feature: Feature<LineString, { kind: 'live' }> = {
    type: 'Feature',
    id: 'live-track',
    geometry: {
      type: 'LineString',
      coordinates: points.map((point) => [point.lon, point.lat]),
    },
    properties: { kind: 'live' },
  };

  return { type: 'FeatureCollection', features: [feature] };
}
