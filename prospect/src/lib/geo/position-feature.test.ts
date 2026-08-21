import { describe, expect, it } from 'vitest';
import { buildPositionFeatures } from './position-feature';
import { haversineDistanceM } from './distance';
import type { GpsFix } from './types';

const FIX: GpsFix = {
  lat: 48.8566,
  lon: 2.3522,
  accuracyM: 7.5,
  altitudeM: 42,
  altitudeAccuracyM: 3,
  headingDeg: 128,
  speedMs: 1.1,
  timestamp: 1_700_000_000_000,
};

describe('buildPositionFeatures', () => {
  it('produit un polygone d’incertitude et un point de position', () => {
    const collection = buildPositionFeatures(FIX);
    expect(collection.features.map((feature) => feature.geometry.type)).toEqual([
      'Polygon',
      'Point',
    ]);
  });

  it('dimensionne le cercle d’incertitude en mètres réels', () => {
    const [accuracy] = buildPositionFeatures(FIX).features;
    if (accuracy.geometry.type !== 'Polygon') throw new Error('polygone attendu');

    for (const [lon, lat] of accuracy.geometry.coordinates[0]) {
      expect(haversineDistanceM(FIX, { lat, lon })).toBeCloseTo(FIX.accuracyM, 2);
    }
  });

  it('impose un rayon plancher d’un mètre pour rester visible', () => {
    const [accuracy] = buildPositionFeatures({ ...FIX, accuracyM: 0.2 }).features;
    if (accuracy.geometry.type !== 'Polygon') throw new Error('polygone attendu');

    const [lon, lat] = accuracy.geometry.coordinates[0][0];
    expect(haversineDistanceM(FIX, { lat, lon })).toBeCloseTo(1, 2);
  });

  it('signale l’absence de cap plutôt que d’inventer une direction', () => {
    const collection = buildPositionFeatures({ ...FIX, headingDeg: null });
    expect(collection.features[1].properties.hasHeading).toBe(false);
    expect(collection.features[1].properties.headingDeg).toBeNull();
  });
});
