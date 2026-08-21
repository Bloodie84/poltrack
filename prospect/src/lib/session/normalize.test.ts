import { describe, expect, it } from 'vitest';
import { normalizeSession } from './normalize';
import type { SessionOverviewRow } from '@/lib/supabase/types';

/** Ligne telle qu'elle peut arriver de PostgREST : numériques en chaînes. */
const raw = {
  id: 'a',
  user_id: 'u',
  status: 'active',
  started_at: '2026-08-20T10:00:00Z',
  ended_at: null,
  paused_seconds: '120',
  paused_at: null,
  title: null,
  notes: null,
  detector_id: null,
  sweep_width_m: '2.50',
  start_lat: '48.8566',
  start_lon: '2.3522',
  vehicle_lat: null,
  vehicle_lon: null,
  vehicle_label: null,
  created_at: '2026-08-20T10:00:00Z',
  updated_at: '2026-08-20T10:00:00Z',
  distance_m: '1234.56',
  point_count: '42',
  elapsed_seconds: '3600',
  active_seconds: '3480',
  detector_brand: 'XP',
  detector_model: 'Deus II',
} as unknown as SessionOverviewRow;

describe('normalizeSession', () => {
  it('convertit les numériques transmis en chaînes', () => {
    const session = normalizeSession(raw);
    expect(session.distance_m).toBe(1234.56);
    expect(session.point_count).toBe(42);
    expect(session.active_seconds).toBe(3480);
    expect(session.sweep_width_m).toBe(2.5);
    expect(session.start_lat).toBeCloseTo(48.8566, 6);
  });

  it('laisse les nombres inchangés', () => {
    const session = normalizeSession({ ...raw, distance_m: 12.5 } as unknown as SessionOverviewRow);
    expect(session.distance_m).toBe(12.5);
  });

  it('conserve les valeurs absentes', () => {
    const session = normalizeSession(raw);
    expect(session.vehicle_lat).toBeNull();
    expect(session.ended_at).toBeNull();
  });

  it('retombe sur zéro plutôt que sur NaN', () => {
    const broken = normalizeSession({
      ...raw,
      distance_m: 'inconnu',
    } as unknown as SessionOverviewRow);
    expect(broken.distance_m).toBe(0);
  });

  it('accepte null', () => {
    expect(normalizeSession(null)).toBeNull();
  });
});
