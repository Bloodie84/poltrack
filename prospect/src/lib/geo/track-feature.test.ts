import { describe, expect, it } from 'vitest';
import { EMPTY_TRACK, buildLiveTrack } from './track-feature';

const A = { lat: 48.85, lon: 2.35 };
const B = { lat: 48.851, lon: 2.35 };

describe('buildLiveTrack', () => {
  it('ne produit aucune ligne sous deux points', () => {
    expect(buildLiveTrack([])).toBe(EMPTY_TRACK);
    expect(buildLiveTrack([A])).toBe(EMPTY_TRACK);
  });

  it('produit une LineString en ordre longitude/latitude', () => {
    const track = buildLiveTrack([A, B]);
    expect(track.features).toHaveLength(1);
    expect(track.features[0].geometry.coordinates).toEqual([
      [2.35, 48.85],
      [2.35, 48.851],
    ]);
  });

  it('conserve l’ordre de parcours', () => {
    const track = buildLiveTrack([B, A]);
    expect(track.features[0].geometry.coordinates[0]).toEqual([2.35, 48.851]);
  });
});
