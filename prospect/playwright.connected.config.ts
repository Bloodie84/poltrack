import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de bout en bout AVEC backend.
 *
 * Aucun projet Supabase n'étant joignable depuis l'environnement de test, la
 * vraie base PostgreSQL/PostGIS est exposée par `tests/harness/supabase-stub`
 * via l'API que le client Supabase attend. Le SQL, les fonctions et la RLS
 * exercés sont ceux du produit ; seule la couche HTTP est simulée.
 *
 * Le build doit avoir été fait avec les mêmes variables NEXT_PUBLIC_* :
 *   npm run test:e2e:connected
 */
const PORT = Number(process.env.E2E_PORT ?? 3310);
const baseURL = `http://127.0.0.1:${PORT}`;

export const STUB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';

export default defineConfig({
  testDir: './tests/connected',
  globalSetup: './tests/connected/global-setup.ts',
  globalTeardown: './tests/connected/global-teardown.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL,
    ...devices['Desktop Chrome'],
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
    permissions: ['geolocation'],
    geolocation: { latitude: 48.8566, longitude: 2.3522, accuracy: 6 },
    locale: 'fr-FR',
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: STUB_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
});
