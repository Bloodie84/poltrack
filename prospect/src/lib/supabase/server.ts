import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { supabaseConfig } from '@/lib/env';
import type { Database } from './types';

export type ServerClient = ReturnType<typeof createServerClient<Database>>;

/**
 * Client serveur lié aux cookies de la requête.
 * Renvoie `null` si Supabase n'est pas configuré.
 */
export async function getServerClient(): Promise<ServerClient | null> {
  const config = supabaseConfig();
  if (!config) return null;

  const cookieStore = await cookies();

  return createServerClient<Database>(config.url, config.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Appelé depuis un Server Component : le rafraîchissement des cookies
          // est assuré par le middleware, on peut ignorer sans risque.
        }
      },
    },
  });
}

/** Utilisateur courant, ou `null` (non connecté / Supabase absent). */
export async function getCurrentUser() {
  const supabase = await getServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}
