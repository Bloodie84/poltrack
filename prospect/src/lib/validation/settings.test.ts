import { describe, expect, it } from 'vitest';
import { homePointSchema, profileSchema, settingsSchema } from './settings';

const VALID = {
  units: 'metric',
  locale: 'fr',
  theme: 'dark',
  default_sweep_width_m: 2,
  gps_min_interval_s: 3,
  gps_min_distance_m: 2,
  gps_max_accuracy_m: 30,
  keep_screen_awake: true,
  default_privacy: 'private',
} as const;

describe('settingsSchema', () => {
  it('accepte des réglages valides', () => {
    expect(settingsSchema.safeParse(VALID).success).toBe(true);
  });

  it('refuse une largeur de balayage hors des bornes de la base', () => {
    // Mêmes bornes que le CHECK de user_settings : 0,20 → 10 m.
    expect(settingsSchema.safeParse({ ...VALID, default_sweep_width_m: 0.1 }).success).toBe(
      false,
    );
    expect(settingsSchema.safeParse({ ...VALID, default_sweep_width_m: 11 }).success).toBe(
      false,
    );
  });

  it('refuse un intervalle GPS non entier', () => {
    expect(settingsSchema.safeParse({ ...VALID, gps_min_interval_s: 2.5 }).success).toBe(false);
  });

  it('refuse une valeur d’énumération inconnue', () => {
    expect(settingsSchema.safeParse({ ...VALID, default_privacy: 'public' }).success).toBe(
      false,
    );
  });
});

describe('profileSchema', () => {
  it('accepte un nom absent', () => {
    expect(profileSchema.safeParse({ display_name: null }).success).toBe(true);
  });

  it('refuse un nom trop long', () => {
    expect(profileSchema.safeParse({ display_name: 'x'.repeat(81) }).success).toBe(false);
  });
});

describe('homePointSchema', () => {
  it('refuse des coordonnées hors bornes WGS84', () => {
    expect(homePointSchema.safeParse({ lat: 91, lon: 0, zoom: 12 }).success).toBe(false);
    expect(homePointSchema.safeParse({ lat: 0, lon: -181, zoom: 12 }).success).toBe(false);
  });

  it('refuse un zoom impossible', () => {
    expect(homePointSchema.safeParse({ lat: 0, lon: 0, zoom: 23 }).success).toBe(false);
  });
});
