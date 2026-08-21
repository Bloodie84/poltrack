import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { connect, migrate } from './helpers';

let client: Client;

beforeAll(async () => {
  migrate();
  client = await connect();
});

afterAll(async () => {
  await client?.end();
});

describe('migrations', () => {
  it('installe PostGIS', async () => {
    const { rows } = await client.query<{ version: string }>(
      'select postgis_version() as version',
    );
    expect(rows[0].version).toBeTruthy();
  });

  it('crée toutes les tables de la phase 1', async () => {
    const { rows } = await client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public'",
    );
    const tables = rows.map((row) => row.table_name);

    for (const expected of [
      'app_migrations',
      'profiles',
      'user_settings',
      'detectors',
      'detector_presets',
      'find_categories',
    ]) {
      expect(tables).toContain(expected);
    }
  });

  it('active la RLS sur toutes les tables métier', async () => {
    const { rows } = await client.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and c.relname <> 'app_migrations'
          -- spatial_ref_sys appartient à PostGIS : hors du périmètre applicatif.
          and not exists (
            select 1 from pg_depend d
             where d.objid = c.oid and d.deptype = 'e'
          )`,
    );

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.relrowsecurity, `RLS désactivée sur ${row.relname}`).toBe(true);
    }
  });

  it('est rejouable sans effet de bord', async () => {
    const before = await client.query('select count(*) from public.app_migrations');
    expect(() => migrate()).not.toThrow();
    const after = await client.query('select count(*) from public.app_migrations');
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it('indexe spatialement le point d’ouverture', async () => {
    const { rows } = await client.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where indexname = 'profiles_home_point_gix'",
    );
    expect(rows[0]?.indexdef).toContain('gist');
  });

  it('installe les 18 catégories système', async () => {
    const { rows } = await client.query<{ count: string }>(
      'select count(*) from public.find_categories where is_system',
    );
    expect(Number(rows[0].count)).toBe(18);
  });
});
