import { test, expect } from '@playwright/test';
import { publishTrack, register, trackIdFrom, uniqueEmail } from './helpers';

test.describe.configure({ mode: 'serial' });

test('a public track is listed on the home page and playable by anyone', async ({ page, browser }) => {
  await register(page, uniqueEmail('pub'), 'Public Artist');
  const url = await publishTrack(page, { title: 'Open Air', visibility: 'Public' });

  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto('/');
  await expect(guestPage.getByRole('link', { name: 'Open Air' })).toBeVisible();

  await guestPage.goto(url);
  await expect(guestPage.getByRole('heading', { name: 'Open Air' })).toBeVisible();
  await guest.close();
});

test('an unlisted track opens with the link but never appears in a public list', async ({
  page,
  browser,
}) => {
  await register(page, uniqueEmail('unlisted'), 'Quiet Artist');
  const url = await publishTrack(page, { title: 'Hidden Path', visibility: 'Unlisted' });

  const guest = await browser.newContext();
  const guestPage = await guest.newPage();

  await guestPage.goto('/');
  await expect(guestPage.getByRole('link', { name: 'Hidden Path' })).toHaveCount(0);

  await guestPage.goto(url);
  await expect(guestPage.getByRole('heading', { name: 'Hidden Path' })).toBeVisible();
  await expect(guestPage.locator('.chip--unlisted')).toBeVisible();

  // Search engines are told to stay away from an unlisted page.
  await expect(guestPage.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await guest.close();
});

test('a private track is unreachable for everybody but its owner', async ({ page, browser }) => {
  await register(page, uniqueEmail('private'), 'Sealed Artist');
  const url = await publishTrack(page, { title: 'Sealed Take', visibility: 'Private' });
  const id = await trackIdFrom(page, url);

  // The owner can still open and stream it.
  await expect(page.getByRole('heading', { name: 'Sealed Take' })).toBeVisible();
  const ownerStream = await page.request.get(`/api/stream/${id}`, { maxRedirects: 0 });
  expect(ownerStream.status()).toBe(302);

  const guest = await browser.newContext();
  const guestPage = await guest.newPage();

  await guestPage.goto(url);
  await expect(guestPage.getByText('Nothing here')).toBeVisible();

  expect((await guestPage.request.get(`/api/stream/${id}`)).status()).toBe(404);
  expect((await guestPage.request.get(`/api/download/${id}`)).status()).toBe(404);
  expect((await guestPage.request.post(`/api/tracks/${id}/play`)).status()).toBe(404);

  // Another signed-in user is no better off.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await register(otherPage, uniqueEmail('other'), 'Someone Else');
  await otherPage.goto(url);
  await expect(otherPage.getByText('Nothing here')).toBeVisible();
  expect((await otherPage.request.get(`/api/stream/${id}`)).status()).toBe(404);

  await guest.close();
  await other.close();
});

test('downloads are served only when the owner allows them', async ({ page, browser }) => {
  await register(page, uniqueEmail('dl'), 'Sharing Artist');
  const url = await publishTrack(page, { title: 'Take It Home', downloads: true });
  const id = await trackIdFrom(page, url);

  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(url);

  await expect(guestPage.getByRole('link', { name: 'Download' })).toBeVisible();
  const allowed = await guestPage.request.get(`/api/download/${id}`);
  expect(allowed.status()).toBe(200);
  expect(allowed.headers()['content-disposition']).toContain('Take It Home');

  // Turn downloads off from the dashboard — no republish.
  await page.goto('/library');
  await page.getByRole('button', { name: 'Disable downloads' }).click();
  await expect(page.getByText('Downloads disabled')).toBeVisible();

  await guestPage.reload();
  await expect(guestPage.getByRole('link', { name: 'Download' })).toHaveCount(0);

  // The button is not the protection: the endpoint itself refuses.
  const refused = await guestPage.request.get(`/api/download/${id}`);
  expect(refused.status()).toBe(403);

  await guest.close();
});

test('a signed-in user cannot edit or delete somebody else’s track', async ({ page, browser }) => {
  await register(page, uniqueEmail('owner'), 'Rightful Owner');
  const url = await publishTrack(page, { title: 'Not Yours', downloads: true });
  const id = await trackIdFrom(page, url);

  const intruder = await browser.newContext();
  const intruderPage = await intruder.newPage();
  await register(intruderPage, uniqueEmail('intruder'), 'Intruder');

  const patched = await intruderPage.request.patch(`/api/tracks/${id}`, {
    data: { title: 'Hijacked', visibility: 'public', downloadsEnabled: true },
  });
  expect(patched.status()).toBe(404);

  const deleted = await intruderPage.request.delete(`/api/tracks/${id}`);
  expect(deleted.status()).toBe(404);

  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Not Yours' })).toBeVisible();
  await intruder.close();
});
