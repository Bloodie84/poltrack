import type { LatLng } from './types';
import type { UnitSystem } from '@/lib/supabase/types';

const METERS_PER_FOOT = 0.3048;
const METERS_PER_MILE = 1609.344;
const M2_PER_HECTARE = 10_000;
const M2_PER_ACRE = 4046.8564224;

/** Coordonnées en degrés décimaux, précision ~1 cm. */
export function formatDecimal(point: LatLng, digits = 6): string {
  return `${point.lat.toFixed(digits)}, ${point.lon.toFixed(digits)}`;
}

function toDms(value: number, positive: string, negative: string): string {
  const hemisphere = value >= 0 ? positive : negative;
  const abs = Math.abs(value);
  const degrees = Math.floor(abs);
  const minutesFloat = (abs - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = (minutesFloat - minutes) * 60;
  return `${degrees}°${String(minutes).padStart(2, '0')}'${seconds.toFixed(1).padStart(4, '0')}"${hemisphere}`;
}

/** Coordonnées en degrés/minutes/secondes. */
export function formatDms(point: LatLng): string {
  return `${toDms(point.lat, 'N', 'S')} ${toDms(point.lon, 'E', 'O')}`;
}

/** Distance lisible : mètres en dessous de 1 km, kilomètres au-delà. */
export function formatDistance(meters: number, units: UnitSystem = 'metric'): string {
  if (!Number.isFinite(meters)) return '—';

  if (units === 'imperial') {
    const feet = meters / METERS_PER_FOOT;
    if (feet < 1000) return `${Math.round(feet)} ft`;
    return `${(meters / METERS_PER_MILE).toFixed(2)} mi`;
  }

  if (meters < 1000) {
    return meters < 10 ? `${meters.toFixed(1)} m` : `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

/** Surface lisible : m² en dessous de 1 ha, hectares au-delà. */
export function formatArea(squareMeters: number, units: UnitSystem = 'metric'): string {
  if (!Number.isFinite(squareMeters)) return '—';

  if (units === 'imperial') {
    return squareMeters < M2_PER_ACRE
      ? `${Math.round(squareMeters * 10.7639)} sq ft`
      : `${(squareMeters / M2_PER_ACRE).toFixed(2)} ac`;
  }

  return squareMeters < M2_PER_HECTARE
    ? `${Math.round(squareMeters)} m²`
    : `${(squareMeters / M2_PER_HECTARE).toFixed(2)} ha`;
}

/** Durée au format h/min/s, adapté au chronomètre de sortie. */
export function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '—';

  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] as const;

/** Point cardinal correspondant à un cap. */
export function formatBearing(degrees: number | null): string {
  if (degrees === null || !Number.isFinite(degrees)) return '—';
  const normalized = ((degrees % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % 8;
  return `${Math.round(normalized)}° ${CARDINALS[index]}`;
}

/** Vitesse en km/h (ou mph). */
export function formatSpeed(metersPerSecond: number | null, units: UnitSystem = 'metric'): string {
  if (metersPerSecond === null || !Number.isFinite(metersPerSecond)) return '—';
  return units === 'imperial'
    ? `${(metersPerSecond * 2.236936).toFixed(1)} mph`
    : `${(metersPerSecond * 3.6).toFixed(1)} km/h`;
}
