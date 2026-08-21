#!/usr/bin/env node
/**
 * Applique les migrations SQL de `supabase/migrations` sur la base pointée par
 * DATABASE_URL, dans l'ordre lexicographique, une transaction par fichier.
 *
 * Un registre `public.app_migrations` mémorise ce qui a déjà été appliqué et
 * l'empreinte SHA-256 du fichier : modifier une migration déjà jouée devient
 * une erreur explicite plutôt qu'une dérive silencieuse du schéma.
 *
 *   node scripts/migrate.mjs            applique les migrations en attente
 *   node scripts/migrate.mjs --status   affiche l'état sans rien écrire
 *   node scripts/migrate.mjs --dry-run  liste ce qui serait appliqué
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config as loadEnv } from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const migrationsDir = join(root, 'supabase', 'migrations');

loadEnv({ path: join(root, '.env.local'), quiet: true });
loadEnv({ path: join(root, '.env'), quiet: true });

const args = new Set(process.argv.slice(2));
const statusOnly = args.has('--status');
const dryRun = args.has('--dry-run');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    'DATABASE_URL manquant.\n' +
      "  Local  : postgres://postgres:postgres@localhost:5432/prospect\n" +
      '  Supabase : Project Settings > Database > Connection string (URI).',
  );
  process.exit(1);
}

/** @typedef {{ version: string, name: string, sql: string, checksum: string }} Migration */

/** @returns {Migration[]} */
function readMigrations() {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      return {
        version: file.replace(/\.sql$/, '').split('_')[0],
        name: file,
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      };
    });
}

const LEDGER = `
  create table if not exists public.app_migrations (
    version    text primary key,
    name       text not null,
    checksum   text not null,
    applied_at timestamptz not null default now()
  );
`;

async function main() {
  const migrations = readMigrations();
  if (migrations.length === 0) {
    console.log('Aucune migration trouvée dans supabase/migrations.');
    return;
  }

  const versions = new Set();
  for (const m of migrations) {
    if (versions.has(m.version)) {
      throw new Error(`Deux migrations partagent le préfixe ${m.version}.`);
    }
    versions.add(m.version);
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query(LEDGER);
    const { rows } = await client.query(
      'select version, name, checksum from public.app_migrations',
    );
    const applied = new Map(rows.map((r) => [r.version, r]));

    for (const m of migrations) {
      const previous = applied.get(m.version);

      if (previous && previous.checksum !== m.checksum) {
        throw new Error(
          `${m.name} a été modifiée après avoir été appliquée.\n` +
            'Les migrations sont immuables : créez un nouveau fichier.',
        );
      }

      if (previous) {
        if (statusOnly) console.log(`  ✔ ${m.name}`);
        continue;
      }

      if (statusOnly || dryRun) {
        console.log(`  … ${m.name} (en attente)`);
        continue;
      }

      process.stdout.write(`  → ${m.name} `);
      try {
        await client.query('begin');
        await client.query(m.sql);
        await client.query(
          'insert into public.app_migrations (version, name, checksum) values ($1, $2, $3)',
          [m.version, m.name, m.checksum],
        );
        await client.query('commit');
        console.log('appliquée');
      } catch (error) {
        await client.query('rollback');
        console.log('ÉCHEC');
        throw error;
      }
    }

    if (!statusOnly && !dryRun) console.log('Base à jour.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
