import type { Feature, FeatureCollection, Point, Polygon } from 'geojson';
import { circlePolygon } from './distance';
import type { GpsFix } from './types';

export type PositionProperties = {
  accuracyM: number;
  headingDeg: number | null;
  hasHeading: boolean;
};

/**
 * Représentation cartographique d'un fix GPS :
 *   - un polygone géodésique matérialisant l'incertitude réelle en mètres ;
 *   - un point pour le marqueur et la flèche de cap.
 *
 * Le cercle d'incertitude est construit en coordonnées géographiques (et non en
 * pixels) afin qu'il reste à l'échelle du terrain quel que soit le zoom.
 */
/** Collection prête à alimenter la source MapLibre de la position. */
export type PositionFeatures = FeatureCollection<Point | Polygon, PositionProperties>;

export function buildPositionFeatures(fix: GpsFix): PositionFeatures {
  const properties: PositionProperties = {
    accuracyM: fix.accuracyM,
    headingDeg: fix.headingDeg,
    hasHeading: fix.headingDeg !== null,
  };

  const accuracy: Feature<Polygon, PositionProperties> = {
    type: 'Feature',
    id: 'accuracy',
    geometry: {
      type: 'Polygon',
      coordinates: [circlePolygon({ lat: fix.lat, lon: fix.lon }, Math.max(fix.accuracyM, 1))],
    },
    properties,
  };

  const position: Feature<Point, PositionProperties> = {
    type: 'Feature',
    id: 'position',
    geometry: { type: 'Point', coordinates: [fix.lon, fix.lat] },
    properties,
  };

  return { type: 'FeatureCollection', features: [accuracy, position] };
}

export const EMPTY_FEATURES: PositionFeatures = {
  type: 'FeatureCollection',
  features: [],
};
