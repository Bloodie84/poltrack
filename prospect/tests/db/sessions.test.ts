import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { asUser, connect, createAuthUser, migrate, resetData, USER_A, USER_B } from './helpers';

let client: Client;

beforeAll(async () => {
  migrate();
  client = await connect();
});

beforeEach(async () => {
  await resetData(client);
  await createAuthUser(client, USER_A, 'a@exemple.fr');
  await createAuthUser(client, USER_B, 'b@exemple.fr');
});

afterAll(async () => {
  await client?.end();
});

/** Démarre une sortie pour un utilisateur et renvoie son identifiant. */
async function startSession(
  userId: string,
  options: { lat?: number; lon?: number; vehicle?: boolean; title?: string } = {},
) {
  return asUser(client, userId, async () => {
    const { rows } = await client.query<{ id: string }>(
      'select public.start_session($1, $2, null, null, $3, $4) as id',
      [options.lat ?? 48.85, options.lon ?? 2.35, options.title ?? null, options.vehicle ?? false],
    );
    return rows[0].id;
  });
}

/** Construit un lot de points le long d'un méridien (1 point tous les ~50 m). */
function points(count: number, startLat = 48.85, options: { reliable?: boolean } = {}) {
  const base = Date.parse('2026-08-20T10:00:00Z');
  return Array.from({ length: count }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    lat: startLat + index * 0.00045,
    lon: 2.35,
    recorded_at: new Date(base + index * 20_000).toISOString(),
    accuracy_m: 6,
    altitude_m: 80,
    speed_ms: 1.2,
    heading_deg: 0,
    is_reliable: options.reliable ?? true,
  }));
}

describe('cycle de vie d’une sortie', () => {
  it('démarre une sortie avec la largeur de balayage par défaut de l’utilisateur', async () => {
    await client.query(
      'update public.user_settings set default_sweep_width_m = 2.5 where user_id = $1',
      [USER_A],
    );

    const id = await startSession(USER_A);
    const { rows } = await client.query(
      'select status, sweep_width_m, start_lat, start_lon from public.sessions where id = $1',
      [id],
    );

    expect(rows[0]).toMatchObject({ status: 'active', sweep_width_m: '2.50' });
    expect(Number(rows[0].start_lat)).toBeCloseTo(48.85, 5);
  });

  it('interdit deux sorties ouvertes en même temps', async () => {
    await startSession(USER_A);
    await expect(startSession(USER_A)).rejects.toThrow(/déjà en cours/);
  });

  it('autorise une nouvelle sortie après la fin de la précédente', async () => {
    const first = await startSession(USER_A);
    await asUser(client, USER_A, () =>
      client.query('select public.finish_session($1)', [first]),
    );
    await expect(startSession(USER_A)).resolves.toBeTruthy();
  });

  it('compte le temps de pause sans arrêter le temps écoulé', async () => {
    const id = await startSession(USER_A);

    await asUser(client, USER_A, async () => {
      await client.query('select public.pause_session($1)', [id]);
    });

    // Simule une pause de deux minutes.
    await client.query(
      "update public.sessions set paused_at = now() - interval '2 minutes' where id = $1",
      [id],
    );

    await asUser(client, USER_A, () => client.query('select public.resume_session($1)', [id]));

    const { rows } = await client.query(
      'select status, paused_seconds, paused_at from public.sessions where id = $1',
      [id],
    );
    expect(rows[0].status).toBe('active');
    expect(rows[0].paused_at).toBeNull();
    expect(rows[0].paused_seconds).toBeGreaterThanOrEqual(119);
  });

  it('solde la pause en cours quand la sortie est terminée depuis la pause', async () => {
    const id = await startSession(USER_A);
    await asUser(client, USER_A, () => client.query('select public.pause_session($1)', [id]));
    await client.query(
      "update public.sessions set paused_at = now() - interval '30 seconds' where id = $1",
      [id],
    );
    await asUser(client, USER_A, () => client.query('select public.finish_session($1)', [id]));

    const { rows } = await client.query(
      'select status, ended_at, paused_at, paused_seconds from public.sessions where id = $1',
      [id],
    );
    expect(rows[0].status).toBe('finished');
    expect(rows[0].ended_at).not.toBeNull();
    expect(rows[0].paused_at).toBeNull();
    expect(rows[0].paused_seconds).toBeGreaterThanOrEqual(29);
  });

  it('refuse de reprendre une sortie qui n’est pas en pause', async () => {
    const id = await startSession(USER_A);
    await expect(
      asUser(client, USER_A, () => client.query('select public.resume_session($1)', [id])),
    ).rejects.toThrow(/en pause/);
  });

  it('refuse d’agir sur la sortie d’un autre utilisateur', async () => {
    const id = await startSession(USER_A);
    await expect(
      asUser(client, USER_B, () => client.query('select public.pause_session($1)', [id])),
    ).rejects.toThrow();
  });
});

