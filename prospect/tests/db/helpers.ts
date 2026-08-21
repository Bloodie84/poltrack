import { execFileSync } from 'node:child_process';
import { Client } from 'pg';

/**
 * Ces tests exigent une base PostgreSQL avec PostGIS et l'utilisateur
 * `postgres` (ou tout rôle superutilisateur). Ils appliquent les migrations
 * réelles : ce sont elles qui sont testées, pas une copie du schéma.
 */
export const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://postgres:postgres@127.0.0.1:5432/prospect_test';

export const USER_A = '11111111-1111-1111-1111-111111111111';
export const USER_B = '22222222-2222-2222-2222-222222222222';

/** Applique toutes les migrations sur une base vierge. */
export function migrate(): void {
  execFileSync(process.execPath, ['scripts/migrate.mjs'], {
    env: { ...process.env, DATABASE_URL },
    stdio: 'pipe',
  });
}

export async function connect(): Promise<Client> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  return client;
}

/** Réinitialise les données applicatives sans rejouer les migrations. */
export async function resetData(client: Client): Promise<void> {
  await client.query('reset role');
  await client.query('delete from auth.users');
  await client.query("delete from public.find_categories where user_id is not null");
}

/**
 * Exécute une requête en se faisant passer pour un utilisateur connecté :
 * rôle `authenticated` + claim JWT, exactement comme PostgREST le fait.
 */
export async function asUser<T>(
  client: Client,
  userId: string,
  run: () => Promise<T>,
): Promise<T> {
  await client.query('reset role');
  await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await client.query('set role authenticated');
  try {
    return await run();
  } finally {
    await client.query('reset role');
  }
}

/** Crée un compte auth ; le trigger doit provisionner profil et préférences. */
export async function createAuthUser(client: Client, id: string, email: string) {
  await client.query('reset role');
  await client.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
}
