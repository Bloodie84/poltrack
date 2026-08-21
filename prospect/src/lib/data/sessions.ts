import 'server-only';
import { getServerClient } from '@/lib/supabase/server';
import { normalizeSession } from '@/lib/session/normalize';
import type { SessionOverviewRow } from '@/lib/supabase/types';

/** Colonnes exposées par la vue `session_overview`. */
const OVERVIEW_COLUMNS = '*';

export type SessionListFilters = {
  from?: string | null;
  to?: string | null;
  limit?: number;
  offset?: number;
};

/** Sortie en cours (active ou en pause), ou `null`. */
export async function getOpenSession(): Promise<SessionOverviewRow | null> {
  const supabase = await getServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('session_overview')
    .select(OVERVIEW_COLUMNS)
    .neq('status', 'finished')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return normalizeSession(data);
}

export async function getSession(id: string): Promise<SessionOverviewRow | null> {
  const supabase = await getServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('session_overview')
    .select(OVERVIEW_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) return null;
  return normalizeSession(data);
}

export type SessionListResult = {
  sessions: SessionOverviewRow[];
  /** Vrai s'il reste des sorties au-delà de la page demandée. */
  hasMore: boolean;
  error: string | null;
};

/**
 * Liste paginée des sorties. La pagination est systématique : l'historique est
 * destiné à grandir pendant des années.
 */
export async function listSessions(
  filters: SessionListFilters = {},
): Promise<SessionListResult> {
  const supabase = await getServerClient();
  if (!supabase) return { sessions: [], hasMore: false, error: null };

  const limit = Math.min(Math.max(filters.limit ?? 25, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);

  let query = supabase
    .from('session_overview')
    .select(OVERVIEW_COLUMNS)
    .order('started_at', { ascending: false })
    // Une ligne de plus que demandé : suffit à savoir s'il y a une suite.
    .range(offset, offset + limit);

  if (filters.from) query = query.gte('started_at', filters.from);
  if (filters.to) query = query.lt('started_at', filters.to);

  const { data, error } = await query;
  if (error) return { sessions: [], hasMore: false, error: error.message };

  const rows = (data ?? []).map((row) => normalizeSession(row));
  return { sessions: rows.slice(0, limit), hasMore: rows.length > limit, error: null };
}

/** Trace complète, départ et point de retour d'une sortie, en GeoJSON. */
export async function getSessionGeoJson(id: string): Promise<unknown | null> {
  const supabase = await getServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('session_geojson', { p_session_id: id });
  if (error) return null;
  return data;
}
