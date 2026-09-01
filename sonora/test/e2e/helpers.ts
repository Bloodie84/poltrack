import { expect, type Page } from '@playwright/test';
import path from 'node:path';

export const FIXTURE = path.resolve('test/e2e/fixtures/tone.wav');

/** '1:07' -> 67 */
export function toSeconds(label: string): number {
  const parts = label.trim().split(':').map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
}

export function uniqueEmail(prefix = 'user') {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@sonora.test`;
}

export async function register(page: Page, email: string, displayName = 'Test Artist') {
  await page.goto('/register');
  await page.getByLabel('Artist name').fill(displayName);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/library', { timeout: 30_000 });
}

export async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL('**/library', { timeout: 30_000 });
}

interface PublishOptions {
  title: string;
  visibility?: 'Public' | 'Unlisted' | 'Private';
  downloads?: boolean;
}

/** Runs the whole upload screen and returns the public URL of the new track. */
export async function publishTrack(page: Page, opts: PublishOptions): Promise<string> {
  await page.goto('/upload');
  await page.setInputFiles('input[type=file]', FIXTURE);

  await expect(page.getByText('Uploaded and analysed')).toBeVisible({ timeout: 60_000 });

  await page.getByLabel('Title').fill(opts.title);
  if (opts.visibility && opts.visibility !== 'Public') {
    await page.getByText(opts.visibility, { exact: true }).click();
  }
  if (opts.downloads) {
    await page.getByText('Allow downloads').click();
  }

  await page.getByRole('button', { name: 'Publish track' }).click();
  await expect(page.getByText('Your track is live')).toBeVisible({ timeout: 30_000 });

  const link = await page.locator('.share-link span').first().innerText();
  return link.trim();
}

/** Reads the track's internal id from the owner's view of the page. */
export async function trackIdFrom(page: Page, url: string): Promise<string> {
  await page.goto(url);
  const href = await page.locator('a[href^="/api/download/"]').first().getAttribute('href');
  expect(href).toBeTruthy();
  return href!.replace('/api/download/', '');
}
