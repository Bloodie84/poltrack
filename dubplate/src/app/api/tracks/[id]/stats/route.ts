import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { fail, json } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 30;

/** Owner-only statistics: plays, unique listeners, downloads, daily curve. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('You must be signed in.', 401);

  const { data: track } = await supabase
    .from('tracks')
    .select('id, play_count, download_count')
    .eq('id', id)
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!track) return fail('Track not found.', 404);

  // Buckets run from (today - 29 days) to today, in UTC — the same clock the
  // stored timestamps use.
  const since = new Date(Date.now() - (WINDOW_DAYS - 1) * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);

  // These selects run under RLS: only the owner can read them.
  const [{ data: plays }, { count: downloadCount }] = await Promise.all([
    supabase
      .from('plays')
      .select('listener_hash, created_at')
      .eq('track_id', id)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true })
      .limit(10000),
    supabase.from('downloads').select('id', { count: 'exact', head: true }).eq('track_id', id),
  ]);

  const uniqueListeners = new Set((plays ?? []).map((p) => p.listener_hash)).size;

  const byDay = new Map<string, number>();
  for (let i = 0; i < WINDOW_DAYS; i += 1) {
    const d = new Date(since.getTime() + i * 86_400_000);
    byDay.set(d.toISOString().slice(0, 10), 0);
  }
  for (const p of plays ?? []) {
    const key = String(p.created_at).slice(0, 10);
    if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }

  return json({
    plays: track.play_count ?? 0,
    uniqueListeners,
    downloads: downloadCount ?? track.download_count ?? 0,
    daily: Array.from(byDay, ([date, count]) => ({ date, count })),
  });
}
