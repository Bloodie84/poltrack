import { startSupabaseStub } from '../harness/supabase-stub.mjs';
import { resetDatabase, TEST_USER_EMAIL, TEST_USER_ID } from '../harness/db.mjs';
import { STUB_URL } from '../../playwright.connected.config';

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://postgres:postgres@127.0.0.1:5432/prospect_test';

let stub: { close: () => Promise<void> } | null = null;

export default async function globalSetup() {
  await resetDatabase(DATABASE_URL);

  stub = await startSupabaseStub({
    databaseUrl: DATABASE_URL,
    userId: TEST_USER_ID,
    email: TEST_USER_EMAIL,
    port: Number(new URL(STUB_URL).port),
  });

  // Playwright n'expose pas d'état entre setup et teardown : on le stocke ici.
  (globalThis as { __stub?: unknown }).__stub = stub;
}
