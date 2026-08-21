import { describe, expect, it } from 'vitest';
import { MAX_POINTS_PER_BATCH, pendingPointSchema, pointBatchSchema } from './session';

const VALID = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  lat: 48.8566,
  lon: 2.3522,
  recorded_at: '2026-08-20T10:00:00.000Z',
  accuracy_m: 6,
  altitude_m: 80,
  altitude_accuracy_m: 4,
  speed_ms: 1.2,
  heading_deg: 128,
  is_reliable: true,
};

describe('validation d’un point GPS', () => {
  it('accepte un point complet', () => {
    expect(pendingPointSchema.safeParse(VALID).success).toBe(true);
  });

  it('accepte les mesures absentes', () => {
    const partial = {
      ...VALID,
      altitude_m: null,
      altitude_accuracy_m: null,
      speed_ms: null,
      heading_deg: null,
    };
    expect(pendingPointSchema.safeParse(partial).success).toBe(true);
  });

  it('refuse un identifiant qui n’est pas un UUID', () => {
    // L'idempotence de l'envoi repose entièrement sur cet identifiant.
    expect(pendingPointSchema.safeParse({ ...VALID, id: 'point-1' }).success).toBe(false);
  });

  it('refuse des coordonnées hors bornes ou non finies', () => {
    expect(pendingPointSchema.safeParse({ ...VALID, lat: 91 }).success).toBe(false);
    expect(pendingPointSchema.safeParse({ ...VALID, lon: Number.NaN }).success).toBe(false);
  });

  it('refuse un horodatage qui n’est pas une date ISO', () => {
    expect(pendingPointSchema.safeParse({ ...VALID, recorded_at: '20/08/2026' }).success).toBe(
      false,
    );
  });

  it('refuse une vitesse négative', () => {
    expect(pendingPointSchema.safeParse({ ...VALID, speed_ms: -1 }).success).toBe(false);
  });
});

describe('validation d’un lot', () => {
  it('accepte un lot vide', () => {
    expect(pointBatchSchema.safeParse([]).success).toBe(true);
  });

  it('borne la taille du lot', () => {
    const oversized = Array.from({ length: MAX_POINTS_PER_BATCH + 1 }, (_, index) => ({
      ...VALID,
      id: `3f2504e0-4f89-41d3-9a0c-${String(index).padStart(12, '0')}`,
    }));
    expect(pointBatchSchema.safeParse(oversized).success).toBe(false);
  });

  it('rejette le lot entier si un point est invalide', () => {
    expect(pointBatchSchema.safeParse([VALID, { ...VALID, lat: 200 }]).success).toBe(false);
  });
});
