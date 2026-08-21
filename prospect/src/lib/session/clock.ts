import type { SessionSummary } from './types';

/**
 * Chronomètre d'une sortie, calculé côté client.
 *
 * Les mêmes formules existent dans la vue `session_overview` ; les reproduire
 * ici permet au chronomètre d'avancer chaque seconde sans solliciter le réseau,
 * ce qui compte sur le terrain.
 */

type ClockInput = Pick<SessionSummary, 'started_at' | 'ended_at' | 'paused_at' | 'paused_seconds'>;

/** Temps écoulé entre le départ et maintenant (ou la fin), pauses incluses. */
export function elapsedSeconds(session: ClockInput, nowMs: number): number {
  const start = Date.parse(session.started_at);
  if (!Number.isFinite(start)) return 0;

  const end = session.ended_at ? Date.parse(session.ended_at) : nowMs;
  return Math.max(0, Math.floor((end - start) / 1000));
}

/** Durée de la pause en cours, nulle si la sortie n'est pas en pause. */
export function currentPauseSeconds(session: ClockInput, nowMs: number): number {
  if (!session.paused_at || session.ended_at) return 0;
  const pausedAt = Date.parse(session.paused_at);
  if (!Number.isFinite(pausedAt)) return 0;
  return Math.max(0, Math.floor((nowMs - pausedAt) / 1000));
}

/** Temps de prospection réel : temps écoulé moins toutes les pauses. */
export function activeSeconds(session: ClockInput, nowMs: number): number {
  return Math.max(
    0,
    elapsedSeconds(session, nowMs) -
      session.paused_seconds -
      currentPauseSeconds(session, nowMs),
  );
}

/** Vitesse moyenne de prospection, en m/s, ou `null` si non significative. */
export function averageSpeedMs(distanceM: number, activeS: number): number | null {
  if (activeS < 10 || distanceM <= 0) return null;
  return distanceM / activeS;
}
