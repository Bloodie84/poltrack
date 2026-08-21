import type { SessionOverviewRow } from '@/lib/supabase/types';

/**
 * Normalise une ligne de `session_overview`.
 *
 * PostgREST sérialise `numeric` et `bigint` en chaînes dans certains cas (le
 * type JSON ne représente pas exactement un `numeric`). Une chaîne traverserait
 * silencieusement le typage TypeScript et ferait afficher « — » à la place
 * d'une distance : la conversion est faite une fois, à la frontière.
 */
function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = toNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeSession(row: SessionOverviewRow): SessionOverviewRow;
export function normalizeSession(row: SessionOverviewRow | null): SessionOverviewRow | null;
export function normalizeSession(row: SessionOverviewRow | null): SessionOverviewRow | null {
  if (!row) return null;

  return {
    ...row,
    sweep_width_m: toNumber(row.sweep_width_m, 2),
    paused_seconds: toNumber(row.paused_seconds),
    distance_m: toNumber(row.distance_m),
    point_count: toNumber(row.point_count),
    elapsed_seconds: toNumber(row.elapsed_seconds),
    active_seconds: toNumber(row.active_seconds),
    start_lat: toNullableNumber(row.start_lat),
    start_lon: toNullableNumber(row.start_lon),
    vehicle_lat: toNullableNumber(row.vehicle_lat),
    vehicle_lon: toNullableNumber(row.vehicle_lon),
  };
}
