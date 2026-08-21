import { describe, expect, it } from 'vitest';
import { activeSeconds, averageSpeedMs, currentPauseSeconds, elapsedSeconds } from './clock';

const START = '2026-08-20T10:00:00.000Z';
const NOW = Date.parse('2026-08-20T11:00:00.000Z');

const base = {
  started_at: START,
  ended_at: null as string | null,
  paused_at: null as string | null,
  paused_seconds: 0,
};

describe('chronomètre de sortie', () => {
  it('compte le temps écoulé depuis le départ', () => {
    expect(elapsedSeconds(base, NOW)).toBe(3600);
  });

  it('s’arrête à la fin de la sortie', () => {
    const finished = { ...base, ended_at: '2026-08-20T10:30:00.000Z' };
    expect(elapsedSeconds(finished, NOW)).toBe(1800);
  });

  it('retire les pauses déjà soldées du temps de prospection', () => {
    const paused = { ...base, paused_seconds: 600 };
    expect(elapsedSeconds(paused, NOW)).toBe(3600);
    expect(activeSeconds(paused, NOW)).toBe(3000);
  });

  it('retire aussi la pause en cours, seconde après seconde', () => {
    const paused = { ...base, paused_at: '2026-08-20T10:50:00.000Z', paused_seconds: 120 };
    expect(currentPauseSeconds(paused, NOW)).toBe(600);
    expect(activeSeconds(paused, NOW)).toBe(3600 - 120 - 600);
  });

  it('ignore une pause en cours sur une sortie terminée', () => {
    const finished = {
      ...base,
      ended_at: '2026-08-20T10:30:00.000Z',
      paused_at: '2026-08-20T10:20:00.000Z',
    };
    expect(currentPauseSeconds(finished, NOW)).toBe(0);
  });

  it('ne renvoie jamais de durée négative', () => {
    const inconsistent = { ...base, paused_seconds: 99_999 };
    expect(activeSeconds(inconsistent, NOW)).toBe(0);
  });

  it('tolère une date invalide', () => {
    expect(elapsedSeconds({ ...base, started_at: 'jamais' }, NOW)).toBe(0);
  });
});

describe('vitesse moyenne', () => {
  it('calcule des m/s', () => {
    expect(averageSpeedMs(3600, 3600)).toBe(1);
  });

  it('reste muette sur un échantillon trop court', () => {
    expect(averageSpeedMs(5, 3)).toBeNull();
    expect(averageSpeedMs(0, 600)).toBeNull();
  });
});
