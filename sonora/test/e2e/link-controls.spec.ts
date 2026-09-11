import { test, expect, type Page } from '@playwright/test';
import { publishTrack, register, trackIdFrom, uniqueEmail } from './helpers';

test.describe.configure({ mode: 'serial' });

async function openLinkControls(page: Page, title: string) {
  await page.goto('/library');
  await page.getByRole('button', { name: `Edit ${title}` }).click();
  await expect(page.getByText('Link controls')).toBeVisible();
}

test('a password on a link keeps everyone out until they type it', async ({ page, browser }) => {
  await register(page, uniqueEmail('lock'), 'Locking Artist');
  const url = await publishTrack(page, { title: 'Behind A Door', visibility: 'Public' });
  const id = await trackIdFrom(page, url);

  await openLinkControls(page, 'Behind A Door');
  await page.getByPlaceholder('At least 6 characters').fill('correct-horse');
  await page.getByRole('button', { name: 'Lock', exact: true }).click();
  await expect(page.getByText('Link locked')).toBeVisible();

  const guest = await browser.newContext();
  const guestPage = await guest.newPage();

  // Nothing about the track is on the page — not the title, not the artist.
  await guestPage.goto(url);
  await expect(guestPage.getByRole('heading', { name: 'This link is protected' })).toBeVisible();
  await expect(guestPage.getByText('Behind A Door')).toHaveCount(0);
  await expect(guestPage).toHaveTitle(/protected/i);

  // Hiding the player is not the protection: the routes refuse too.
  expect((await guestPage.request.get(`/api/stream/${id}`)).status()).toBe(404);
  expect((await guestPage.request.get(`/api/download/${id}`)).status()).toBe(404);

  // And it is gone from the public listings.
  await guestPage.goto('/');
  await expect(guestPage.getByRole('link', { name: 'Behind A Door' })).toHaveCount(0);

  // A wrong password says so and changes nothing.
  await guestPage.goto(url);
  await guestPage.getByPlaceholder('Password').fill('let-me-in');
  await guestPage.getByRole('button', { name: 'Open' }).click();
  await expect(guestPage.getByRole('alert')).toBeVisible();
  await expect(guestPage.getByRole('heading', { name: 'This link is protected' })).toBeVisible();

  // The right one opens it, and it stays open for that browser.
  await guestPage.getByPlaceholder('Password').fill('correct-horse');
  await guestPage.getByRole('button', { name: 'Open' }).click();
  await expect(guestPage.getByRole('heading', { name: 'Behind A Door' })).toBeVisible({
    timeout: 20_000,
  });
  expect((await guestPage.request.get(`/api/stream/${id}`)).status()).toBe(200);

  await guestPage.reload();
  await expect(guestPage.getByRole('heading', { name: 'Behind A Door' })).toBeVisible();

  // Another browser is still outside: the pass is a cookie, not a state change.
  const stranger = await browser.newContext();
  const strangerPage = await stranger.newPage();
  await strangerPage.goto(url);
  await expect(strangerPage.getByRole('heading', { name: 'This link is protected' })).toBeVisible();

  await guest.close();
  await stranger.close();
});

test('a pass for one link opens nothing else', async ({ page, browser }) => {
  await register(page, uniqueEmail('twolocks'), 'Two Locks');
  const first = await publishTrack(page, { title: 'Door One', visibility: 'Public' });
  const second = await publishTrack(page, { title: 'Door Two', visibility: 'Public' });

  for (const title of ['Door One', 'Door Two']) {
    await openLinkControls(page, title);
    await page.getByPlaceholder('At least 6 characters').fill(`pass-${title.replace(' ', '')}`);
    await page.getByRole('button', { name: 'Lock', exact: true }).click();
    await expect(page.getByText('Link locked')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).first().click();
  }

  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(first);
  await guestPage.getByPlaceholder('Password').fill('pass-DoorOne');
  await guestPage.getByRole('button', { name: 'Open' }).click();
  await expect(guestPage.getByRole('heading', { name: 'Door One' })).toBeVisible({
    timeout: 20_000,
  });

  await guestPage.goto(second);
  await expect(guestPage.getByRole('heading', { name: 'This link is protected' })).toBeVisible();
  await guest.close();
});

