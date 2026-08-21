import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3210);
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * Tests de bout en bout sur le build de production.
 * Ils vérifient le parcours réel : carte affichée, GPS simulé, panneau
 * d'information, recentrage — sans dépendre de Supabase.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL,
    ...devices['Desktop Chrome'],
    // Permet d'utiliser un Chromium déjà installé (CI, conteneur) au lieu de
    // laisser Playwright en télécharger un : `PLAYWRIGHT_CHROMIUM_PATH=...`.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
    permissions: ['geolocation'],
    geolocation: { latitude: 48.8566, longitude: 2.3522, accuracy: 8 },
    locale: 'fr-FR',
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: baseURL,
    // Toujours démarrer un serveur neuf : réutiliser un serveur lancé avant un
    // rebuild ferait échouer les tests sur des fichiers obsolètes.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
