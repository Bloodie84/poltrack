import { test, expect } from '@playwright/test';
import { publishTrack, register, uniqueEmail } from './helpers';

test.describe.configure({ mode: 'serial' });

test('the whole flow works on a phone-sized viewport', async ({ page }) => {
  await register(page, uniqueEmail('mobile'), 'Pocket Artist');

  const url = await publishTrack(page, { title: 'Pocket Take', downloads: true });
  await page.goto(url);

  // Nothing may overflow horizontally.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);

  // Touch targets are reachable and the transport works.
  const transport = page.locator('.playbtn');
  await expect(transport).toBeVisible();
  const size = await transport.boundingBox();
  expect(size!.height).toBeGreaterThanOrEqual(44);

  await transport.tap();
  await expect(transport).toHaveAttribute('aria-label', 'Pause', { timeout: 20_000 });

  // The compact player docks at the bottom of the screen.
  const mini = page.locator('.mini');
  await expect(mini).toBeVisible();
  // Poll: the bar slides up when it appears.
  await expect
    .poll(async () =>
      mini.evaluate((el) => Math.round(el.getBoundingClientRect().bottom - window.innerHeight))
    )
    .toBeLessThanOrEqual(1);
  expect(await mini.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(90);

  // Seeking by touch on the waveform.
  const wave = page.locator('.track__wave canvas');
  const waveBox = await wave.boundingBox();
  await wave.tap({ position: { x: waveBox!.width * 0.6, y: waveBox!.height / 2 } });
  await expect
    .poll(async () => {
      const label = await page.locator('.track__times span').first().innerText();
      const [m, s] = label.split(':').map(Number);
      return m * 60 + s;
    })
    .toBeGreaterThan(2);

  // Share opens as a bottom sheet flush with the viewport — the dialog is
  // portalled out of the page content, so an animated ancestor cannot pin it.
  await page.getByRole('button', { name: 'Share', exact: true }).tap();
  const dialog = page.getByRole('dialog', { name: 'Share track' });
  await expect(dialog).toBeVisible();
  await expect
    .poll(async () =>
      dialog.evaluate((el) => Math.round(el.getBoundingClientRect().bottom - window.innerHeight))
    )
    .toBeLessThanOrEqual(1);
  expect(await dialog.evaluate((el) => el.parentElement?.parentElement?.tagName)).toBe('BODY');
});

test('the library is usable on a phone', async ({ page }) => {
  await register(page, uniqueEmail('mobile-lib'), 'Pocket Artist');
  await publishTrack(page, { title: 'Small Screen' });

  await page.goto('/library');
  await expect(page.getByRole('link', { name: 'Small Screen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share Small Screen' })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
