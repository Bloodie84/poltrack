import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabaseConfig } from '@/lib/env';
import type { Database } from './types';

/** Routes accessibles sans session. */
const PUBLIC_PREFIXES = ['/connexion', '/auth', '/configuration'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Rafraîchit la session Supabase et protège les routes privées.
 * Appelé depuis `src/proxy.ts` (`middleware` a été renommé par Next.js 16).
 *
 * Sans configuration Supabase, l'application reste navigable : la carte et le
 * GPS n'ont pas besoin de backend, et l'interface signale que rien n'est
 * enregistré.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const config = supabaseConfig();
  if (!config) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(config.url, config.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() valide le jeton auprès du serveur d'auth : ne pas remplacer par
  // getSession(), qui fait confiance au cookie sans vérification.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/connexion';
    url.search = '';
    if (pathname !== '/') {
      url.searchParams.set('suivant', `${pathname}${search}`);
    }
    return NextResponse.redirect(url);
  }

  if (user && pathname === '/connexion') {
    const url = request.nextUrl.clone();
    url.pathname = '/carte';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}
