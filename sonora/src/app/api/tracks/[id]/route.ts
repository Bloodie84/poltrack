import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { slugify } from '@/lib/slug';
import { cleanMultiline, cleanText, fail, isVisibility, json } from '@/lib/validation';
import type { TrackRow } from '@/lib/supabase/database.types';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/** Edit a track. RLS guarantees a user can only ever touch their own rows. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('You must be signed in.', 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid request body.');
  }

  const patch: Partial<TrackRow> = {};

  if ('title' in body) {
    const title = cleanText(body.title, 120);
    if (!title) return fail('A title is required.');
    patch.title = title;
    patch.slug = slugify(title);
  }
  if ('artist' in body) {
    const artist = cleanText(body.artist, 80);
    if (!artist) return fail('An artist name is required.');
    patch.artist = artist;
  }
  if ('description' in body) patch.description = cleanMultiline(body.description, 2000);
  if ('genre' in body) patch.genre = cleanText(body.genre, 40);
  if ('visibility' in body) {
    if (!isVisibility(body.visibility)) return fail('Invalid visibility.');
    patch.visibility = body.visibility;
  }
  if ('downloadsEnabled' in body) patch.downloads_enabled = body.downloadsEnabled === true;
  if ('coverPath' in body) {
    const coverPath = typeof body.coverPath === 'string' && body.coverPath ? body.coverPath : null;
    if (coverPath && !coverPath.startsWith(`${user.id}/`)) return fail('Invalid cover reference.', 403);
    patch.cover_path = coverPath;
    patch.cover_url = coverPath
      ? createAdminClient().storage.from('covers').getPublicUrl(coverPath).data.publicUrl
      : null;
  }

  if (Object.keys(patch).length === 0) return fail('Nothing to update.');

  const { data, error } = await supabase
    .from('tracks')
    .update(patch)
    .eq('id', id)
    .eq('owner_id', user.id)
    .select('id, slug, short_id, title, artist, description, genre, visibility, downloads_enabled, cover_url')
    .maybeSingle();

  if (error) return fail(error.message, 500);
  if (!data) return fail('Track not found.', 404);

  return json({ track: data });
}

/** Deletes the row and the stored objects that belong to it. */
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('You must be signed in.', 401);

  const { data: track } = await supabase
    .from('tracks')
    .select('id, audio_path, cover_path, owner_id')
    .eq('id', id)
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!track) return fail('Track not found.', 404);

  const { error } = await supabase.from('tracks').delete().eq('id', id).eq('owner_id', user.id);
  if (error) return fail(error.message, 500);

  const admin = createAdminClient();
  if (track.audio_path) await admin.storage.from('audio').remove([track.audio_path as string]);
  if (track.cover_path) await admin.storage.from('covers').remove([track.cover_path as string]);

  return json({ ok: true });
}