describe('enregistrement des points GPS', () => {
  it('insère un lot et construit la trace à la fin', async () => {
    const id = await startSession(USER_A);

    const inserted = await asUser(client, USER_A, async () => {
      const { rows } = await client.query<{ n: number }>(
        'select public.append_gps_points($1, $2::jsonb) as n',
        [id, JSON.stringify(points(5))],
      );
      return rows[0].n;
    });
    expect(inserted).toBe(5);

    await asUser(client, USER_A, () => client.query('select public.finish_session($1)', [id]));

    const { rows } = await client.query(
      'select point_count, distance_m from public.tracks where session_id = $1',
      [id],
    );
    expect(rows[0].point_count).toBe(5);
    // 4 segments d'environ 50 m.
    expect(Number(rows[0].distance_m)).toBeGreaterThan(190);
    expect(Number(rows[0].distance_m)).toBeLessThan(210);
  });

  it('est idempotent : renvoyer le même lot ne duplique rien', async () => {
    const id = await startSession(USER_A);
    const batch = JSON.stringify(points(4));

    const counts = await asUser(client, USER_A, async () => {
      const first = await client.query<{ n: number }>(
        'select public.append_gps_points($1, $2::jsonb) as n',
        [id, batch],
      );
      const second = await client.query<{ n: number }>(
        'select public.append_gps_points($1, $2::jsonb) as n',
        [id, batch],
      );
      return [first.rows[0].n, second.rows[0].n];
    });

    expect(counts).toEqual([4, 0]);
    const { rows } = await client.query(
      'select count(*)::int as n from public.gps_points where session_id = $1',
      [id],
    );
    expect(rows[0].n).toBe(4);
  });

  it('conserve les points peu fiables mais les exclut de la trace', async () => {
    const id = await startSession(USER_A);

    await asUser(client, USER_A, async () => {
      await client.query('select public.append_gps_points($1, $2::jsonb)', [
        id,
        JSON.stringify(points(3)),
      ]);
      await client.query('select public.append_gps_points($1, $2::jsonb)', [
        id,
        JSON.stringify([
          {
            id: '00000000-0000-4000-8000-0000000000ff',
            // Point aberrant : 5 km plus loin, incertitude de 300 m.
            lat: 48.9,
            lon: 2.35,
            recorded_at: '2026-08-20T10:01:00Z',
            accuracy_m: 300,
            is_reliable: false,
          },
        ]),
      ]);
      await client.query('select public.finish_session($1)', [id]);
    });

    const stored = await client.query(
      'select count(*)::int as n from public.gps_points where session_id = $1',
      [id],
    );
    const track = await client.query(
      'select point_count, distance_m from public.tracks where session_id = $1',
      [id],
    );

    expect(stored.rows[0].n).toBe(4);
    expect(track.rows[0].point_count).toBe(3);
    expect(Number(track.rows[0].distance_m)).toBeLessThan(150);
  });

  it('ignore les coordonnées hors bornes sans faire échouer le lot', async () => {
    const id = await startSession(USER_A);

    const inserted = await asUser(client, USER_A, async () => {
      const { rows } = await client.query<{ n: number }>(
        'select public.append_gps_points($1, $2::jsonb) as n',
        [
          id,
          JSON.stringify([
            ...points(2),
            {
              id: '00000000-0000-4000-8000-0000000000aa',
              lat: 120,
              lon: 2.35,
              recorded_at: '2026-08-20T10:02:00Z',
            },
          ]),
        ],
      );
      return rows[0].n;
    });

    expect(inserted).toBe(2);
  });

  it('reconstruit la trace quand des points arrivent après la fin', async () => {
    const id = await startSession(USER_A);
    await asUser(client, USER_A, async () => {
      await client.query('select public.append_gps_points($1, $2::jsonb)', [
        id,
        JSON.stringify(points(2)),
      ]);
      await client.query('select public.finish_session($1)', [id]);
    });

    const before = await client.query(
      'select point_count from public.tracks where session_id = $1',
      [id],
    );

    // Synchronisation différée : le reste de la trace remonte plus tard.
    await asUser(client, USER_A, () =>
      client.query('select public.append_gps_points($1, $2::jsonb)', [
        id,
        JSON.stringify(points(6)),
      ]),
    );

    const after = await client.query(
      'select point_count from public.tracks where session_id = $1',
      [id],
    );

    expect(before.rows[0].point_count).toBe(2);
    expect(after.rows[0].point_count).toBe(6);
  });

  it('n’accepte aucun point pour la sortie d’un autre utilisateur', async () => {
    const id = await startSession(USER_A);
    await expect(
      asUser(client, USER_B, () =>
        client.query('select public.append_gps_points($1, $2::jsonb)', [
          id,
          JSON.stringify(points(2)),
        ]),
      ),
    ).rejects.toThrow(/introuvable/i);
  });
});

