import { test, expect } from '@playwright/test';
import { FIXTURE, publishTrack, register, trackIdFrom, uniqueEmail } from './helpers';

test.describe.configure({ mode: 'serial' });

test('a visitor uploads and publishes without ever registering', async ({ page, browser }) => {
  // No account, no session: straight to the upload screen.
  await page.goto('/');
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Upload' })).toBeVisible();
  await page.getByRole('link', { name: 'Upload a track' }).click();
  await page.waitForURL('**/upload');
  await expect(page.getByText('No account needed')).toBeVisible();

  await page.setInputFiles('input[type=file]', FIXTURE);
  await expect(page.getByText('Uploaded and analysed')).toBeVisible({ timeout: 60_000 });
  await page.getByLabel('Title').fill('Guest Take');
  await page.getByLabel('Artist').fill('Someone');
  await page.getByText('Allow downloads').click();
  await page.getByRole('button', { name: 'Publish track' }).click();

  await expect(page.getByText('Your track is live')).toBeVisible({ timeout: 30_000 });
  const url = (await page.locator('.share-link span').first().innerText()).trim();
  expect(url).toMatch(/\/track\/guest-take-[0-9a-f]{12}$/);

  // The offer to keep the account is made at the moment it matters.
  await expect(page.getByRole('heading', { name: 'Keep these tracks' })).toBeVisible();

  // Somebody else opens the link and listens — still no account anywhere.
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(url);
  await expect(guestPage.getByRole('heading', { name: 'Guest Take' })).toBeVisible();
  await guestPage.locator('.playbtn').click();
  await expect(guestPage.locator('.playbtn')).toHaveAttribute('aria-label', 'Pause', {
    timeout: 20_000,
  });
  await guest.close();
});

test('the guest can manage the track from the same browser, and nobody else can', async ({
  page,
  browser,
}) => {
  await page.goto('/upload');
  const url = await publishTrack(page, { title: 'Guest Managed', downloads: true });
  const id = await trackIdFrom(page, url);

  // My tracks works without an account.
  await page.goto('/library');
  await expect(page.getByRole('link', { name: 'Guest Managed' })).toBeVisible();
  await expect(page.getByText('These tracks live in this browser.')).toBeVisible();

  await page.getByRole('button', { name: 'Disable downloads' }).click();
  await expect(page.getByText('Downloads disabled')).toBeVisible();

  // A different browser — guest or not — cannot touch it.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto(url);
  const patched = await otherPage.request.patch(`/api/tracks/${id}`, {
    data: { downloadsEnabled: true },
  });
  expect(patched.status()).toBe(401);
  expect((await otherPage.request.get(`/api/download/${id}`)).status()).toBe(403);
  await other.close();
});

test('a guest can attach an e-mail later and keep every track', async ({ page, browser }) => {
  await page.goto('/upload');
  const url = await publishTrack(page, { title: 'Claimed Later' });

  const email = uniqueEmail('claimed');
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Keep these tracks' })).toBeVisible();
  await page.getByLabel('E-mail', { exact: true }).last().fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Save my account' }).click();
  await expect(page.getByText(/Saved to/)).toBeVisible({ timeout: 20_000 });

  // Sign out, sign back in from a clean browser: the track is still ours.
  const fresh = await browser.newContext();
  const freshPage = await fresh.newPage();
  await freshPage.goto('/login');
  await freshPage.getByLabel('E-mail').fill(email);
  await freshPage.getByLabel('Password').fill('password123');
  await freshPage.getByRole('button', { name: 'Log in' }).click();
  await freshPage.waitForURL('**/library');

  await expect(freshPage.getByRole('link', { name: 'Claimed Later' })).toBeVisible();
  await expect(freshPage.getByText('These tracks live in this browser.')).toHaveCount(0);

  // And the link never changed.
  await freshPage.goto(url);
  await expect(freshPage.getByRole('heading', { name: 'Claimed Later' })).toBeVisible();
  await fresh.close();
});

test('a registered account still works exactly as before', async ({ page }) => {
  await register(page, uniqueEmail('registered'), 'Registered Artist');
  await expect(page.getByRole('heading', { name: 'My tracks' })).toBeVisible();
  await expect(page.getByText('These tracks live in this browser.')).toHaveCount(0);

  const url = await publishTrack(page, { title: 'Account Take' });
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Account Take' })).toBeVisible();
  await expect(page.locator('.track__artist')).toHaveText('Registered Artist');
});
