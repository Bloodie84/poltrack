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

describe('point d’ouverture de la carte', () => {
  it('enregistre lat/lon et les réexpose en colonnes lisibles', async () => {
    await asUser(client, USER_A, () =>
      client.query('select public.set_home_point($1, $2, $3)', [48.8566, 2.3522, 15]),
    );

    const { rows } = await client.query(
      'select home_lat, home_lon, home_zoom from public.profiles where id = $1',
      [USER_A],
    );

    expect(rows[0].home_lat).toBeCloseTo(48.8566, 6);
    expect(rows[0].home_lon).toBeCloseTo(2.3522, 6);
    expect(rows[0].home_zoom).toBeCloseTo(15, 3);
  });

  it('efface le point quand les coordonnées sont nulles', async () => {
    await asUser(client, USER_A, async () => {
      await client.query('select public.set_home_point($1, $2, $3)', [48.8566, 2.3522, 15]);
      await client.query('select public.set_home_point(null, null, null)');
    });

    const { rows } = await client.query(
      'select home_lat, home_point from public.profiles where id = $1',
      [USER_A],
    );
    expect(rows[0].home_lat).toBeNull();
    expect(rows[0].home_point).toBeNull();
  });

  it('refuse des coordonnées hors bornes', async () => {
    await expect(
      asUser(client, USER_A, () =>
        client.query('select public.set_home_point($1, $2, null)', [120, 2]),
      ),
    ).rejects.toThrow(/Latitude hors bornes/);
  });

  it('n’écrit que sur le profil de l’appelant', async () => {
    await asUser(client, USER_B, () =>
      client.query('select public.set_home_point($1, $2, null)', [45.0, 5.0]),
    );

    const { rows } = await client.query(
      'select home_lat from public.profiles where id = $1',
      [USER_A],
    );
    expect(rows[0].home_lat).toBeNull();
  });
});

describe('PostGIS — fondations de la couverture terrain', () => {
  it('mesure des distances en mètres sur le type geography', async () => {
    // Paris → Lyon : ~391,5 km par la géodésique.
    const { rows } = await client.query<{ distance: string }>(
      `select st_distance(
                st_setsrid(st_makepoint(2.3522, 48.8566), 4326)::geography,
                st_setsrid(st_makepoint(4.8357, 45.7640), 4326)::geography
              ) as distance`,
    );
    const distance = Number(rows[0].distance);
    expect(distance).toBeGreaterThan(391_000);
    expect(distance).toBeLessThan(394_000);
  });

  it('calcule la surface d’un tampon de largeur de balayage', async () => {
    // Une trace de 100 m balayée sur 2 m de large couvre ~200 m² plus les
    // deux demi-disques d'extrémité (rayon 1 m) : ~203 m².
    const { rows } = await client.query<{ area: string }>(
      `with track as (
         select st_setsrid(
                  st_makeline(
                    st_makepoint(2.35000, 48.85000),
                    st_makepoint(2.35000, 48.85090)
                  ), 4326)::geography as line
       )
       select st_area(st_buffer(line, 1.0)) as area from track`,
    );

    const area = Number(rows[0].area);
    expect(area).toBeGreaterThan(195);
    expect(area).toBeLessThan(210);
  });

  it('fusionne deux passages qui se recouvrent sans compter deux fois', async () => {
    const { rows } = await client.query<{ union_area: string; sum_area: string }>(
      `with passes as (
         select st_buffer(
                  st_setsrid(st_makeline(
                    st_makepoint(2.35000, 48.85000),
                    st_makepoint(2.35000, 48.85090)
                  ), 4326)::geography, 1.0)::geometry as a,
                st_buffer(
                  st_setsrid(st_makeline(
                    st_makepoint(2.350005, 48.85000),
                    st_makepoint(2.350005, 48.85090)
                  ), 4326)::geography, 1.0)::geometry as b
       )
       select st_area(st_union(a, b)::geography) as union_area,
              st_area(a::geography) + st_area(b::geography) as sum_area
         from passes`,
    );

    expect(Number(rows[0].union_area)).toBeLessThan(Number(rows[0].sum_area));
  });
});

describe('détecteur par défaut', () => {
  it('bascule de façon atomique', async () => {
    const ids = await asUser(client, USER_A, async () => {
      const first = await client.query<{ id: string }>(
        `insert into public.detectors (user_id, brand, model, is_default)
         values ($1, 'XP', 'Deus II', true) returning id`,
        [USER_A],
      );
      const second = await client.query<{ id: string }>(
        `insert into public.detectors (user_id, brand, model)
         values ($1, 'Minelab', 'Equinox 900') returning id`,
        [USER_A],
      );
      await client.query('select public.set_default_detector($1)', [second.rows[0].id]);
      return { first: first.rows[0].id, second: second.rows[0].id };
    });

    const { rows } = await client.query(
      'select id, is_default from public.detectors where user_id = $1',
      [USER_A],
    );
    const byId = new Map(rows.map((row) => [row.id, row.is_default]));
    expect(byId.get(ids.first)).toBe(false);
    expect(byId.get(ids.second)).toBe(true);
  });

  it('interdit deux détecteurs par défaut', async () => {
    await expect(
      asUser(client, USER_A, async () => {
        await client.query(
          `insert into public.detectors (user_id, brand, model, is_default)
           values ($1, 'XP', 'Deus II', true)`,
          [USER_A],
        );
        await client.query(
          `insert into public.detectors (user_id, brand, model, is_default)
           values ($1, 'Minelab', 'Equinox 900', true)`,
          [USER_A],
        );
      }),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('refuse de rendre par défaut le détecteur d’un autre utilisateur', async () => {
    const foreignId = await asUser(client, USER_A, async () => {
      const result = await client.query<{ id: string }>(
        `insert into public.detectors (user_id, brand, model)
         values ($1, 'XP', 'Deus II') returning id`,
        [USER_A],
      );
      return result.rows[0].id;
    });

    await expect(
      asUser(client, USER_B, () =>
        client.query('select public.set_default_detector($1)', [foreignId]),
      ),
    ).rejects.toThrow(/introuvable/i);
  });
});
