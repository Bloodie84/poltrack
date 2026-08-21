import { Client } from 'pg';
import { expect, test, type Page } from '@playwright/test';
import { buildAuthCookie } from '../harness/session-cookie.mjs';
import { resetDatabase, TEST_USER_EMAIL, TEST_USER_ID } from '../harness/db.mjs';
import { STUB_URL } from '../../playwright.connected.config';

const BLANK_TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://postgres:postgres@127.0.0.1:5432/prospect_test';

test.beforeEach(async ({ context, page, baseURL }) => {
  // Chaque test repart d'une base propre : une sortie laissée ouverte par le
  // test précédent changerait l'écran attendu.
  await resetDatabase(DATABASE_URL);

  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: BLANK_TILE }),
  );

  const cookie = buildAuthCookie({
    url: STUB_URL,
    userId: TEST_USER_ID,
    email: TEST_USER_EMAIL,
  });

  await context.addCookies([{ ...cookie, url: baseURL ?? 'http://127.0.0.1:3310' }]);
});

/** Attend que la carte soit prête, puis démarre le GPS. */
async function openMapWithGps(page: Page) {
  await page.goto('/carte');
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Activer le GPS', exact: true }).click();
  await expect(page.getByText('48.856600, 2.352200')).toBeVisible({ timeout: 15_000 });
}

test.describe('Sortie de détection', () => {
  test('le bandeau ne réclame plus de connexion', async ({ page }) => {
    await page.goto('/carte');
    await expect(page.getByText('rien n’est enregistré')).toHaveCount(0);
  });

  test('démarrer une sortie affiche le chronomètre et enregistre des points', async ({ page }) => {
    await openMapWithGps(page);

    await page.getByRole('button', { name: 'Démarrer une sortie' }).click();

    await expect(page.getByText('Sortie en cours')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Temps')).toBeVisible();

    // Le premier fix est retenu dès le démarrage : le compteur doit bouger.
    await expect
      .poll(async () => page.getByText(/pt en attente|Synchronisé/).first().innerText(), {
        timeout: 30_000,
      })
      .toMatch(/pt en attente|Synchronisé/);

    // La sortie existe réellement en base : elle apparaît dans l'historique.
    await page.goto('/sorties');
    await expect(page.getByText('en cours')).toBeVisible();
  });

  test('mettre en pause puis reprendre', async ({ page }) => {
    await openMapWithGps(page);
    await page.getByRole('button', { name: 'Démarrer une sortie' }).click();
    await expect(page.getByText('Sortie en cours')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByText('Sortie en pause')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Reprendre' }).click();
    await expect(page.getByText('Sortie en cours')).toBeVisible({ timeout: 15_000 });
  });

  test('terminer la sortie produit un récapitulatif et une fiche', async ({ page }) => {
    await openMapWithGps(page);
    await page.getByRole('button', { name: 'Démarrer une sortie' }).click();
    await expect(page.getByText('Sortie en cours')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Terminer' }).click();
    await page.getByRole('button', { name: 'Confirmer' }).click();

    await expect(page.getByText('Sortie terminée')).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: 'Voir la sortie' }).click();
    await expect(page.getByText('Points GPS')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Informations' })).toBeVisible();
  });

  test('une seule sortie peut être ouverte à la fois', async ({ page }) => {
    await openMapWithGps(page);
    await page.getByRole('button', { name: 'Démarrer une sortie' }).click();
    await expect(page.getByText('Sortie en cours')).toBeVisible({ timeout: 15_000 });

    // Rechargement : la sortie ouverte est retrouvée, pas dupliquée.
    await page.reload();
    await expect(page.getByText('Sortie en cours')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Démarrer une sortie' })).toHaveCount(0);
  });

  test('le point de retour indique une direction', async ({ page }) => {
    await openMapWithGps(page);
    await page.getByRole('button', { name: 'Démarrer une sortie' }).click();
    await expect(page.getByText('Sortie en cours')).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText(/Départ ·|Retour ·|Voiture ·/)).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Trace GPS', () => {
  test('un déplacement réel produit des points et une distance en base', async ({
    context,
    page,
  }) => {
    await openMapWithGps(page);
    await page.getByRole('button', { name: 'Démarrer une sortie' }).click();
    await expect(page.getByText('Sortie en cours')).toBeVisible({ timeout: 15_000 });

    // Marche simulée vers le nord : ~22 m entre chaque position, au-delà de
    // l'intervalle et de la distance minimale de l'échantillonnage.
    for (let step = 1; step <= 5; step += 1) {
      await context.setGeolocation({
        latitude: 48.8566 + step * 0.0002,
        longitude: 2.3522,
        accuracy: 6,
      });
      await page.waitForTimeout(3500);
    }

    // La distance doit être AFFICHÉE, pas seulement calculée : un numérique
    // renvoyé sous forme de chaîne ferait apparaître un tiret.
    const distance = page.locator('[data-stat="Distance"]');
    await expect(distance).toBeVisible();
    await expect
      .poll(async () => distance.innerText(), { timeout: 30_000 })
      .toMatch(/\d+([.,]\d+)?\s?(m|km)/);

    await page.getByRole('button', { name: 'Terminer' }).click();
    await page.getByRole('button', { name: 'Confirmer' }).click();
    await expect(page.getByText('Sortie terminée')).toBeVisible({ timeout: 20_000 });

    // Vérification directement en base : c'est la donnée qui compte, pas
    // l'affichage.
    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    try {
      const points = await client.query<{ n: string }>(
        'select count(*) as n from public.gps_points',
      );
      const track = await client.query<{ point_count: number; distance_m: string }>(
        'select point_count, distance_m from public.tracks',
      );

      expect(Number(points.rows[0].n)).toBeGreaterThanOrEqual(4);
      expect(track.rows[0].point_count).toBeGreaterThanOrEqual(4);
      // Cinq pas d'environ 22 m : la distance doit être du bon ordre.
      expect(Number(track.rows[0].distance_m)).toBeGreaterThan(60);
      expect(Number(track.rows[0].distance_m)).toBeLessThan(160);
    } finally {
      await client.end();
    }
  });
});

test.describe('Réglages et matériel connectés', () => {
  test('les réglages sont chargés depuis la base', async ({ page }) => {
    await page.goto('/parametres');
    await expect(page.getByRole('heading', { name: 'Réglages' })).toBeVisible();
    await expect(page.getByLabel('Adresse e-mail')).toHaveValue(TEST_USER_EMAIL);
  });

  test('le détecteur par défaut apparaît', async ({ page }) => {
    await page.goto('/materiel');
    const card = page.getByRole('listitem').filter({ hasText: 'XP Deus II' });
    await expect(card).toBeVisible();
    await expect(card.getByText('par défaut')).toBeVisible();
  });
});