describe('point de retour', () => {
  it('enregistre le point de départ comme point de retour', async () => {
    const id = await startSession(USER_A, { vehicle: true });
    const { rows } = await client.query(
      'select vehicle_lat, vehicle_lon, vehicle_label from public.sessions where id = $1',
      [id],
    );
    expect(Number(rows[0].vehicle_lat)).toBeCloseTo(48.85, 5);
    expect(rows[0].vehicle_label).toBe('Départ');
  });

  it('permet de le déplacer puis de l’effacer', async () => {
    const id = await startSession(USER_A);

    await asUser(client, USER_A, () =>
      client.query('select public.set_vehicle_point($1, $2, $3, $4)', [
        id,
        48.9,
        2.4,
        'Voiture',
      ]),
    );
    const moved = await client.query(
      'select vehicle_lat, vehicle_label from public.sessions where id = $1',
      [id],
    );
    expect(Number(moved.rows[0].vehicle_lat)).toBeCloseTo(48.9, 5);
    expect(moved.rows[0].vehicle_label).toBe('Voiture');

    await asUser(client, USER_A, () =>
      client.query('select public.set_vehicle_point($1, null, null, null)', [id]),
    );
    const cleared = await client.query(
      'select vehicle_point from public.sessions where id = $1',
      [id],
    );
    expect(cleared.rows[0].vehicle_point).toBeNull();
  });

  it('refuse des coordonnées hors bornes', async () => {
    const id = await startSession(USER_A);
    await expect(
      asUser(client, USER_A, () =>
        client.query('select public.set_vehicle_point($1, $2, $3, null)', [id, 0, 999]),
      ),
    ).rejects.toThrow(/hors bornes/);
  });
});

describe('historique des passages', () => {
  it('ne renvoie que les traces intersectant l’emprise', async () => {
    const near = await startSession(USER_A);
    await asUser(client, USER_A, async () => {
      await client.query('select public.append_gps_points($1, $2::jsonb)', [
        near,
        JSON.stringify(points(4, 48.85)),
      ]);
      await client.query('select public.finish_session($1)', [near]);
    });

    const far = await startSession(USER_A);
    await asUser(client, USER_A, async () => {
      await client.query('select public.append_gps_points($1, $2::jsonb)', [
        far,
        JSON.stringify(
          points(4, 45.0).map((point) => ({ ...point, id: point.id.replace('8000', '8001') })),
        ),
      ]);
      await client.query('select public.finish_session($1)', [far]);
    });

    const collection = await asUser(client, USER_A, async () => {
      const { rows } = await client.query<{ geo: { features: unknown[] } }>(
        'select public.tracks_in_bbox($1, $2, $3, $4) as geo',
        [2.3, 48.8, 2.4, 48.9],
      );
      return rows[0].geo;
    });

    expect(collection.features).toHaveLength(1);
    expect(collection.features[0]).toMatchObject({
      type: 'Feature',
      geometry: { type: 'LineString' },
    });
  });

  it('filtre par période', async () => {
    const id = await startSession(USER_A);
    await asUser(client, USER_A, async () => {
      await client.query('select public.append_gps_points($1, $2::jsonb)', [
        id,
        JSON.stringify(points(3)),
      ]);
      await client.query('select public.finish_session($1)', [id]);
    });
    await client.query(
      "update public.sessions set started_at = now() - interval '40 days' where id = $1",
      [id],
    );

    const recent = await asUser(client, USER_A, async () => {
      const { rows } = await client.query<{ geo: { features: unknown[] } }>(
        "select public.tracks_in_bbox($1, $2, $3, $4, now() - interval '7 days') as geo",
        [2.3, 48.8, 2.4, 48.9],
      );
      return rows[0].geo;
    });

    expect(recent.features).toHaveLength(0);
  });

  it('ne montre jamais la trace d’un autre utilisateur', async () => {
    const id = await startSession(USER_A);
    await asUser(client, USER_A, async () => {
      await client.query('select public.append_gps_points($1, $2::jsonb)', [
        id,
        JSON.stringify(points(3)),
      ]);
      await client.query('select public.finish_session($1)', [id]);
    });

    const seenByB = await asUser(client, USER_B, async () => {
      const { rows } = await client.query<{ geo: { features: unknown[] } }>(
        'select public.tracks_in_bbox($1, $2, $3, $4) as geo',
        [2.3, 48.8, 2.4, 48.9],
      );
      return rows[0].geo;
    });

    expect(seenByB.features).toHaveLength(0);
  });

  it('isole les sorties entre utilisateurs dans la vue de synthèse', async () => {
    await startSession(USER_A);
    const visibleToB = await asUser(client, USER_B, () =>
      client.query('select id from public.session_overview'),
    );
    expect(visibleToB.rowCount).toBe(0);
  });
});
