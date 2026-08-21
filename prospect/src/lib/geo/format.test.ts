import { describe, expect, it } from 'vitest';
import {
  formatArea,
  formatBearing,
  formatDecimal,
  formatDistance,
  formatDms,
  formatDuration,
  formatSpeed,
} from './format';

describe('formatDistance', () => {
  it('affiche une décimale sous 10 m, où la précision compte sur le terrain', () => {
    expect(formatDistance(3.42)).toBe('3.4 m');
  });

  it('arrondit au mètre entre 10 m et 1 km', () => {
    expect(formatDistance(742.6)).toBe('743 m');
  });

  it('bascule en kilomètres au-delà de 1 km', () => {
    expect(formatDistance(7834)).toBe('7.83 km');
  });

  it('convertit en unités impériales', () => {
    expect(formatDistance(100, 'imperial')).toBe('328 ft');
    expect(formatDistance(5000, 'imperial')).toBe('3.11 mi');
  });

  it('renvoie un tiret pour une valeur non finie', () => {
    expect(formatDistance(Number.NaN)).toBe('—');
  });
});

describe('formatArea', () => {
  it('reste en m² sous un hectare', () => {
    expect(formatArea(4321)).toBe('4321 m²');
  });

  it('bascule en hectares au-delà', () => {
    expect(formatArea(48_000)).toBe('4.80 ha');
  });

  it('convertit en acres', () => {
    expect(formatArea(40_468.564224, 'imperial')).toBe('10.00 ac');
  });
});

describe('formatDuration', () => {
  it('omet les heures pour une sortie courte', () => {
    expect(formatDuration(65_000)).toBe('01:05');
  });

  it('affiche les heures pour une longue sortie', () => {
    expect(formatDuration(3 * 3_600_000 + 47 * 60_000 + 12_000)).toBe('3:47:12');
  });

  it('refuse une durée négative', () => {
    expect(formatDuration(-1)).toBe('—');
  });
});

describe('formatDecimal / formatDms', () => {
  it('conserve six décimales, soit environ 10 cm', () => {
    expect(formatDecimal({ lat: 48.8566, lon: 2.3522 })).toBe('48.856600, 2.352200');
  });

  it('produit un DMS avec les hémisphères français', () => {
    expect(formatDms({ lat: 48.8566, lon: 2.3522 })).toBe(`48°51'23.8"N 2°21'07.9"E`);
  });

  it('marque le sud et l’ouest', () => {
    expect(formatDms({ lat: -33.8688, lon: -70.5 })).toContain('S');
    expect(formatDms({ lat: -33.8688, lon: -70.5 })).toContain('O');
  });
});

describe('formatBearing', () => {
  it('associe le bon point cardinal', () => {
    expect(formatBearing(0)).toBe('0° N');
    expect(formatBearing(315)).toBe('315° NO');
    expect(formatBearing(359)).toBe('359° N');
  });

  it('gère l’absence de cap à l’arrêt', () => {
    expect(formatBearing(null)).toBe('—');
  });
});

describe('formatSpeed', () => {
  it('convertit en km/h', () => {
    expect(formatSpeed(1.5)).toBe('5.4 km/h');
  });

  it('gère l’absence de vitesse', () => {
    expect(formatSpeed(null)).toBe('—');
  });
});
