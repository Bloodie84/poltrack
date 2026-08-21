import { describe, expect, it } from 'vitest';
import {
  bboxOf,
  bearingDeg,
  circlePolygon,
  destinationPoint,
  haversineDistanceM,
  isValidLatLng,
  pathLengthM,
} from './distance';

const PARIS = { lat: 48.8566, lon: 2.3522 };
const LYON = { lat: 45.764, lon: 4.8357 };

describe('haversineDistanceM', () => {
  it('mesure Paris → Lyon à moins de 0,5 % de la valeur géodésique', () => {
    // Distance orthodromique de référence : 391,5 km.
    const distance = haversineDistanceM(PARIS, LYON);
    expect(distance).toBeGreaterThan(391_500 * 0.995);
    expect(distance).toBeLessThan(391_500 * 1.005);
  });

  it('renvoie 0 pour un point confondu avec lui-même', () => {
    expect(haversineDistanceM(PARIS, PARIS)).toBe(0);
  });

  it('reste précis sur les très petites distances de terrain', () => {
    // 1 seconde d'arc de latitude ≈ 30,87 m.
    const oneArcSecond = haversineDistanceM(PARIS, { ...PARIS, lat: PARIS.lat + 1 / 3600 });
    expect(oneArcSecond).toBeGreaterThan(30.5);
    expect(oneArcSecond).toBeLessThan(31.2);
  });

  it('est symétrique', () => {
    expect(haversineDistanceM(PARIS, LYON)).toBeCloseTo(haversineDistanceM(LYON, PARIS), 6);
  });
});

describe('pathLengthM', () => {
  it('renvoie 0 pour une trace vide ou à un seul point', () => {
    expect(pathLengthM([])).toBe(0);
    expect(pathLengthM([PARIS])).toBe(0);
  });

  it('cumule les segments successifs', () => {
    const middle = { lat: 47.3, lon: 3.6 };
    const total = pathLengthM([PARIS, middle, LYON]);
    const expected = haversineDistanceM(PARIS, middle) + haversineDistanceM(middle, LYON);
    expect(total).toBeCloseTo(expected, 6);
  });

  it('compte les allers-retours : un demi-tour ne réduit pas la distance', () => {
    // Cas réel d'une sortie : revenir sur ses pas ajoute des mètres parcourus.
    const other = destinationPoint(PARIS, 90, 50);
    expect(pathLengthM([PARIS, other, PARIS])).toBeCloseTo(100, 0);
  });
});

describe('destinationPoint', () => {
  it('retrouve la distance demandée', () => {
    const target = destinationPoint(PARIS, 42, 250);
    expect(haversineDistanceM(PARIS, target)).toBeCloseTo(250, 3);
  });

  it('conserve le cap demandé', () => {
    const target = destinationPoint(PARIS, 137, 500);
    expect(bearingDeg(PARIS, target)).toBeCloseTo(137, 2);
  });

  it('gère le franchissement de l’antiméridien', () => {
    const nearDateLine = { lat: 0, lon: 179.999 };
    const crossed = destinationPoint(nearDateLine, 90, 500);
    expect(crossed.lon).toBeGreaterThanOrEqual(-180);
    expect(crossed.lon).toBeLessThanOrEqual(180);
    expect(crossed.lon).toBeLessThan(0);
  });
});

describe('bearingDeg', () => {
  it('renvoie 0° vers le nord et 90° vers l’est', () => {
    expect(bearingDeg({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(0, 6);
    expect(bearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(90, 6);
  });

  it('reste dans [0, 360)', () => {
    const bearing = bearingDeg(LYON, PARIS);
    expect(bearing).toBeGreaterThanOrEqual(0);
    expect(bearing).toBeLessThan(360);
  });
});

describe('circlePolygon', () => {
  it('produit un anneau fermé', () => {
    const ring = circlePolygon(PARIS, 12, 32);
    expect(ring).toHaveLength(33);
    expect(ring[0]).toEqual(ring[32]);
  });

  it('place chaque sommet au rayon demandé', () => {
    const radius = 8.5;
    for (const [lon, lat] of circlePolygon(PARIS, radius, 16)) {
      expect(haversineDistanceM(PARIS, { lat, lon })).toBeCloseTo(radius, 3);
    }
  });
});

describe('bboxOf', () => {
  it('renvoie null sans point', () => {
    expect(bboxOf([])).toBeNull();
  });

  it('englobe tous les points', () => {
    expect(bboxOf([PARIS, LYON])).toEqual([2.3522, 45.764, 4.8357, 48.8566]);
  });
});

describe('isValidLatLng', () => {
  it('accepte les coordonnées WGS84 valides', () => {
    expect(isValidLatLng(PARIS)).toBe(true);
    expect(isValidLatLng({ lat: -90, lon: 180 })).toBe(true);
  });

  it('rejette les valeurs hors bornes ou non finies', () => {
    expect(isValidLatLng({ lat: 91, lon: 0 })).toBe(false);
    expect(isValidLatLng({ lat: 0, lon: 181 })).toBe(false);
    expect(isValidLatLng({ lat: Number.NaN, lon: 0 })).toBe(false);
  });
});
