import { expect, test } from '@playwright/test';
import { colorDistance, decodePng, hexToRgba } from './png';

/**
 * Tuile PNG 1×1 transparente : les tests ne doivent dépendre ni du réseau ni
 * de la disponibilité des serveurs d'OpenStreetMap. Seul le comportement de
 * l'application est vérifié, pas celui d'un service tiers.
 */
const BLANK_TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: BLANK_TILE }),
  );
});

test.describe('Carte principale', () => {
  test('affiche la carte et le canevas WebGL', async ({ page }) => {
    await page.goto('/carte');

    // Le canevas MapLibre n'existe que si WebGL a démarré.
    const canvas = page.locator('canvas.maplibregl-canvas');
    await expect(canvas).toBeVisible({ timeout: 30_000 });

    const size = await canvas.boundingBox();
    expect(size?.width ?? 0).toBeGreaterThan(200);
    expect(size?.height ?? 0).toBeGreaterThan(200);
  });

  test('indique clairement que rien n’est enregistré sans backend', async ({ page }) => {
    await page.goto('/carte');
    await expect(page.getByRole('status').first()).toContainText('rien n’est enregistré');
  });

  test('affiche la position et son incertitude après activation du GPS', async ({ page }) => {
    await page.goto('/carte');
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Activer le GPS', exact: true }).click();

    // Coordonnées formatées en degrés décimaux.
    await expect(page.getByText('48.856600, 2.352200')).toBeVisible({ timeout: 15_000 });
    // L'incertitude est toujours annoncée, jamais masquée.
    await expect(page.getByText(/Précision/)).toContainText('± 8.0 m');
  });

  test('le marqueur de position est réellement peint sur la carte', async ({ page }) => {
    await page.goto('/carte');
    const canvas = page.locator('canvas.maplibregl-canvas');
    await expect(canvas).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Activer le GPS', exact: true }).click();

    const scale = page.locator('.maplibregl-ctrl-scale');
    await expect.poll(() => scale.innerText(), { timeout: 20_000 }).toMatch(/^\d+\s?m$/);
    // Laisse l'animation de caméra se terminer avant de lire les pixels.
    await page.waitForTimeout(1500);

    const box = await canvas.boundingBox();
    if (!box) throw new Error('canevas introuvable');

    // Le marqueur est peint par WebGL : seule une lecture de pixels prouve
    // qu'il s'affiche vraiment. Une régression du worker MapLibre (qui charge
    // toutes les sources GeoJSON) laisserait la carte silencieusement vide.
    const shot = await page.screenshot({
      clip: { x: box.x + box.width / 2 - 2, y: box.y + box.height / 2 - 2, width: 4, height: 4 },
    });

    const image = decodePng(shot);
    const accent = hexToRgba('#38bdf8');
    let closest = Number.POSITIVE_INFINITY;
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        closest = Math.min(closest, colorDistance(image.pixel(x, y), accent));
      }
    }

    expect(closest, 'le point de position devrait être peint au centre').toBeLessThan(60);
  });

  test('bascule entre degrés décimaux et DMS', async ({ page }) => {
    await page.goto('/carte');
    await page.getByRole('button', { name: 'Activer le GPS', exact: true }).click();

    const readout = page.getByText('48.856600, 2.352200');
    await expect(readout).toBeVisible({ timeout: 15_000 });
    await readout.click();

    await expect(page.getByText(/48°51'/)).toBeVisible();
  });

  test('cadre sur le terrain dès la première position reçue', async ({ page }) => {
    await page.goto('/carte');
    const scale = page.locator('.maplibregl-ctrl-scale');

    // Vue d'ouverture sans point d'accueil : la France entière (échelle en km).
    await expect(scale).toContainText('km', { timeout: 30_000 });

    await page.getByRole('button', { name: 'Activer le GPS', exact: true }).click();

    // Après cadrage, l'échelle descend au niveau du terrain (mètres).
    // `expect.poll` plutôt qu'une assertion de locator : cette dernière sonde à
    // chaque frame et entre en concurrence avec l'animation de la caméra.
    await expect
      .poll(() => scale.innerText(), { timeout: 20_000 })
      .toMatch(/^\d+\s?m$/);

    // Le suivi reste actif : notre propre recadrage ne doit pas le couper.
    await expect(page.getByRole('button', { name: 'Suivre ma position' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('les boutons de zoom agissent réellement sur la carte', async ({ page }) => {
    await page.goto('/carte');
    const scale = page.locator('.maplibregl-ctrl-scale');
    const zoomIn = page.getByRole('button', { name: 'Zoomer', exact: true });

    // Les contrôles restent désactivés tant que la carte n'accepte pas de
    // commande : un bouton visible doit toujours agir.
    await expect(zoomIn).toBeDisabled();
    await expect(zoomIn).toBeEnabled({ timeout: 30_000 });
    await expect(scale).toContainText('km');

    // Le libellé de l'échelle peut rester identique d'un niveau de zoom à
    // l'autre (« 100 km ») alors que la barre change de longueur : on compare
    // donc le couple texte + largeur rendue, réellement visible à l'écran.
    const state = async () => {
      const box = await scale.boundingBox();
      return `${await scale.innerText()}|${Math.round(box?.width ?? 0)}`;
    };

    const before = await state();
    await zoomIn.click();
    await expect.poll(state, { timeout: 10_000 }).not.toBe(before);

    const zoomed = await state();
    await page.getByRole('button', { name: 'Dézoomer' }).click();
    await expect.poll(state, { timeout: 10_000 }).not.toBe(zoomed);
  });

  test('active le suivi via le bouton de recentrage', async ({ page }) => {
    await page.goto('/carte');
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible({ timeout: 30_000 });

    const recenter = page.getByRole('button', { name: 'Suivre ma position' });
    await expect(recenter).toBeEnabled({ timeout: 30_000 });
    await expect(recenter).toHaveAttribute('aria-pressed', 'false');
    await recenter.click();
    await expect(recenter).toHaveAttribute('aria-pressed', 'true');
  });

  test('un déplacement manuel coupe le suivi', async ({ page }) => {
    await page.goto('/carte');
    const canvas = page.locator('canvas.maplibregl-canvas');
    await expect(canvas).toBeVisible({ timeout: 30_000 });

    const follow = page.getByRole('button', { name: 'Suivre ma position' });
    await expect(follow).toBeEnabled({ timeout: 30_000 });
    await follow.click();
    await expect(follow).toHaveAttribute('aria-pressed', 'true');

    // Glisser la carte doit rendre la main à l'utilisateur.
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canevas introuvable');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2 - 80, { steps: 8 });
    await page.mouse.up();

    await expect(follow).toHaveAttribute('aria-pressed', 'false');
  });

  test('déplie les détails GPS', async ({ page }) => {
    await page.goto('/carte');
    await page.getByRole('button', { name: 'Activer le GPS', exact: true }).click();
    await expect(page.getByText('48.856600, 2.352200')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Détails' }).click();
    await expect(page.getByText('Positions reçues')).toBeVisible();
    await expect(page.getByText('Altitude', { exact: true })).toBeVisible();
  });
});

test.describe('Navigation', () => {
  test('propose uniquement les écrans implémentés', async ({ page }) => {
    await page.goto('/carte');
    const nav = page.getByRole('navigation').first();
    await expect(nav.getByRole('link', { name: 'Carte' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Matériel' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Réglages' })).toBeVisible();
  });

  test('redirige la racine vers la carte', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/carte$/);
  });

  test('la page de configuration décrit la procédure Supabase', async ({ page }) => {
    await page.goto('/configuration');
    await expect(page.getByRole('heading', { name: 'Configuration du backend' })).toBeVisible();
    await expect(page.getByText('npm run db:migrate')).toBeVisible();
  });
});
