/** Prépare une base propre pour les tests de bout en bout connectés. */
import { execFileSync } from 'node:child_process';
import pg from 'pg';

export const TEST_USER_ID = '55555555-5555-5555-5555-555555555555';
export const TEST_USER_EMAIL = 'terrain@exemple.fr';

export async function resetDatabase(databaseUrl) {
  execFileSync(process.execPath, ['scripts/migrate.mjs'], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('delete from auth.users');
    await client.query('insert into auth.users (id, email) values ($1, $2)', [
      TEST_USER_ID,
      TEST_USER_EMAIL,
    ]);
    await client.query(
      `insert into public.detectors (user_id, brand, model, is_default)
       values ($1, 'XP', 'Deus II', true)`,
      [TEST_USER_ID],
    );
  } finally {
    await client.end();
  }
}
