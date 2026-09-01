import { test, expect } from '@playwright/test';
import { login, publishTrack, register, toSeconds, uniqueEmail } from './helpers';

test.describe.configure({ mode: 'serial' });

test('a visitor can create an account, and lands on an empty library', async ({ page }) => {
  const email = uniqueEmail('signup');
  await register(page, email, 'Nova Grey');

  await expect(page.getByRole('heading', { name: 'My tracks' })).toBeVisible();
  await expect(page.getByText('No tracks yet')).toBeVisible();
  await expect(page.getByRole('link', { name: /Upload/ }).first()).toBeVisible();
});

test('log out and log back in', async ({ page }) => {
  const email = uniqueEmail('login');
  await register(page, email);

  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await page.waitForURL((url) => url.pathname === '/');
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Create account' })).toBeVisible();

  await login(page, email);
  await expect(page.getByRole('heading', { name: 'My tracks' })).toBeVisible();
});

test('upload, publish, and play the track as an anonymous visitor', async ({ page, browser }) => {
  const email = uniqueEmail('upload');
  await register(page, email, 'Nova Grey');

  const url = await publishTrack(page, { title: 'Midnight Drive', downloads: true });
  expect(url).toMatch(/\/track\/midnight-drive-[0-9a-f]{12}$/);

  // Fresh, signed-out context: this is what someone receiving the link sees.
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(url);

  await expect(guestPage.getByRole('heading', { name: 'Midnight Drive' })).toBeVisible();
  await expect(guestPage.locator('.track__artist')).toHaveText('Nova Grey');
  await expect(guestPage.getByRole('navigation').getByRole('link', { name: 'Create account' })).toBeVisible();

  // The waveform was computed at upload time and is drawn on a canvas.
  const wave = guestPage.locator('.track__wave canvas');
  await expect(wave).toBeVisible();
  const box = await wave.boundingBox();
  expect(box!.width).toBeGreaterThan(200);

  // Play.
  const transport = guestPage.locator('.playbtn');
  await transport.click();
  await expect(transport).toHaveAttribute('aria-label', 'Pause', { timeout: 20_000 });

  const elapsed = guestPage.locator('.track__times span').first();
  await expect
    .poll(async () => toSeconds(await elapsed.innerText()), { timeout: 20_000 })
    .toBeGreaterThan(0.9);

  // Pause.
  await transport.click();
  await expect(transport).toHaveAttribute('aria-label', 'Play');

  // Seek by clicking the waveform at ~70%.
  await wave.click({ position: { x: box!.width * 0.7, y: box!.height / 2 } });
  await expect.poll(async () => toSeconds(await elapsed.innerText())).toBeGreaterThan(3);

  await guest.close();
});

test('a first-time visitor starts at full volume, and can mute', async ({ browser }) => {
  const owner = await browser.newContext();
  const ownerPage = await owner.newPage();
  await register(ownerPage, uniqueEmail('volume'), 'Loud Artist');
  const url = await publishTrack(ownerPage, { title: 'Turn It Up' });

  const guest = await browser.newContext();
  const page = await guest.newPage();
  await page.goto(url);

  const volume = page.locator('.track__tools input[type=range]');
  await expect(volume).toHaveValue('1');
  await expect(page.getByRole('button', { name: 'Mute' })).toBeVisible();

  await page.getByRole('button', { name: 'Mute' }).click();
  await expect(volume).toHaveValue('0');
  await expect(page.getByRole('button', { name: 'Unmute' })).toBeVisible();

  await page.getByRole('button', { name: 'Unmute' }).click();
  await expect(volume).toHaveValue('1');

  await owner.close();
  await guest.close();
});

test('the mini player follows navigation', async ({ page }) => {
  const email = uniqueEmail('mini');
  await register(page, email, 'Nova Grey');
  const url = await publishTrack(page, { title: 'Persistent Groove' });

  await page.goto(url);
  await page.locator('.playbtn').click();
  await expect(page.locator('.mini')).toBeVisible();

  // Client-side navigation: the player must keep playing across pages.
  await page.getByRole('navigation').getByRole('link', { name: 'My tracks' }).click();
  await page.waitForURL('**/library');
  await expect(page.locator('.mini')).toBeVisible();
  await expect(page.locator('.mini__title')).toHaveText('Persistent Groove');
  await expect
    .poll(async () => toSeconds(await page.locator('.mini__time').first().innerText()), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0.9);
});
