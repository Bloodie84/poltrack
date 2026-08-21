import { describe, expect, it } from 'vitest';
import { detectorSchema } from './detector';

const BASE = {
  brand: 'XP',
  model: 'Deus II',
  coil: '28 cm',
  frequency_khz: 14,
  notes: '',
  is_default: false,
};

describe('detectorSchema', () => {
  it('accepte un détecteur complet', () => {
    expect(detectorSchema.safeParse(BASE).success).toBe(true);
  });

  it('normalise les champs vides en null plutôt qu’en chaîne vide', () => {
    const parsed = detectorSchema.parse({ ...BASE, coil: '   ', notes: '' });
    expect(parsed.coil).toBeNull();
    expect(parsed.notes).toBeNull();
  });

  it('exige la marque et le modèle', () => {
    expect(detectorSchema.safeParse({ ...BASE, brand: '  ' }).success).toBe(false);
    expect(detectorSchema.safeParse({ ...BASE, model: '' }).success).toBe(false);
  });

  it('refuse une fréquence négative', () => {
    expect(detectorSchema.safeParse({ ...BASE, frequency_khz: -1 }).success).toBe(false);
  });

  it('accepte une fréquence absente (détecteur multifréquence)', () => {
    expect(detectorSchema.safeParse({ ...BASE, frequency_khz: null }).success).toBe(true);
  });
});
