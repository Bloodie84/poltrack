#!/usr/bin/env node
/**
 * Smoke-tests a deployed Sonora against its public surface.
 *
 *   node scripts/smoke.mjs https://your-site.com
 *
 * It checks what a visitor and a search engine actually hit, and that nothing
 * private is reachable without a session. Exits non-zero on the first failure
 * so it can gate a deploy.
 */
const base = (process.argv[2] ?? '').replace(/\/$/, '');
if (!base) {
  console.error('usage: node scripts/smoke.mjs https://your-site.com');
  process.exit(2);
}

let failures = 0;

async function check(label, fn) {
  try {
    const detail = await fn();
    console.log(`  ok    ${label}${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    failures += 1;
    console.error(`  FAIL  ${label} — ${e.message}`);
  }
}

const get = (path, init) =>
  fetch(`${base}${path}`, { redirect: 'manual', headers: { 'user-agent': 'sonora-smoke' }, ...init });

console.log(`\nSmoke-testing ${base}\n`);

await check('the instance is configured', async () => {
  const res = await get('/api/health');
  if (res.status !== 200) throw new Error(`/api/health returned ${res.status} — check the server env`);
  return 'health 200';
});

await check('the home page renders', async () => {
  const res = await get('/');
  if (res.status !== 200) throw new Error(`got ${res.status}`);
  const html = await res.text();
  if (!html.includes('Upload a track')) throw new Error('home page is missing its main call to action');
  return `${html.length} bytes`;
});

await check('uploading needs no account', async () => {
  const res = await get('/upload');
  if (res.status !== 200) throw new Error(`/upload returned ${res.status}, expected 200`);
});

await check('the dashboard is behind a session', async () => {
  const res = await get('/library');
  if (res.status !== 307 && res.status !== 302) throw new Error(`expected a redirect, got ${res.status}`);
  const to = res.headers.get('location') ?? '';
  if (!to.includes('/login')) throw new Error(`redirected to ${to}`);
});

await check('an unknown track is a 404', async () => {
  const res = await get('/track/nothing-000000000000');
  if (res.status !== 404) throw new Error(`got ${res.status}`);
});

await check('an unknown artist page is a 404', async () => {
  const res = await get('/u/nobody-000000000000');
  if (res.status !== 404) throw new Error(`got ${res.status}`);
});

await check('a private stream is refused', async () => {
  const res = await get('/api/stream/00000000-0000-0000-0000-000000000000');
  if (res.status !== 404) throw new Error(`expected 404, got ${res.status}`);
});

await check('security headers are set', async () => {
  const res = await get('/');
  const missing = ['x-content-type-options', 'referrer-policy', 'x-frame-options'].filter(
    (h) => !res.headers.get(h)
  );
  if (missing.length) throw new Error(`missing ${missing.join(', ')}`);
  if (res.headers.get('x-powered-by')) throw new Error('x-powered-by is still advertised');
});

await check('robots.txt points at this deployment', async () => {
  const res = await get('/robots.txt');
  if (res.status !== 200) throw new Error(`got ${res.status}`);
  const body = await res.text();
  if (!body.includes('Disallow: /library')) throw new Error('private routes are not disallowed');
  if (!body.includes(new URL(base).host)) {
    throw new Error('robots.txt names another host — is NEXT_PUBLIC_SITE_URL right?');
  }
});

console.log(
  failures === 0
    ? '\nAll checks passed. The site is up.\n'
    : `\n${failures} check${failures > 1 ? 's' : ''} failed.\n`
);
process.exit(failures === 0 ? 0 : 1);
