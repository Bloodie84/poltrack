import { test, expect } from '@playwright/test';
import path from 'node:path';
import { FIXTURE, register, uniqueEmail } from './helpers';

const COVER = path.resolve('test/e2e/fixtures/cover.png');
const NOT_AUDIO = path.resolve('test/e2e/fixtures/notes.txt');

test.describe.configure({ mode: 'serial' });

test('an unsupported file is refused with an explanation', async ({ page }) => {
  await register(page, uniqueEmail('reject'));
  await page.goto('/upload');
  await page.setInputFiles('input[type=file]', NOT_AUDIO);

  await expect(page.locator('.alert--error')).toContainText('Unsupported file');
  await expect(page.getByText('Drop an audio file here')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish track' })).toHaveCount(0);
});

test('the upload screen reports the file, its analysis and the publish state', async ({ page }) => {
  await register(page, uniqueEmail('states'), 'State Artist');
  await page.goto('/upload');
  await page.setInputFiles('input[type=file]', FIXTURE);

  // File identity is shown straight away.
  await expect(page.getByText('tone.wav')).toBeVisible();

  // Once analysed, the technical read-out and the waveform preview appear.
  await expect(page.getByText('Uploaded and analysed')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/517 KB · 0:06 · 706 kbps · 44\.1 kHz/)).toBeVisible();
  await expect(page.locator('.upload-file canvas')).toBeVisible();

  // The title is pre-filled from the file name, and publishing needs one.
  await expect(page.getByLabel('Title')).toHaveValue('tone');
  await page.getByLabel('Title').fill('');
  await expect(page.getByRole('button', { name: 'Publish track' })).toBeDisabled();
  await page.getByLabel('Title').fill('Analysed Take');
  await expect(page.getByRole('button', { name: 'Publish track' })).toBeEnabled();

  // Cover upload.
  await page.locator('.cover-picker input[type=file]').setInputFiles(COVER);
  await expect(page.locator('.cover-picker img')).toBeVisible({ timeout: 20_000 });

  await page.getByLabel('Description').fill('A short test tone.');
  await page.getByRole('button', { name: 'Publish track' }).click();
  await expect(page.getByText('Your track is live')).toBeVisible({ timeout: 30_000 });

  // The published page carries the cover we uploaded.
  await page.getByRole('link', { name: 'Open track' }).click();
  await expect(page.getByRole('heading', { name: 'Analysed Take' })).toBeVisible();
  await expect(page.locator('.track__cover img')).toBeVisible();
  await expect(page.getByText('A short test tone.')).toBeVisible();
  await expect(page.locator('.track__specs')).toContainText('WAV');
  await expect(page.locator('.track__specs')).toContainText('706 kbps');
  await expect(page.locator('.track__specs')).toContainText('44.1 kHz');
});

test('removing the chosen file returns to the empty state', async ({ page }) => {
  await register(page, uniqueEmail('cancel'));
  await page.goto('/upload');
  await page.setInputFiles('input[type=file]', FIXTURE);
  await expect(page.getByText('tone.wav')).toBeVisible();

  await page.getByRole('button', { name: 'Remove file' }).click();
  await expect(page.getByText('Drop an audio file here')).toBeVisible();
  await expect(page.getByText('tone.wav')).toHaveCount(0);
});
