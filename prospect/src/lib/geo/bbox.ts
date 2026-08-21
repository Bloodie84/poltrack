import type { FeatureCollection, Geometry, Position } from 'geojson';
import type { BBox } from './types';

function collect(geometry: Geometry, out: Position[]): void {
  switch (geometry.type) {
    case 'Point':
      out.push(geometry.coordinates);
      break;
    case 'MultiPoint':
    case 'LineString':
      out.push(...geometry.coordinates);
      break;
    case 'MultiLineString':
    case 'Polygon':
      for (const ring of geometry.coordinates) out.push(...ring);
      break;
    case 'MultiPolygon':
      for (const polygon of geometry.coordinates) for (const ring of polygon) out.push(...ring);
      break;
    case 'GeometryCollection':
      for (const child of geometry.geometries) collect(child, out);
      break;
  }
}

/** Emprise d'une collection GeoJSON, ou `null` si elle est vide. */
export function bboxOfCollection(collection: FeatureCollection): BBox | null {
  const positions: Position[] = [];
  for (const feature of collection.features) {
    if (feature.geometry) collect(feature.geometry, positions);
  }
  if (positions.length === 0) return null;

  let west = positions[0][0];
  let east = positions[0][0];
  let south = positions[0][1];
  let north = positions[0][1];

  for (const [lon, lat] of positions) {
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }

  return [west, south, east, north];
}

/** Sépare une collection en lignes et en points, pour les couches dédiées. */
export function splitGeometries(collection: FeatureCollection): {
  lines: FeatureCollection;
  points: FeatureCollection;
} {
  const lines = collection.features.filter(
    (feature) =>
      feature.geometry?.type === 'LineString' || feature.geometry?.type === 'MultiLineString',
  );
  const points = collection.features.filter((feature) => feature.geometry?.type === 'Point');

  return {
    lines: { type: 'FeatureCollection', features: lines },
    points: { type: 'FeatureCollection', features: points },
  };
}
