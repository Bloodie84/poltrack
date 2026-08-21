import { describe, expect, it } from 'vitest';
import { isPeriodId, periodRange } from './period';

// Jeudi 20 août 2026, 15 h 30, heure locale.
const NOW = new Date(2026, 7, 20, 15, 30, 0);

describe('bornes de période', () => {
  it('« aujourd’hui » démarre à minuit', () => {
    const { from, to } = periodRange('today', NOW);
    expect(from?.getFullYear()).toBe(2026);
    expect(from?.getMonth()).toBe(7);
    expect(from?.getDate()).toBe(20);
    expect(from?.getHours()).toBe(0);
    expect(to).toBeNull();
  });

  it('« semaine » démarre le lundi', () => {
    const { from } = periodRange('week', NOW);
    expect(from?.getDay()).toBe(1);
    expect(from?.getDate()).toBe(17);
  });

  it('« semaine » remonte au lundi précédent quand on est dimanche', () => {
    const sunday = new Date(2026, 7, 23, 9, 0, 0);
    expect(sunday.getDay()).toBe(0);
    const { from } = periodRange('week', sunday);
    expect(from?.getDay()).toBe(1);
    expect(from?.getDate()).toBe(17);
  });

  it('« mois » démarre le 1er', () => {
    expect(periodRange('month', NOW).from?.getDate()).toBe(1);
  });

  it('« année » démarre au 1er janvier', () => {
    const { from } = periodRange('year', NOW);
    expect(from?.getMonth()).toBe(0);
    expect(from?.getDate()).toBe(1);
  });

  it('« tout » n’impose aucune borne', () => {
    expect(periodRange('all', NOW)).toEqual({ from: null, to: null });
  });
});

describe('isPeriodId', () => {
  it('reconnaît les identifiants valides', () => {
    expect(isPeriodId('week')).toBe(true);
    expect(isPeriodId('decennie')).toBe(false);
    expect(isPeriodId(null)).toBe(false);
  });
});
