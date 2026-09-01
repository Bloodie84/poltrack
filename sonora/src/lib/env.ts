import 'server-only';

/**
 * Environment the server needs. Checked where it is used rather than at import
 * time, so a missing variable produces a clear message instead of a blank 500
 * from somewhere deep in a route.
 */
const REQUIRED = {
  NEXT_PUBLIC_SUPABASE_URL: 'Supabase → Project Settings → API → Project URL',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'Supabase → Project Settings → API → anon public key',
  SUPABASE_SERVICE_ROLE_KEY: 'Supabase → Project Settings → API → service_role key (server only)',
} as const;

export type RequiredVar = keyof typeof REQUIRED;

export function missingEnv(): { name: RequiredVar; where: string }[] {
  return (Object.keys(REQUIRED) as RequiredVar[])
    .filter((name) => !process.env[name])
    .map((name) => ({ name, where: REQUIRED[name] }));
}

export class MissingEnvError extends Error {
  constructor(names: string[]) {
    super(
      `Missing environment ${names.length > 1 ? 'variables' : 'variable'}: ${names.join(', ')}. ` +
        'Set them where the app runs, then redeploy.'
    );
    this.name = 'MissingEnvError';
  }
}

export function requireEnv(name: RequiredVar): string {
  const value = process.env[name];
  if (!value) throw new MissingEnvError([name]);
  return value;
}
