import { haversineDistanceM } from './distance';
import type { GpsFix } from './types';

/**
 * Politique d'échantillonnage des points GPS.
 *
 * Enregistrer chaque fix produirait des millions de points inutiles ; n'en
 * garder qu'un toutes les N secondes couperait les virages et effacerait les
 * arrêts. La règle combine donc quatre critères, évalués dans l'ordre.
 */

export type SamplingSettings = {
  /** Intervalle minimal entre deux points retenus, en secondes. */
  minIntervalS: number;
  /** Distance minimale parcourue depuis le dernier point, en mètres. */
  minDistanceM: number;
  /** Au-delà, le point est enregistré mais marqué peu fiable. */
  maxAccuracyM: number;
};

/** Au-delà de cette durée à l'arrêt, un point est gardé : il prouve la présence. */
export const HEARTBEAT_S = 30;

/** Changement de cap déclenchant un point, pour ne pas couper les virages. */
export const HEADING_DELTA_DEG = 30;

/**
 * Multiplicateur au-delà duquel un fix est rejeté purement et simplement.
 * Une mesure à 500 m d'incertitude n'apporte rien et pollue la base.
 */
export const HARD_ACCURACY_FACTOR = 4;

export type SamplingKeep = 'first' | 'interval' | 'heading' | 'heartbeat';
export type SamplingDrop = 'duplicate' | 'too-soon' | 'too-close' | 'unusable' | 'invalid';

export type SamplingDecision =
  | { keep: true; reason: SamplingKeep }
  | { keep: false; reason: SamplingDrop };

/** Écart angulaire le plus court entre deux caps, en degrés [0, 180]. */
export function headingDelta(a: number, b: number): number {
  const diff = Math.abs(((a - b) % 360) + 360) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/** Un fix trop incertain est marqué non fiable, mais reste enregistré. */
export function isReliableFix(fix: GpsFix, settings: SamplingSettings): boolean {
  return Number.isFinite(fix.accuracyM) && fix.accuracyM > 0 && fix.accuracyM <= settings.maxAccuracyM;
}

export function decideSampling(
  candidate: GpsFix,
  last: GpsFix | null,
  settings: SamplingSettings,
): SamplingDecision {
  if (!Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lon)) {
    return { keep: false, reason: 'invalid' };
  }

  if (
    Number.isFinite(candidate.accuracyM) &&
    candidate.accuracyM > settings.maxAccuracyM * HARD_ACCURACY_FACTOR
  ) {
    return { keep: false, reason: 'unusable' };
  }

  if (!last) return { keep: true, reason: 'first' };

  const elapsedS = (candidate.timestamp - last.timestamp) / 1000;
  if (elapsedS <= 0) return { keep: false, reason: 'duplicate' };

  if (elapsedS >= HEARTBEAT_S) return { keep: true, reason: 'heartbeat' };

  if (
    candidate.headingDeg !== null &&
    last.headingDeg !== null &&
    elapsedS >= 1 &&
    headingDelta(candidate.headingDeg, last.headingDeg) >= HEADING_DELTA_DEG
  ) {
    return { keep: true, reason: 'heading' };
  }

  if (elapsedS < settings.minIntervalS) return { keep: false, reason: 'too-soon' };

  const distanceM = haversineDistanceM(last, candidate);
  if (distanceM < settings.minDistanceM) return { keep: false, reason: 'too-close' };

  return { keep: true, reason: 'interval' };
}
