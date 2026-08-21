import { describe, expect, it } from 'vitest';
import { gradeAccuracy, isUsableForTrack } from './accuracy';

describe('gradeAccuracy', () => {
  it('classe les incertitudes selon des seuils réalistes de GPS mobile', () => {
    expect(gradeAccuracy(3).level).toBe('excellent');
    expect(gradeAccuracy(5).level).toBe('excellent');
    expect(gradeAccuracy(5.1).level).toBe('good');
    expect(gradeAccuracy(15).level).toBe('fair');
    expect(gradeAccuracy(35).level).toBe('poor');
    expect(gradeAccuracy(120).level).toBe('unusable');
  });

  it('traite les valeurs aberrantes comme inexploitables', () => {
    expect(gradeAccuracy(Number.NaN).level).toBe('unusable');
    expect(gradeAccuracy(-1).level).toBe('unusable');
  });

  it('ne prétend jamais à une précision centimétrique', () => {
    // Même un fix très précis reste au mieux « excellent », pas « exact ».
    expect(gradeAccuracy(0.1).label).toBe('Excellente');
  });
});

describe('isUsableForTrack', () => {
  it('retient un point sous le seuil configuré', () => {
    expect(isUsableForTrack(12, 30)).toBe(true);
    expect(isUsableForTrack(30, 30)).toBe(true);
  });

  it('écarte un point trop incertain', () => {
    expect(isUsableForTrack(31, 30)).toBe(false);
  });

  it('écarte les valeurs impossibles', () => {
    expect(isUsableForTrack(0, 30)).toBe(false);
    expect(isUsableForTrack(Number.NaN, 30)).toBe(false);
  });
});
