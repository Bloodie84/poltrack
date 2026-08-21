'use server';

import { revalidatePath } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import { detectorSchema } from '@/lib/validation/detector';
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

function parseDetector(formData: FormData) {
  return detectorSchema.safeParse({
    brand: textField(formData.get('brand')),
    model: textField(formData.get('model')),
    coil: textField(formData.get('coil')),
    frequency_khz: numberField(formData.get('frequency_khz')),
    notes: textField(formData.get('notes')),
    is_default: formData.get('is_default') === 'on',
  });
}

export async function createDetector(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user, error } = await requireUser();
  if (!supabase || !user) return fail(error ?? 'Action impossible.');

  const parsed = parseDetector(formData);
  if (!parsed.success) {
    return fail('Vérifiez les champs signalés.', fieldErrorsOf(parsed.error));
  }

  const { is_default: isDefault, ...fields } = parsed.data;

  const { data, error: insertError } = await supabase
    .from('detectors')
    .insert({ user_id: user.id, ...fields })
    .select('id')
    .single();

  if (insertError) return fail(insertError.message);

  if (isDefault && data) {
    const { error: rpcError } = await supabase.rpc('set_default_detector', {
      p_detector_id: data.id,
    });
    if (rpcError) {
      return fail(`Détecteur créé, mais non défini par défaut : ${rpcError.message}`);
    }
  }

  revalidatePath('/materiel');
  return ok('Détecteur ajouté.');
}

export async function updateDetector(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user, error } = await requireUser();
  if (!supabase || !user) return fail(error ?? 'Action impossible.');

  const id = textField(formData.get('id'));
  if (!id) return fail('Détecteur introuvable.');

  const parsed = parseDetector(formData);
  if (!parsed.success) {
    return fail('Vérifiez les champs signalés.', fieldErrorsOf(parsed.error));
  }

  const { is_default: isDefault, ...fields } = parsed.data;

  const { error: updateError } = await supabase
    .from('detectors')
    .update(fields)
    .eq('id', id)
    .is('deleted_at', null);

  if (updateError) return fail(updateError.message);

  if (isDefault) {
    const { error: rpcError } = await supabase.rpc('set_default_detector', {
      p_detector_id: id,
    });
    if (rpcError) return fail(rpcError.message);
  }

  revalidatePath('/materiel');
  return ok('Détecteur mis à jour.');
}

export async function setDefaultDetector(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user, error } = await requireUser();
  if (!supabase || !user) return fail(error ?? 'Action impossible.');

  const id = textField(formData.get('id'));
  if (!id) return fail('Détecteur introuvable.');

  const { error: rpcError } = await supabase.rpc('set_default_detector', {
    p_detector_id: id,
  });
  if (rpcError) return fail(rpcError.message);

  revalidatePath('/materiel');
  return ok('Détecteur par défaut mis à jour.');
}

/**
 * Suppression logique : les sorties et découvertes des phases suivantes
 * conserveront une référence valide vers le matériel utilisé à l'époque.
 */
export async function deleteDetector(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user, error } = await requireUser();
  if (!supabase || !user) return fail(error ?? 'Action impossible.');

  const id = textField(formData.get('id'));
  if (!id) return fail('Détecteur introuvable.');

  const { error: updateError } = await supabase
    .from('detectors')
    .update({ deleted_at: new Date().toISOString(), is_default: false })
    .eq('id', id);

  if (updateError) return fail(updateError.message);

  revalidatePath('/materiel');
  return ok('Détecteur retiré de la liste.');
}
