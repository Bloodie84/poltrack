import { describe, expect, it } from 'vitest';
import {
  HEADING_DELTA_DEG,
  HEARTBEAT_S,
  decideSampling,
  headingDelta,
  isReliableFix,
  type SamplingSettings,
} from './sampling';
import { destinationPoint } from './distance';
import type { GpsFix } from './types';

const SETTINGS: SamplingSettings = { minIntervalS: 3, minDistanceM: 2, maxAccuracyM: 30 };
const T0 = 1_770_000_000_000;

function fix(overrides: Partial<GpsFix> = {}): GpsFix {
  return {
    lat: 48.8566,
    lon: 2.3522,
    accuracyM: 6,
    altitudeM: 80,
    altitudeAccuracyM: 4,
    headingDeg: 90,
    speedMs: 1.2,
    timestamp: T0,
    ...overrides,
  };
}

/** Fix décalé de `meters` vers l'est et de `seconds` dans le futur. */
function moved(from: GpsFix, meters: number, seconds: number, heading = 90): GpsFix {
  const target = destinationPoint(from, 90, meters);
  return fix({
    ...target,
    headingDeg: heading,
    timestamp: from.timestamp + seconds * 1000,
  });
}

describe('headingDelta', () => {
  it('mesure l’écart le plus court', () => {
    expect(headingDelta(10, 350)).toBe(20);
    expect(headingDelta(350, 10)).toBe(20);
    expect(headingDelta(0, 180)).toBe(180);
    expect(headingDelta(45, 45)).toBe(0);
  });
});

describe('decideSampling', () => {
  it('garde toujours le premier point', () => {
    expect(decideSampling(fix(), null, SETTINGS)).toEqual({ keep: true, reason: 'first' });
  });

  it('garde un point quand intervalle et distance sont atteints', () => {
    const first = fix();
    expect(decideSampling(moved(first, 5, 4), first, SETTINGS)).toEqual({
      keep: true,
      reason: 'interval',
    });
  });

  it('rejette un point trop rapproché dans le temps', () => {
    const first = fix();
    expect(decideSampling(moved(first, 20, 1), first, SETTINGS)).toEqual({
      keep: false,
      reason: 'too-soon',
    });
  });

  it('rejette le sur-place : la dérive GPS ne doit pas gonfler la distance', () => {
    const first = fix();
    expect(decideSampling(moved(first, 0.6, 5), first, SETTINGS)).toEqual({
      keep: false,
      reason: 'too-close',
    });
  });

  it('garde un point à l’arrêt prolongé, pour attester de la présence', () => {
    const first = fix();
    expect(decideSampling(moved(first, 0.2, HEARTBEAT_S), first, SETTINGS)).toEqual({
      keep: true,
      reason: 'heartbeat',
    });
  });

  it('garde un point sur changement de cap, pour ne pas couper les virages', () => {
    const first = fix({ headingDeg: 0 });
    const turned = moved(first, 1, 2, HEADING_DELTA_DEG + 5);
    expect(decideSampling(turned, first, SETTINGS)).toEqual({ keep: true, reason: 'heading' });
  });

  it('ne déclenche pas sur un changement de cap mineur', () => {
    const first = fix({ headingDeg: 0 });
    const turned = moved(first, 1, 2, 10);
    expect(decideSampling(turned, first, SETTINGS).keep).toBe(false);
  });

  it('rejette un horodatage identique ou antérieur', () => {
    const first = fix();
    expect(decideSampling(fix({ timestamp: T0 }), first, SETTINGS)).toEqual({
      keep: false,
      reason: 'duplicate',
    });
    expect(decideSampling(fix({ timestamp: T0 - 5000 }), first, SETTINGS)).toEqual({
      keep: false,
      reason: 'duplicate',
    });
  });

  it('rejette un fix dont l’incertitude est hors de toute utilité', () => {
    const first = fix();
    const garbage = fix({ accuracyM: 500, timestamp: T0 + 10_000 });
    expect(decideSampling(garbage, first, SETTINGS)).toEqual({ keep: false, reason: 'unusable' });
  });

  it('rejette une coordonnée non finie', () => {
    expect(decideSampling(fix({ lat: Number.NaN }), null, SETTINGS)).toEqual({
      keep: false,
      reason: 'invalid',
    });
  });

  it('respecte des réglages plus fins', () => {
    const precise: SamplingSettings = { minIntervalS: 1, minDistanceM: 0.5, maxAccuracyM: 10 };
    const first = fix();
    expect(decideSampling(moved(first, 0.8, 1.5), first, precise).keep).toBe(true);
  });
});

describe('isReliableFix', () => {
  it('accepte un fix sous le seuil', () => {
    expect(isReliableFix(fix({ accuracyM: 12 }), SETTINGS)).toBe(true);
  });

  it('refuse un fix au-dessus du seuil, sans le jeter pour autant', () => {
    expect(isReliableFix(fix({ accuracyM: 45 }), SETTINGS)).toBe(false);
    // Le point reste enregistrable : seule la trace l'ignore.
    expect(decideSampling(fix({ accuracyM: 45 }), null, SETTINGS).keep).toBe(true);
  });
});
