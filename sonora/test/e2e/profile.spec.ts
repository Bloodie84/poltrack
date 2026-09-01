import { test, expect } from '@playwright/test';
import { publishTrack, register, uniqueEmail } from './helpers';

test.describe.configure({ mode: 'serial' });

test('an artist page lists only public tracks, and anyone can open it', async ({
  page,
  browser,
}) => {
  await register(page, uniqueEmail('profile'), 'Nova Grey');

  await publishTrack(page, { title: 'Open Track', visibility: 'Public' });
  await publishTrack(page, { title: 'Link Only', visibility: 'Unlisted' });
  await publishTrack(page, { title: 'Kept Back', visibility: 'Private' });

  // The owner reaches it from the dashboard.
  await page.goto('/library');
  await page.getByRole('link', { name: 'Public page' }).click();
  await page.waitForURL(/\/u\/nova-grey-[0-9a-f]{12}$/);
  const url = page.url();

  await expect(page.getByRole('heading', { name: 'Nova Grey' })).toBeVisible();
  await expect(page.getByText('1 public track')).toBeVisible();

  // A signed-out visitor sees the page and the public track — nothing else.
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(url);

  await expect(guestPage.getByRole('heading', { name: 'Nova Grey' })).toBeVisible();
  await expect(guestPage.getByRole('link', { name: 'Open Track' })).toBeVisible();
  await expect(guestPage.getByRole('link', { name: 'Link Only' })).toHaveCount(0);
  await expect(guestPage.getByRole('link', { name: 'Kept Back' })).toHaveCount(0);

  // And the track plays straight from the artist page.
  await guestPage.locator('.trackcard__cover').first().click();
  await expect(guestPage.locator('.mini')).toBeVisible();
  await expect(guestPage.locator('.mini__title')).toHaveText('Open Track');

  await guest.close();
});

test('a public track links back to its artist, an unlisted one does not', async ({ page }) => {
  await register(page, uniqueEmail('link'), 'Quiet Maker');

  const publicUrl = await publishTrack(page, { title: 'Signed Work', visibility: 'Public' });
  await page.goto(publicUrl);
  await page.getByRole('link', { name: /All tracks by Quiet Maker/ }).click();
  await page.waitForURL(/\/u\/quiet-maker-[0-9a-f]{12}$/);
  await expect(page.getByRole('link', { name: 'Signed Work' })).toBeVisible();

  const unlistedUrl = await publishTrack(page, { title: 'Side Note', visibility: 'Unlisted' });
  await page.goto(unlistedUrl);
  await expect(page.getByRole('link', { name: /All tracks by/ })).toHaveCount(0);
});

test('renaming yourself never breaks a link that is already out there', async ({ page }) => {
  await register(page, uniqueEmail('rename'), 'First Name');
  await publishTrack(page, { title: 'Steady Take', visibility: 'Public' });

  await page.goto('/library');
  await page.getByRole('link', { name: 'Public page' }).click();
  await page.waitForURL(/\/u\//);
  const oldUrl = page.url();

  await page.goto('/settings');
  await page.getByLabel('Artist name').fill('Second Name');
  await page.getByLabel('About you', { exact: false }).fill('Recorded at home.');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile updated')).toBeVisible();

  // The old URL still resolves — the slug changed, the id did not.
  await page.goto(oldUrl);
  await expect(page.getByRole('heading', { name: 'Second Name' })).toBeVisible();
  await expect(page.getByText('Recorded at home.')).toBeVisible();
});

test('an unknown artist page is a 404, not a blank one', async ({ page }) => {
  await page.goto('/u/nobody-000000000000');
  await expect(page.getByText('Nothing here')).toBeVisible();
});

test('a guest page takes the artist name they typed', async ({ page }) => {
  await page.goto('/upload');
  const url = await publishTrack(page, { title: 'Nameless Guest', visibility: 'Public' });

  await page.goto(url);
  await page.getByRole('link', { name: /All tracks by Guest Artist/ }).click();
  await page.waitForURL(/\/u\/guest-artist-[0-9a-f]{12}$/);
  await expect(page.getByRole('heading', { name: 'Guest Artist' })).toBeVisible();
});
