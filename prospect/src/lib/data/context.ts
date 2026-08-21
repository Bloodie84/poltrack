import type { User } from '@supabase/supabase-js';
import { getServerClient } from '@/lib/supabase/server';
import type { ProfileRow, UserSettingsRow } from '@/lib/supabase/types';

/** Valeurs par défaut alignées sur les DEFAULT de `user_settings`. */
export const DEFAULT_SETTINGS: Omit<
  UserSettingsRow,
  'user_id' | 'created_at' | 'updated_at'
> = {
  units: 'metric',
  locale: 'fr',
  theme: 'dark',
  default_basemap: 'osm',
  default_sweep_width_m: 2,
  gps_min_interval_s: 3,
  gps_min_distance_m: 2,
  gps_max_accuracy_m: 30,
  keep_screen_awake: true,
  default_privacy: 'private',
};

export type AppContext = {
  /** Supabase est-il configuré dans l'environnement ? */
  configured: boolean;
  user: User | null;
  profile: ProfileRow | null;
  settings: UserSettingsRow | null;
  /** Anomalie non bloquante à signaler à l'utilisateur (ex. migrations absentes). */
  warning: string | null;
};

const ANONYMOUS: AppContext = {
  configured: false,
  user: null,
  profile: null,
  settings: null,
  warning: null,
};

/**
 * Charge en une fois l'utilisateur, son profil et ses préférences.
 *
 * Ne lève jamais : sans backend ou sans session, l'application doit rester
 * navigable et afficher précisément ce qui manque.
 */
export async function loadAppContext(): Promise<AppContext> {
  const supabase = await getServerClient();
  if (!supabase) return ANONYMOUS;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ...ANONYMOUS, configured: true };

  const [profileResult, settingsResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle(),
  ]);

  const missingTable =
    profileResult.error?.code === '42P01' || settingsResult.error?.code === '42P01';

  return {
    configured: true,
    user,
    profile: profileResult.data ?? null,
    settings: settingsResult.data ?? null,
    warning: missingTable
      ? "Les tables sont introuvables : appliquez les migrations avec `npm run db:migrate`."
      : (profileResult.error?.message ?? settingsResult.error?.message ?? null),
  };
}

/** Préférences effectives : celles de la base, sinon les valeurs par défaut. */
export function effectiveSettings(context: AppContext) {
  return context.settings ?? { ...DEFAULT_SETTINGS, user_id: context.user?.id ?? '' };
}
