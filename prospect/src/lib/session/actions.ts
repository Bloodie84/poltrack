'use server';

import { revalidatePath } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import {
  pointBatchSchema,
  sessionDetailsSchema,
  startSessionSchema,
  vehiclePointSchema,
} from '@/lib/validation/session';
import { normalizeSession } from './normalize';
import type { SessionOverviewRow } from '@/lib/supabase/types';
import type { PendingPoint } from './types';

/**
 * Résultat uniforme des opérations de sortie.
 * Le client n'a jamais à interpréter une erreur Postgres brute.
 */
export type SessionActionResult =
  | { ok: true; session: SessionOverviewRow | null; inserted?: number }
  | { ok: false; message: string };

/** Messages lisibles pour les erreurs que l'utilisateur peut réellement rencontrer. */
function explain(message: string): string {
  if (message.includes('déjà en cours')) {
    return 'Une sortie est déjà en cours. Terminez-la avant d’en démarrer une autre.';
  }
  if (message.includes('Non authentifié')) return 'Session expirée : reconnectez-vous.';
  if (message.includes('introuvable')) return 'Cette sortie est introuvable.';
  return message;
}

async function client() {
  const supabase = await getServerClient();
  if (!supabase) return { supabase: null, error: 'Supabase n’est pas configuré.' as const };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase: null, error: 'Session expirée : reconnectez-vous.' as const };
  return { supabase, error: null };
}

async function readSession(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerClient>>>,
  id: string,
): Promise<SessionOverviewRow | null> {
  const { data } = await supabase
    .from('session_overview')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return normalizeSession(data);
}

export async function startSession(input: unknown): Promise<SessionActionResult> {
  const parsed = startSessionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Données de démarrage invalides.' };

  const { supabase, error } = await client();
  if (!supabase) return { ok: false, message: error };

  const { data, error: rpcError } = await supabase.rpc('start_session', {
    p_lat: parsed.data.lat,
    p_lon: parsed.data.lon,
    p_sweep_width_m: null,
    p_detector_id: parsed.data.detectorId,
    p_title: parsed.data.title,
    p_save_vehicle: parsed.data.saveVehicle,
  });

  if (rpcError) return { ok: false, message: explain(rpcError.message) };

  revalidatePath('/carte');
  revalidatePath('/sorties');
  return { ok: true, session: await readSession(supabase, data as string) };
}

async function transition(
  sessionId: string,
  rpc: 'pause_session' | 'resume_session' | 'finish_session',
): Promise<SessionActionResult> {
  const { supabase, error } = await client();
  if (!supabase) return { ok: false, message: error };

  const { error: rpcError } = await supabase.rpc(rpc, { p_session_id: sessionId });
  if (rpcError) return { ok: false, message: explain(rpcError.message) };

  revalidatePath('/carte');
  revalidatePath('/sorties');
  return { ok: true, session: await readSession(supabase, sessionId) };
}

export async function pauseSession(sessionId: string): Promise<SessionActionResult> {
  return transition(sessionId, 'pause_session');
}

export async function resumeSession(sessionId: string): Promise<SessionActionResult> {
  return transition(sessionId, 'resume_session');
}

export async function finishSession(sessionId: string): Promise<SessionActionResult> {
  return transition(sessionId, 'finish_session');
}

/**
 * Envoie un lot de points GPS.
 *
 * L'appel est idempotent : les identifiants viennent du client, un lot rejoué
 * après une coupure réseau n'insère rien de nouveau. Le résultat renvoie la
 * sortie à jour, distance comprise, pour éviter un aller-retour supplémentaire.
 */
export async function flushSessionPoints(
  sessionId: string,
  points: PendingPoint[],
): Promise<SessionActionResult> {
  const parsed = pointBatchSchema.safeParse(points);
  if (!parsed.success) return { ok: false, message: 'Lot de points GPS invalide.' };

  const { supabase, error } = await client();
  if (!supabase) return { ok: false, message: error };

  const { data, error: rpcError } = await supabase.rpc('append_gps_points', {
    p_session_id: sessionId,
    p_points: parsed.data,
  });

  if (rpcError) return { ok: false, message: explain(rpcError.message) };

  return {
    ok: true,
    inserted: typeof data === 'number' ? data : 0,
    session: await readSession(supabase, sessionId),
  };
}

export async function setVehiclePoint(input: unknown): Promise<SessionActionResult> {
  const parsed = vehiclePointSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Position de retour invalide.' };

  const { supabase, error } = await client();
  if (!supabase) return { ok: false, message: error };

  const { error: rpcError } = await supabase.rpc('set_vehicle_point', {
    p_session_id: parsed.data.sessionId,
    p_lat: parsed.data.lat,
    p_lon: parsed.data.lon,
    p_label: parsed.data.label,
  });

  if (rpcError) return { ok: false, message: explain(rpcError.message) };

  revalidatePath('/carte');
  return { ok: true, session: await readSession(supabase, parsed.data.sessionId) };
}

/** Met à jour le titre, les notes et le détecteur d'une sortie. */
export async function updateSessionDetails(input: unknown): Promise<SessionActionResult> {
  const parsed = sessionDetailsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Informations de sortie invalides.' };

  const { supabase, error } = await client();
  if (!supabase) return { ok: false, message: error };

  const { error: updateError } = await supabase
    .from('sessions')
    .update({
      title: parsed.data.title,
      notes: parsed.data.notes,
      detector_id: parsed.data.detectorId,
    })
    .eq('id', parsed.data.sessionId);

  if (updateError) return { ok: false, message: updateError.message };

  revalidatePath('/sorties');
  revalidatePath(`/sorties/${parsed.data.sessionId}`);
  return { ok: true, session: await readSession(supabase, parsed.data.sessionId) };
}

/** Suppression logique : la sortie sort des listes sans être détruite. */
export async function deleteSession(sessionId: string): Promise<SessionActionResult> {
  const { supabase, error } = await client();
  if (!supabase) return { ok: false, message: error };

  const { error: updateError } = await supabase
    .from('sessions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (updateError) return { ok: false, message: updateError.message };

  revalidatePath('/sorties');
  revalidatePath('/carte');
  return { ok: true, session: null };
}

/** Traces passées visibles dans une emprise, pour l'historique sur la carte. */
export async function fetchTracksInBbox(input: {
  west: number;
  south: number;
  east: number;
  north: number;
  from: string | null;
}): Promise<{ ok: true; geojson: unknown } | { ok: false; message: string }> {
  const { supabase, error } = await client();
  if (!supabase) return { ok: false, message: error };

  const { data, error: rpcError } = await supabase.rpc('tracks_in_bbox', {
    p_west: input.west,
    p_south: input.south,
    p_east: input.east,
    p_north: input.north,
    p_from: input.from,
    p_to: null,
    p_limit: 200,
  });

  if (rpcError) return { ok: false, message: rpcError.message };
  return { ok: true, geojson: data };
}
