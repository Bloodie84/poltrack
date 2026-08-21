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

describe('provisionnement d’un compte', () => {
  it('crée automatiquement le profil et les préférences', async () => {
    const profiles = await client.query('select id from public.profiles where id = $1', [
      USER_A,
    ]);
    const settings = await client.query(
      'select user_id, units, default_sweep_width_m from public.user_settings where user_id = $1',
      [USER_A],
    );

    expect(profiles.rowCount).toBe(1);
    expect(settings.rows[0]).toMatchObject({ units: 'metric', default_sweep_width_m: '2.00' });
  });

  it('supprime toute la cascade quand le compte disparaît', async () => {
    await asUser(client, USER_A, async () => {
      await client.query(
        'insert into public.detectors (user_id, brand, model) values ($1, $2, $3)',
        [USER_A, 'XP', 'Deus II'],
      );
    });

    await client.query('delete from auth.users where id = $1', [USER_A]);

    const detectors = await client.query('select 1 from public.detectors where user_id = $1', [
      USER_A,
    ]);
    const profiles = await client.query('select 1 from public.profiles where id = $1', [USER_A]);
    expect(detectors.rowCount).toBe(0);
    expect(profiles.rowCount).toBe(0);
  });
});

describe('isolation entre utilisateurs', () => {
  it('ne montre à chacun que son propre profil', async () => {
    const visible = await asUser(client, USER_A, () =>
      client.query('select id from public.profiles'),
    );
    expect(visible.rows.map((row) => row.id)).toEqual([USER_A]);
  });

  it('cache le matériel des autres', async () => {
    await asUser(client, USER_A, () =>
      client.query('insert into public.detectors (user_id, brand, model) values ($1, $2, $3)', [
        USER_A,
        'XP',
        'Deus II',
      ]),
    );

    const seenByB = await asUser(client, USER_B, () =>
      client.query('select id from public.detectors'),
    );
    expect(seenByB.rowCount).toBe(0);
  });

  it('interdit d’écrire une ligne au nom d’un autre', async () => {
    await expect(
      asUser(client, USER_B, () =>
        client.query(
          'insert into public.detectors (user_id, brand, model) values ($1, $2, $3)',
          [USER_A, 'Faux', 'Intrusion'],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('interdit de modifier les préférences d’un autre', async () => {
    const result = await asUser(client, USER_B, () =>
      client.query('update public.user_settings set default_sweep_width_m = 9 where user_id = $1', [
        USER_A,
      ]),
    );
    expect(result.rowCount).toBe(0);
  });

  it('partage les catégories système et isole les catégories personnelles', async () => {
    await asUser(client, USER_A, () =>
      client.query(
        `insert into public.find_categories (user_id, slug, label)
         values ($1, 'fibule', 'Fibule')`,
        [USER_A],
      ),
    );

    const seenByA = await asUser(client, USER_A, () =>
      client.query('select slug from public.find_categories'),
    );
    const seenByB = await asUser(client, USER_B, () =>
      client.query('select slug from public.find_categories'),
    );

    expect(seenByA.rows.map((r) => r.slug)).toContain('fibule');
    expect(seenByA.rows.map((r) => r.slug)).toContain('monnaie');
    expect(seenByB.rows.map((r) => r.slug)).not.toContain('fibule');
    expect(seenByB.rows.map((r) => r.slug)).toContain('monnaie');
  });

  it('empêche de se faire passer pour une catégorie système', async () => {
    await expect(
      asUser(client, USER_A, () =>
        client.query(
          `insert into public.find_categories (user_id, slug, label, is_system)
           values ($1, 'faux-systeme', 'Faux', true)`,
          [USER_A],
        ),
      ),
    ).rejects.toThrow();
  });
});

describe('horodatage', () => {
  it('met à jour updated_at automatiquement', async () => {
    const before = await client.query<{ updated_at: Date }>(
      'select updated_at from public.profiles where id = $1',
      [USER_A],
    );

    await asUser(client, USER_A, () =>
      client.query('update public.profiles set display_name = $1 where id = $2', [
        'Terrain',
        USER_A,
      ]),
    );

    const after = await client.query<{ updated_at: Date }>(
      'select updated_at from public.profiles where id = $1',
      [USER_A],
    );

    expect(after.rows[0].updated_at.getTime()).toBeGreaterThanOrEqual(
      before.rows[0].updated_at.getTime(),
    );
  });
});
