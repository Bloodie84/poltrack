'use server';

import { revalidatePath } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import { profileSchema, settingsSchema } from '@/lib/validation/settings';
import {
  fail,
  fieldErrorsOf,
  numberField,
  ok,
  textField,
  type ActionState,
} from '@/lib/forms';

async function requireUser() {
  const supabase = await getServerClient();
  if (!supabase) return { supabase: null, user: null, error: 'Supabase n’est pas configuré.' };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user
    ? { supabase, user, error: null }
    : { supabase: null, user: null, error: 'Session expirée : reconnectez-vous.' };
}

export async function updateProfile(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user, error } = await requireUser();
  if (!supabase || !user) return fail(error ?? 'Action impossible.');

  const raw = textField(formData.get('display_name')).trim();
  const parsed = profileSchema.safeParse({ display_name: raw === '' ? null : raw });
  if (!parsed.success) return fail('Nom invalide.', fieldErrorsOf(parsed.error));

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ display_name: parsed.data.display_name })
    .eq('id', user.id);

  if (updateError) return fail(updateError.message);

  revalidatePath('/parametres');
  return ok('Profil enregistré.');
}

export async function updateSettings(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user, error } = await requireUser();
  if (!supabase || !user) return fail(error ?? 'Action impossible.');

  const parsed = settingsSchema.safeParse({
    units: textField(formData.get('units')),
    locale: textField(formData.get('locale')),
    theme: textField(formData.get('theme')),
    default_sweep_width_m: numberField(formData.get('default_sweep_width_m')),
    gps_min_interval_s: numberField(formData.get('gps_min_interval_s')),
    gps_min_distance_m: numberField(formData.get('gps_min_distance_m')),
    gps_max_accuracy_m: numberField(formData.get('gps_max_accuracy_m')),
    keep_screen_awake: formData.get('keep_screen_awake') === 'on',
    default_privacy: textField(formData.get('default_privacy')),
  });

  if (!parsed.success) {
    return fail('Certaines valeurs sont invalides.', fieldErrorsOf(parsed.error));
  }

  // upsert : recrée la ligne si elle manque (base restaurée sans le trigger).
  const { error: upsertError } = await supabase
    .from('user_settings')
    .upsert({ user_id: user.id, ...parsed.data }, { onConflict: 'user_id' });

  if (upsertError) return fail(upsertError.message);

  revalidatePath('/parametres');
  revalidatePath('/carte');
  return ok('Réglages enregistrés.');
}

export async function clearHomePoint(
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const { supabase, user, error } = await requireUser();
  if (!supabase || !user) return fail(error ?? 'Action impossible.');

  const { error: rpcError } = await supabase.rpc('set_home_point', {
    p_lat: null,
    p_lon: null,
    p_zoom: null,
  });

  if (rpcError) return fail(rpcError.message);

  revalidatePath('/parametres');
  revalidatePath('/carte');
  return ok('Point d’ouverture effacé.');
}
