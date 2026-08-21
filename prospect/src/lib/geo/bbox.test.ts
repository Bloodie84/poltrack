import { describe, expect, it } from 'vitest';
import type { FeatureCollection } from 'geojson';
import { bboxOfCollection, splitGeometries } from './bbox';

const collection: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { kind: 'track' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [2.35, 48.85],
          [2.36, 48.86],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { kind: 'vehicle' },
      geometry: { type: 'Point', coordinates: [2.34, 48.84] },
    },
  ],
};

describe('bboxOfCollection', () => {
  it('englobe lignes et points', () => {
    expect(bboxOfCollection(collection)).toEqual([2.34, 48.84, 2.36, 48.86]);
  });

  it('renvoie null pour une collection vide', () => {
    expect(bboxOfCollection({ type: 'FeatureCollection', features: [] })).toBeNull();
  });

  it('gère un polygone', () => {
    const polygon: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
                [0, 0],
              ],
            ],
          },
        },
      ],
    };
    expect(bboxOfCollection(polygon)).toEqual([0, 0, 1, 1]);
  });
});

describe('splitGeometries', () => {
  it('sépare les lignes des points', () => {
    const { lines, points } = splitGeometries(collection);
    expect(lines.features).toHaveLength(1);
    expect(points.features).toHaveLength(1);
    expect(points.features[0].properties?.kind).toBe('vehicle');
  });
});
