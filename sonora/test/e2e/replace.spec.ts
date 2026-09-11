import { test, expect } from '@playwright/test';
import {
  FIXTURE_ALT, publishTrack, register, trackIdFrom, uniqueEmail,
} from './helpers';

test.describe.configure({ mode: 'serial' });

/** The caller's own folder in the audio bucket, as the sign route scopes it. */
async function ownStoragePrefix(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(async () => {
    const res = await fetch('/api/upload/sign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'audio', filename: 'probe.wav', size: 1000 }),
    });
    const body = await res.json();
    return String(body.path).split('/')[0];
  });
}

/** Runs the replace flow inside the edit modal and waits for the confirmation. */
async function replaceAudio(page: import('@playwright/test').Page, title: string) {
  await page.goto('/library');
  await page.getByRole('button', { name: `Edit ${title}` }).click();
  await page.setInputFiles('.replace input[type=file]', FIXTURE_ALT);

  await expect(page.getByRole('button', { name: 'Replace audio' })).toBeVisible({
    timeout: 60_000,
  });
  // The artist is told what they are trading before anything is uploaded.
  await expect(page.locator('.replace__specs')).toContainText('0:06 → 0:11');

  await page.getByRole('button', { name: 'Replace audio' }).click();
  await expect(page.getByText('Anyone opening the link now hears the new file.')).toBeVisible({
    timeout: 60_000,
  });
}

test('replacing the file keeps the link, the page and the play count', async ({
  page,
  browser,
}) => {
  await register(page, uniqueEmail('replace'), 'Revision Artist');
  const url = await publishTrack(page, { title: 'Second Pass', visibility: 'Public' });

  // A real play, so there is a count that replacing must not reset.
  const listener = await browser.newContext();
  const listenerPage = await listener.newPage();
  await listenerPage.goto(url);
  await listenerPage.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(listenerPage.getByRole('button', { name: 'Pause', exact: true }).first()).toBeVisible();
  await listenerPage.waitForTimeout(3_000);
  await listener.close();

  await page.goto(url);
  await expect(page.getByText('1 play')).toBeVisible({ timeout: 20_000 });

  await replaceAudio(page, 'Second Pass');

  // The same URL, not a new one: that is the whole point.
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Second Pass' })).toBeVisible();
  await expect(page.locator('.track__times span').last()).toHaveText('0:11');
  await expect(page.getByText('1 play')).toBeVisible();

  // And it is the new file that plays.
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
});

test('the library row shows the new length straight away', async ({ page }) => {
  await register(page, uniqueEmail('replace-row'), 'Row Artist');
  await publishTrack(page, { title: 'Row Take', visibility: 'Public' });

  await replaceAudio(page, 'Row Take');
  await page.getByRole('button', { name: 'Close' }).first().click();

  await expect(page.locator('.trackrow', { hasText: 'Row Take' })).toContainText('0:11');
});

test('nobody else can replace the audio of a track they do not own', async ({ page, browser }) => {
  await register(page, uniqueEmail('owner'), 'Owner Artist');
  const url = await publishTrack(page, { title: 'Not Yours', visibility: 'Public' });
  const id = await trackIdFrom(page, url);

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await register(otherPage, uniqueEmail('intruder'), 'Intruder');

  // A path in the intruder's own folder, so the ownership of the *track* is
  // what has to refuse this, not the shape of the path.
  const intruderPrefix = await ownStoragePrefix(otherPage);
  const res = await otherPage.request.post(`/api/tracks/${id}/audio`, {
    data: { audioPath: `${intruderPrefix}/take/mix.wav`, duration: 30 },
  });
  expect(res.status()).toBe(404);

  // And a path outside their own folder is refused before that.
  const crossFolder = await otherPage.request.post(`/api/tracks/${id}/audio`, {
    data: { audioPath: 'somebody-else/take/mix.wav', duration: 30 },
  });
  expect(crossFolder.status()).toBe(403);
  await other.close();

  // The victim's track is untouched.
  await page.goto(url);
  await expect(page.locator('.track__times span').last()).toHaveText('0:06');
});

test('a track cannot be pointed at a file that was never uploaded', async ({ page }) => {
  await register(page, uniqueEmail('ghost'), 'Ghost Artist');
  const url = await publishTrack(page, { title: 'Ghost Take', visibility: 'Public' });
  const id = await trackIdFrom(page, url);

  // A path inside the caller's own folder, so ownership passes — but nothing is
  // there. A track pointing at nothing would be a track that used to work.
  const prefix = await ownStoragePrefix(page);

  const res = await page.request.post(`/api/tracks/${id}/audio`, {
    data: { audioPath: `${prefix}/made-up/never-uploaded.wav`, duration: 6 },
  });
  expect(res.status()).toBe(400);

  // The track still plays its original file.
  await page.goto(url);
  await expect(page.locator('.track__times span').last()).toHaveText('0:06');
});
