import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { listenerHash } from '@/lib/listener';
import { fail, json } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEDUPE_MINUTES = 10;

/** Records one play. Called by the player after a few seconds of real audio. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail('Not found.', 404);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS decides whether this caller may see the track at all.
  const { data: track } = await supabase.from('tracks').select('id').eq('id', id).maybeSingle();
  if (!track) return fail('Not found.', 404);

  const hash = listenerHash(request, user?.id ?? null);
  const admin = createAdminClient();
  const since = new Date(Date.now() - DEDUPE_MINUTES * 60_000).toISOString();

  const { data: recent } = await admin
    .from('plays')
    .select('id')
    .eq('track_id', id)
    .eq('listener_hash', hash)
    .gte('created_at', since)
    .limit(1);

  if (recent && recent.length > 0) return json({ counted: false });

  const { error } = await admin
    .from('plays')
    .insert({ track_id: id, listener_hash: hash, user_id: user?.id ?? null });
  if (error) return json({ counted: false });

  await admin.rpc('increment_play', { p_track_id: id });
  return json({ counted: true });
}
