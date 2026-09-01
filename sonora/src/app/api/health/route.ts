import { missingEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Deployment check. Answers whether the instance is configured well enough to
 * work, without saying anything an outsider could use: the details go to the
 * server log, the response is a yes or a no.
 */
export async function GET() {
  const missing = missingEnv();

  if (missing.length > 0) {
    console.error(
      'Sonora is not configured. Missing:\n' +
        missing.map((m) => `  ${m.name}  — ${m.where}`).join('\n')
    );
    return Response.json({ ok: false }, { status: 503 });
  }

  return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
}
