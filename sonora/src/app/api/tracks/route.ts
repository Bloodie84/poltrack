import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { slugify } from '@/lib/slug';
import { checkedStreamPath, trackFileColumns, type FileMetaInput } from '@/lib/track-file';
import { cleanMultiline, cleanText, fail, isVisibility, json } from '@/lib/validation';
import { trackHref } from '@/lib/types';

export const runtime = 'nodejs';

/** Confirms an object is really in the audio bucket before a row names it. */
async function objectExists(
  admin: ReturnType<typeof createAdminClient>,
  path: string
): Promise<boolean> {
  const folder = path.slice(0, path.lastIndexOf('/'));
  const name = path.slice(path.lastIndexOf('/') + 1);
  const { data } = await admin.storage.from('audio').list(folder, { search: name, limit: 1 });
  return Boolean(data && data.length > 0);
}

interface Payload {
  title?: unknown;
  artist?: unknown;
  description?: unknown;
  genre?: unknown;
  visibility?: unknown;
  downloadsEnabled?: unknown;
  audioPath?: unknown;
  coverPath?: unknown;
  duration?: unknown;
  file?: FileMetaInput;
}

/** Publishes a track once its audio is already in storage. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('You must be signed in to publish a track.', 401);

  let body: Payload;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid request body.');
  }

  const title = cleanText(body.title, 120);
  const artist = cleanText(body.artist, 80);
  const audioPath = typeof body.audioPath === 'string' ? body.audioPath : '';
  const coverPath = typeof body.coverPath === 'string' && body.coverPath ? body.coverPath : null;
  const visibility = isVisibility(body.visibility) ? body.visibility : 'public';
  const downloadsEnabled = body.downloadsEnabled === true;
  const duration = Math.max(0, Number(body.duration) || 0);

  if (!title) return fail('A title is required.');
  if (!artist) return fail('An artist name is required.');
  if (!audioPath.startsWith(`${user.id}/`)) return fail('Invalid audio file reference.', 403);
  if (coverPath && !coverPath.startsWith(`${user.id}/`)) return fail('Invalid cover reference.', 403);

  const streamPath = checkedStreamPath(body.file ?? {}, user.id);
  if (streamPath === undefined) return fail('Invalid audio file reference.', 403);

  const admin = createAdminClient();

  // The object must really exist — otherwise we would publish a dead track.
  if (!(await objectExists(admin, audioPath))) {
    return fail('The uploaded file could not be found.', 400);
  }
  // The lighter copy is optional, so a missing one is simply not used rather
  // than a failed publish: the track still plays, from the master.
  const usableStream = streamPath && (await objectExists(admin, streamPath)) ? streamPath : null;

  let coverUrl: string | null = null;
  if (coverPath) {
    coverUrl = admin.storage.from('covers').getPublicUrl(coverPath).data.publicUrl;
  }

  const { data: track, error } = await supabase
    .from('tracks')
    .insert({
      owner_id: user.id,
      title,
      artist,
      slug: slugify(title),
      description: cleanMultiline(body.description, 2000),
      genre: cleanText(body.genre, 40),
      visibility,
      downloads_enabled: downloadsEnabled,
      audio_path: audioPath,
      cover_path: coverPath,
      cover_url: coverUrl,
      duration,
    })
    .select('id, slug, short_id')
    .single();

  if (error || !track) return fail(error?.message ?? 'Could not publish the track.', 500);

  const { error: fileError } = await supabase.from('track_files').insert({
    track_id: track.id,
    ...trackFileColumns(body.file ?? {}, audioPath, duration, usableStream),
  });

  if (fileError) {
    // Never leave a track without its file metadata.
    console.error('track_files insert failed', fileError);
    await supabase.from('tracks').delete().eq('id', track.id);
    return fail('Could not save the audio details.', 500);
  }

  // A guest has no profile name of their own yet. Adopt the artist they typed
  // so their public page is not headed "Artist". 'Artist' is the placeholder
  // the sign-up trigger uses when there is nothing better.
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.display_name || profile.display_name === 'Artist') {
    await supabase.from('profiles').update({ display_name: artist }).eq('id', user.id);
  }

  return json({ id: track.id, href: trackHref(track) }, 201);
}
