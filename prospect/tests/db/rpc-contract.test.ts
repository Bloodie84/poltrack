import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
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

/** Parcourt récursivement `src/` pour retrouver tous les appels RPC du code. */
function sourceFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, found);
    else if (/\.tsx?$/.test(entry) && !entry.endsWith('.test.ts')) found.push(path);
  }
  return found;
}

type RpcCall = { file: string; name: string; args: string[] };

/**
 * Extrait les `supabase.rpc('nom', { p_x: …, p_y: … })` du code applicatif.
 *
 * Une faute de frappe dans un nom d'argument ne se verrait qu'à l'exécution,
 * chez l'utilisateur : ce test compare ce que le code appelle à ce que la base
 * expose réellement.
 */
function collectRpcCalls(): RpcCall[] {
  const calls: RpcCall[] = [];
  const pattern = /\.rpc\(\s*'([a-z_]+)'\s*,\s*\{([\s\S]*?)\}\s*\)/g;

  for (const file of sourceFiles('src')) {
    const content = readFileSync(file, 'utf8');
    for (const match of content.matchAll(pattern)) {
      const args = [...match[2].matchAll(/(^|[\s,{])([a-z_][a-z0-9_]*)\s*:/g)].map(
        (entry) => entry[2],
      );
      calls.push({ file, name: match[1], args });
    }
  }

  return calls;
}

describe('contrat entre le code et les fonctions SQL', () => {
  const calls = collectRpcCalls();

  it('trouve les appels RPC du code applicatif', () => {
    // Garde-fou : si l'extraction casse, le test ne doit pas devenir vide et
    // passer silencieusement.
    expect(calls.length).toBeGreaterThanOrEqual(8);
  });

  it('chaque fonction appelée existe dans le schéma public', async () => {
    const { rows } = await client.query<{ proname: string }>(
      `select distinct p.proname
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'`,
    );
    const existing = new Set(rows.map((row) => row.proname));

    for (const call of calls) {
      expect(existing, `${call.name} appelée depuis ${call.file}`).toContain(call.name);
    }
  });

  it('chaque argument nommé correspond à un paramètre déclaré', async () => {
    const { rows } = await client.query<{ proname: string; argnames: string[] | null }>(
      `select p.proname, p.proargnames as argnames
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'`,
    );

    const declared = new Map<string, Set<string>>();
    for (const row of rows) {
      const set = declared.get(row.proname) ?? new Set<string>();
      for (const name of row.argnames ?? []) set.add(name);
      declared.set(row.proname, set);
    }

    for (const call of calls) {
      const parameters = declared.get(call.name);
      expect(parameters, `${call.name} introuvable`).toBeDefined();
      for (const argument of call.args) {
        expect(
          parameters,
          `${call.name}(${argument}) appelé depuis ${call.file}`,
        ).toContain(argument);
      }
    }
  });
});

describe('contrat de la vue session_overview', () => {
  it('expose exactement les colonnes attendues par le type TypeScript', async () => {
    // Ces noms sont ceux de `SessionOverviewRow` dans src/lib/supabase/types.ts.
    const expected = [
      'active_seconds',
      'created_at',
      'detector_brand',
      'detector_id',
      'detector_model',
      'distance_m',
      'elapsed_seconds',
      'ended_at',
      'id',
      'notes',
      'paused_at',
      'paused_seconds',
      'point_count',
      'start_lat',
      'start_lon',
      'started_at',
      'status',
      'sweep_width_m',
      'title',
      'updated_at',
      'user_id',
      'vehicle_label',
      'vehicle_lat',
      'vehicle_lon',
    ];

    const { rows } = await client.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'session_overview'
        order by column_name`,
    );

    expect(rows.map((row) => row.column_name)).toEqual(expected);
  });
});
