import { test, expect } from '@playwright/test';
import { FIXTURE_ALT, publishTrack, register, trackIdFrom, uniqueEmail } from './helpers';

test.describe.configure({ mode: 'serial' });

test('playback gets a lighter copy while the download stays the master', async ({
  page,
  browser,
}) => {
  await register(page, uniqueEmail('rendition'), 'Light Artist');
  const url = await publishTrack(page, {
    title: 'Heavy Master',
    visibility: 'Public',
    downloads: true,
  });
  const id = await trackIdFrom(page, url);

  const streamed = await page.request.get(`/api/stream/${id}`);
  const downloaded = await page.request.get(`/api/download/${id}`);
  expect(streamed.status()).toBe(200);
  expect(downloaded.status()).toBe(200);

  const light = (await streamed.body()).byteLength;
  const master = (await downloaded.body()).byteLength;

  // The fixture is six seconds of 44.1 kHz WAV; 128 kbps MP3 of the same audio
  // is several times smaller. This is the whole point of the feature, so it is
  // asserted on the bytes rather than on a column.
  expect(master).toBeGreaterThan(400_000);
  expect(light).toBeLessThan(master / 2);
  expect(light).toBeGreaterThan(10_000);
  // What comes back is an MP3, not the WAV under another name: 'ID3' or a
  // frame sync, never 'RIFF'.
  const head = (await streamed.body()).subarray(0, 4);
  expect(head.toString('ascii')).not.toBe('RIFF');
  expect(head[0] === 0x49 || head[0] === 0xff).toBeTruthy();

  // A listener hears the same lighter copy, and the track still plays.
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(url);
  await guestPage.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(guestPage.getByRole('button', { name: 'Pause', exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
  const guestStream = await guestPage.request.get(`/api/stream/${id}`);
  expect((await guestStream.body()).byteLength).toBeLessThan(master / 2);
  await guest.close();
});

test('with downloads off, the master is never handed out', async ({ page, browser }) => {
  await register(page, uniqueEmail('nodl'), 'Closed Artist');
  const url = await publishTrack(page, { title: 'Master Withheld', visibility: 'Public' });
  const id = await trackIdFrom(page, url);

  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(url);

  // Refused outright…
  expect((await guestPage.request.get(`/api/download/${id}`)).status()).toBe(403);

  // …and what the player is given is not the master either, which is what the
  // switch used to fail to mean.
  const streamed = await guestPage.request.get(`/api/stream/${id}`);
  expect(streamed.status()).toBe(200);
  expect((await streamed.body()).byteLength).toBeLessThan(200_000);
  await guest.close();
});

test('replacing the file makes a new lighter copy, not a return to the master', async ({
  page,
}) => {
  await register(page, uniqueEmail('relight'), 'Relight Artist');
  const url = await publishTrack(page, {
    title: 'Take Two',
    visibility: 'Public',
    downloads: true,
  });
  const id = await trackIdFrom(page, url);

  await page.goto('/library');
  await page.getByRole('button', { name: 'Edit Take Two' }).click();
  await page.setInputFiles('.replace input[type=file]', FIXTURE_ALT);
  await page.getByRole('button', { name: 'Replace audio' }).click();
  await expect(page.getByText('Anyone opening the link now hears the new file.')).toBeVisible({
    timeout: 90_000,
  });

  const streamed = await page.request.get(`/api/stream/${id}`);
  const downloaded = await page.request.get(`/api/download/${id}`);
  const light = (await streamed.body()).byteLength;
  const master = (await downloaded.body()).byteLength;

  // The eleven-second take, and still a lighter copy of it.
  expect(master).toBeGreaterThan(900_000);
  expect(light).toBeLessThan(master / 2);
});
