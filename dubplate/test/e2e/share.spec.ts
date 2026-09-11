import { test, expect } from '@playwright/test';
import { publishTrack, register, toSeconds, uniqueEmail } from './helpers';

test.describe.configure({ mode: 'serial' });

/** Width and height read straight out of the PNG header. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

let publicUrl = '';

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await register(page, uniqueEmail('share'), 'Preview Artist');
  publicUrl = await publishTrack(page, { title: 'Signal Test', visibility: 'Public' });
  await context.close();
});

test('a shared link carries a preview card drawn for the track', async ({ page, request }) => {
  await page.goto(publicUrl);

  const image = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(image).toBeTruthy();
  // The card is the same picture on X, which is what makes the large layout honest.
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    'content',
    'summary_large_image'
  );
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', image!);

  const res = await request.get(image!);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('image/png');
  // A card that outlived an edit would show a name the track no longer has.
  expect(res.headers()['cache-control']).not.toContain('immutable');

  const { width, height } = pngSize(await res.body());
  expect({ width, height }).toEqual({ width: 1200, height: 630 });
});

test('a private track gives away nothing through its preview card', async ({
  browser,
  request,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await register(page, uniqueEmail('privcard'), 'Sealed Artist');
  const url = await publishTrack(page, { title: 'Sealed Preview', visibility: 'Private' });
  await context.close();

  // `request` carries no session, which is exactly what a preview crawler is.
  const secret = await request.get(`${url}/opengraph-image`);
  const unknown = await request.get(
    new URL('/track/nothing-here-000000000000/opengraph-image', url).toString()
  );
  expect(secret.status()).toBe(200);
  expect(unknown.status()).toBe(200);
  // Byte for byte the card shown for a track that does not exist: the title is
  // not in it, and neither is anything else about the track.
  expect(await secret.body()).toEqual(await unknown.body());
});

test('a link can point at a moment, and playback starts there', async ({ page }) => {
  await page.goto(`${publicUrl}?t=4`);

  await expect(page.getByText('Starts at 0:04')).toBeVisible();
  const readout = page.locator('.track__times span').first();
  await expect(readout).toHaveText('0:04');

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect
    .poll(async () => toSeconds(await readout.innerText()), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(4);
});

test('the visitor can refuse the timestamp and start at the beginning', async ({ page }) => {
  await page.goto(`${publicUrl}?t=4`);
  await page.getByRole('button', { name: 'play from the beginning' }).click();

  await expect(page.getByText('Starts at 0:04')).toHaveCount(0);
  await expect(page.locator('.track__times span').first()).toHaveText('0:00');
});

test('a nonsense timestamp is ignored rather than obeyed', async ({ page }) => {
  for (const value of ['abc', '-30', '999999']) {
    await page.goto(`${publicUrl}?t=${encodeURIComponent(value)}`);
    await expect(page.locator('.track__cue')).toHaveCount(0);
    await expect(page.locator('.track__times span').first()).toHaveText('0:00');
  }
});

test('the share sheet offers the current position, and only when asked', async ({ page }) => {
  await page.goto(`${publicUrl}?t=4`);
  await page.getByRole('button', { name: 'Share' }).click();

  const link = page.locator('.share-link span').first();
  await expect(link).toHaveText(publicUrl);

  const startAt = page.getByRole('checkbox', { name: 'Start at 0:04' });
  await startAt.check();
  await expect(link).toHaveText(`${publicUrl}?t=0:04`);

  await startAt.uncheck();
  await expect(link).toHaveText(publicUrl);
});
