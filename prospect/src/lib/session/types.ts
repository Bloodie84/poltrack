import type { GpsFix } from '@/lib/geo/types';

/**
 * Point prêt à être envoyé à `append_gps_points`.
 * Les noms de champs correspondent exactement aux colonnes attendues par la
 * fonction SQL : aucune transformation n'a lieu côté serveur.
 */
export type PendingPoint = {
  id: string;
  lat: number;
  lon: number;
  recorded_at: string;
  accuracy_m: number | null;
  altitude_m: number | null;
  altitude_accuracy_m: number | null;
  speed_ms: number | null;
  heading_deg: number | null;
  is_reliable: boolean;
};

/** Résumé d'une sortie tel que renvoyé par la vue `session_overview`. */
export type SessionSummary = {
  id: string;
  status: 'active' | 'paused' | 'finished';
  started_at: string;
  ended_at: string | null;
  paused_at: string | null;
  paused_seconds: number;
  title: string | null;
  notes: string | null;
  sweep_width_m: number;
  start_lat: number | null;
  start_lon: number | null;
  vehicle_lat: number | null;
  vehicle_lon: number | null;
  vehicle_label: string | null;
  distance_m: number;
  point_count: number;
  elapsed_seconds: number;
  active_seconds: number;
  detector_brand: string | null;
  detector_model: string | null;
};

/**
 * Convertit un fix GPS en point enregistrable.
 * L'identifiant est généré côté client : c'est lui qui rend l'envoi idempotent,
 * même après une coupure réseau ou un rechargement de page.
 */
export function toPendingPoint(fix: GpsFix, isReliable: boolean, id: string): PendingPoint {
  return {
    id,
    lat: fix.lat,
    lon: fix.lon,
    recorded_at: new Date(fix.timestamp).toISOString(),
    accuracy_m: Number.isFinite(fix.accuracyM) ? fix.accuracyM : null,
    altitude_m: fix.altitudeM,
    altitude_accuracy_m: fix.altitudeAccuracyM,
    speed_ms: fix.speedMs,
    heading_deg: fix.headingDeg,
    is_reliable: isReliable,
  };
}
