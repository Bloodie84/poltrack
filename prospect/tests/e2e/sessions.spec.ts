import { expect, test } from '@playwright/test';

/**
 * Sans backend configuré, aucune sortie ne peut être enregistrée.
 * Ces tests vérifient que l'application le dit clairement au lieu d'afficher
 * des commandes qui n'auraient aucun effet.
 */
test.describe('Sorties sans backend', () => {
  test('la page Sorties demande une connexion', async ({ page }) => {
    await page.goto('/sorties');
    await expect(page.getByRole('heading', { name: 'Connexion requise' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
  });

  test('la carte ne propose pas de démarrer une sortie', async ({ page }) => {
    await page.goto('/carte');
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible({ timeout: 30_000 });

    // Aucun bouton sans effet : la commande n'est pas affichée du tout.
    await expect(page.getByRole('button', { name: 'Démarrer une sortie' })).toHaveCount(0);
    await expect(page.getByText('Passages')).toHaveCount(0);
  });

  test('le GPS reste utilisable sans compte', async ({ page }) => {
    await page.goto('/carte');
    await page.getByRole('button', { name: 'Activer le GPS', exact: true }).click();
    await expect(page.getByText('48.856600, 2.352200')).toBeVisible({ timeout: 15_000 });
  });
});
