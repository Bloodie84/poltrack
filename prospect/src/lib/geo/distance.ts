import type { BBox, LatLng } from './types';

/** Rayon moyen de la Terre (sphère WGS84), en mètres. */
export const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/**
 * Distance orthodromique entre deux points, en mètres (formule de haversine).
 *
 * Précision suffisante pour la détection : l'écart avec un calcul ellipsoïdal
 * (Vincenty) est de l'ordre de 0,3 %, très inférieur à l'incertitude d'un GPS
 * de smartphone.
 */
export function haversineDistanceM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Longueur cumulée d'une polyligne, en mètres. */
export function pathLengthM(points: readonly LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineDistanceM(points[i - 1], points[i]);
  }
  return total;
}

/** Cap initial de `a` vers `b`, en degrés depuis le nord [0, 360). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Point situé à `distanceM` de `origin` dans la direction `bearing`. */
export function destinationPoint(
  origin: LatLng,
  bearing: number,
  distanceM: number,
): LatLng {
  const angular = distanceM / EARTH_RADIUS_M;
  const lat1 = toRad(origin.lat);
  const lon1 = toRad(origin.lon);
  const brng = toRad(bearing);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(brng),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );

  return {
    lat: toDeg(lat2),
    lon: ((toDeg(lon2) + 540) % 360) - 180,
  };
}

/**
 * Approxime un cercle géodésique par un polygone fermé.
 * Utilisé pour matérialiser l'incertitude GPS à l'échelle réelle du terrain.
 */
export function circlePolygon(
  center: LatLng,
  radiusM: number,
  segments = 64,
): [number, number][] {
  const ring: [number, number][] = [];
  for (let i = 0; i < segments; i += 1) {
    const point = destinationPoint(center, (i * 360) / segments, radiusM);
    ring.push([point.lon, point.lat]);
  }
  ring.push(ring[0]);
  return ring;
}

/** Emprise englobant une liste de points. */
export function bboxOf(points: readonly LatLng[]): BBox | null {
  if (points.length === 0) return null;

  let west = points[0].lon;
  let east = points[0].lon;
  let south = points[0].lat;
  let north = points[0].lat;

  for (const { lat, lon } of points) {
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }

  return [west, south, east, north];
}

/** Vérifie qu'une coordonnée est dans les bornes WGS84 et finie. */
export function isValidLatLng(point: LatLng): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lon >= -180 &&
    point.lon <= 180
  );
}
