'use server';

import { revalidatePath } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import { homePointSchema } from '@/lib/validation/settings';

/**
 * Enregistre le point d'ouverture de la carte.
 * Renvoie un message affichable ; l'appelant n'a pas à interpréter d'erreur.
 */
export async function saveHomePoint(
  lat: number,
  lon: number,
  zoom: number,
): Promise<string> {
  const parsed = homePointSchema.safeParse({ lat, lon, zoom });
  if (!parsed.success) return 'Coordonnées invalides.';

  const supabase = await getServerClient();
  if (!supabase) return 'Supabase n’est pas configuré.';

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 'Connectez-vous pour enregistrer ce point.';

  const { error } = await supabase.rpc('set_home_point', {
    p_lat: parsed.data.lat,
    p_lon: parsed.data.lon,
    p_zoom: parsed.data.zoom,
  });

  if (error) return `Échec de l’enregistrement : ${error.message}`;

  revalidatePath('/carte');
  return 'Point d’ouverture enregistré.';
}
