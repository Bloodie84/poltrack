import { test, expect } from '@playwright/test';
import { FIXTURE, publishTrack, register, trackIdFrom, uniqueEmail } from './helpers';

test.describe.configure({ mode: 'serial' });

test('editing a track updates its page and its link', async ({ page }) => {
  await register(page, uniqueEmail('edit'), 'Edit Artist');
  const url = await publishTrack(page, { title: 'First Name' });

  await page.goto('/library');
  await page.getByRole('button', { name: 'Edit First Name' }).click();
  await page.getByLabel('Title').fill('Second Name');
  await page.getByLabel('Genre').fill('Ambient');
  await page.getByLabel('Description').fill('Recorded in one take.');
  await page.getByText('Unlisted', { exact: true }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByText('Changes saved')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Second Name' })).toBeVisible();
  await expect(page.locator('.chip--unlisted')).toBeVisible();

  // The old link keeps working (the id is what matters), and the new slug is live.
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Second Name' })).toBeVisible();
  await expect(page.getByText('Recorded in one take.')).toBeVisible();
  await expect(page.getByText('Ambient')).toBeVisible();
});

test('statistics count a real play, and only once per listener', async ({ page, browser }) => {
  await register(page, uniqueEmail('stats'), 'Stats Artist');
  const url = await publishTrack(page, { title: 'Counted Once', downloads: true });
  const id = await trackIdFrom(page, url);

  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(url);
  await guestPage.locator('.playbtn').click();

  // A play is only recorded after a few seconds of real audio.
  const plays = async () => {
    const res = await page.request.get(`/api/tracks/${id}/stats`);
    return (await res.json()).plays as number;
  };

  await expect.poll(plays, { timeout: 30_000, intervals: [500] }).toBe(1);

  // Listening again straight away must not inflate the counter.
  await guestPage.reload();
  await guestPage.locator('.playbtn').click();
  await guestPage.waitForTimeout(6000);
  expect(await plays()).toBe(1);

  const stats = await (await page.request.get(`/api/tracks/${id}/stats`)).json();
  expect(stats.uniqueListeners).toBe(1);
  expect(stats.downloads).toBe(0);

  // The 30-day curve ends today, and today is where the play landed.
  const today = new Date().toISOString().slice(0, 10);
  expect(stats.daily).toHaveLength(30);
  expect(stats.daily.at(-1).date).toBe(today);
  expect(stats.daily.at(-1).count).toBe(1);

  await guestPage.request.get(`/api/download/${id}`);
  await expect
    .poll(async () => (await (await page.request.get(`/api/tracks/${id}/stats`)).json()).downloads, {
      timeout: 10_000,
    })
    .toBe(1);

  await page.goto('/library');
  await page.getByRole('button', { name: /Statistics for Counted Once/ }).click();
  await expect(page.getByText('Unique listeners')).toBeVisible();
  await expect(page.locator('.stats__figures .stats__value').first()).toHaveText('1');
  await expect(page.locator('.stats__chart .stats__bar')).toHaveCount(30);
  await expect(page.getByText('No plays in the last 30 days yet.')).toHaveCount(0);

  await guest.close();
});

test('deleting a track removes it and breaks its link', async ({ page, browser }) => {
  await register(page, uniqueEmail('delete'), 'Delete Artist');
  const url = await publishTrack(page, { title: 'Temporary Thing' });

  await page.goto('/library');
  await page.getByRole('button', { name: 'Delete Temporary Thing' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();

  await expect(page.getByText('Track deleted')).toBeVisible();
  await expect(page.getByText('No tracks yet')).toBeVisible();

  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(url);
  await expect(guestPage.getByText('Nothing here')).toBeVisible();
  await guest.close();
});

test('share sheet and copy link work from the track page', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await register(page, uniqueEmail('share'), 'Share Artist');
  const url = await publishTrack(page, { title: 'Send This' });

  await page.goto(url);
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByText('Link copied')).toBeVisible();

  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe(url);

  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Share track' });
  await expect(dialog).toBeVisible();
  for (const name of ['WhatsApp', 'Messenger', 'X', 'Facebook', 'Email']) {
    await expect(dialog.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(dialog.getByText(url)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('settings let the artist rename themselves', async ({ page }) => {
  await register(page, uniqueEmail('settings'), 'Old Name');

  await page.goto('/settings');
  await page.getByLabel('Artist name').fill('New Name');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile updated')).toBeVisible();

  // The upload screen suggests the new name once a file is chosen.
  await page.goto('/upload');
  await page.setInputFiles('input[type=file]', FIXTURE);
  await expect(page.getByLabel('Artist')).toHaveValue('New Name');
});

test('protected pages redirect a signed-out visitor to the log-in screen', async ({ browser }) => {
  const guest = await browser.newContext();
  const page = await guest.newPage();

  for (const route of ['/upload', '/library', '/settings']) {
    await page.goto(route);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=%2F${route.slice(1)}`));
  }
  await guest.close();
});
