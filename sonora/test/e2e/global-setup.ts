import { execSync } from 'node:child_process';
import fs from 'node:fs';
import pg from 'pg';

/** Empties the throwaway database and the storage folder before a run. */
export default async function globalSetup() {
  const client = new pg.Client({
    host: process.env.PGHOST ?? '127.0.0.1',
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.FAKE_SUPABASE_DB ?? 'sonora_e2e',
    user: process.env.PGUSER ?? 'postgres',
    password: process.env.PGPASSWORD ?? 'postgres',
  });
  await client.connect();
  await client.query('truncate auth.users cascade');
  await client.end();

  const storage = process.env.FAKE_SUPABASE_STORAGE ?? '/tmp/sonora-storage';
  fs.rmSync(storage, { recursive: true, force: true });
  fs.mkdirSync(storage, { recursive: true });

  if (!fs.existsSync('test/e2e/fixtures/tone.wav')) {
    execSync('node test/e2e/make-fixture.mjs', { stdio: 'inherit' });
  }
}