test('removing the password puts the track back', async ({ page, browser }) => {
  await register(page, uniqueEmail('unlock'), 'Unlocking Artist');
  const url = await publishTrack(page, { title: 'Reopened', visibility: 'Public' });

  await openLinkControls(page, 'Reopened');
  await page.getByPlaceholder('At least 6 characters').fill('temporary1');
  await page.getByRole('button', { name: 'Lock', exact: true }).click();
  await expect(page.getByText('Link locked')).toBeVisible();

  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Password removed')).toBeVisible();

  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(url);
  await expect(guestPage.getByRole('heading', { name: 'Reopened' })).toBeVisible();
  await guest.close();
});

test('an expiry date is offered, shown, and can be taken back off', async ({ page }) => {
  await register(page, uniqueEmail('expiry'), 'Expiring Artist');
  await publishTrack(page, { title: 'Time Limited', visibility: 'Public' });

  await openLinkControls(page, 'Time Limited');
  await page.getByRole('button', { name: '24 hours' }).click();
  await expect(page.getByText('Expiry set')).toBeVisible();
  await expect(page.getByText(/Stops working on/)).toBeVisible();

  await page.getByRole('button', { name: 'Close' }).first().click();
  await expect(page.locator('.trackrow', { hasText: 'Time Limited' })).toContainText('Until');

  await openLinkControls(page, 'Time Limited');
  await page.getByRole('button', { name: 'Never' }).click();
  await expect(page.getByText('The link no longer expires')).toBeVisible();
});

test('a link past its date stops working for everyone but its owner', async ({ page, browser }) => {
  await register(page, uniqueEmail('stale'), 'Stale Artist');
  const url = await publishTrack(page, { title: 'Yesterdays Mix', visibility: 'Public' });
  const id = await trackIdFrom(page, url);

  // Backdating is the only way to test this without waiting a day; it goes
  // through the same route the interface uses.
  const res = await page.request.post(`/api/tracks/${id}/link`, {
    data: { expiresAt: new Date(Date.now() - 60_000).toISOString() },
  });
  expect(res.ok()).toBeTruthy();

  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(url);
  await expect(guestPage.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
  await expect(guestPage.getByText('Yesterdays Mix')).toHaveCount(0);
  expect((await guestPage.request.get(`/api/stream/${id}`)).status()).toBe(404);

  await guestPage.goto('/');
  await expect(guestPage.getByRole('link', { name: 'Yesterdays Mix' })).toHaveCount(0);
  await guest.close();

  // The owner still reaches their own track and can lift the date.
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Yesterdays Mix' })).toBeVisible();
});

test('the preview card of a locked link shows nothing about the track', async ({
  page,
  request,
}) => {
  await register(page, uniqueEmail('lockcard'), 'Card Artist');
  const url = await publishTrack(page, { title: 'Sealed Card', visibility: 'Public' });

  await openLinkControls(page, 'Sealed Card');
  await page.getByPlaceholder('At least 6 characters').fill('sealed-card');
  await page.getByRole('button', { name: 'Lock', exact: true }).click();
  await expect(page.getByText('Link locked')).toBeVisible();

  const locked = await request.get(`${url}/opengraph-image`);
  const unknown = await request.get(
    new URL('/track/nothing-here-000000000000/opengraph-image', url).toString()
  );
  expect(await locked.body()).toEqual(await unknown.body());
});

test('a password shorter than six characters is refused', async ({ page }) => {
  await register(page, uniqueEmail('shortpw'), 'Short Artist');
  const url = await publishTrack(page, { title: 'Weak Lock', visibility: 'Public' });
  const id = await trackIdFrom(page, url);

  // The button will not submit it, and neither will the route.
  await openLinkControls(page, 'Weak Lock');
  await page.getByPlaceholder('At least 6 characters').fill('abc');
  await expect(page.getByRole('button', { name: 'Lock', exact: true })).toBeDisabled();

  const res = await page.request.post(`/api/tracks/${id}/link`, { data: { password: 'abc' } });
  expect(res.status()).toBe(400);
});
