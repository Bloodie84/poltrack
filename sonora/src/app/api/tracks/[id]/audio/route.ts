import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkedStreamPath, trackFileColumns, type FileMetaInput } from '@/lib/track-file';
import { fail, json } from '@/lib/validation';

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

type Ctx = { params: Promise<{ id: string }> };

interface Payload {
  audioPath?: unknown;
  duration?: unknown;
  file?: FileMetaInput;
}

/**
 * Swaps the audio behind an existing track.
 *
 * The point is the link: the row keeps its id, its short id and its slug, so
 * every message already sent still opens the same page — it just plays the new
 * take. Counts, comments in somebody's chat history and the artist page entry
 * all survive, which is what makes this different from deleting and
 * re-uploading.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('You must be signed in.', 401);

  let body: Payload;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid request body.');
  }

  const audioPath = typeof body.audioPath === 'string' ? body.audioPath : '';
  const duration = Math.max(0, Number(body.duration) || 0);

  // A path outside the user's own folder would point the track at somebody
  // else's object; the upload route only ever issues paths inside it.
  if (!audioPath.startsWith(`${user.id}/`)) return fail('Invalid audio file reference.', 403);
  if (duration <= 0) return fail('The replacement file has no duration.');

  const streamPath = checkedStreamPath(body.file ?? {}, user.id);
  if (streamPath === undefined) return fail('Invalid audio file reference.', 403);

  const { data: track } = await supabase
    .from('tracks')
    .select('id, audio_path, track_files(stream_path)')
    .eq('id', id)
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!track) return fail('Track not found.', 404);

  const previousPath = track.audio_path as string;
  if (previousPath === audioPath) return fail('That is already the track’s file.');

  const files = track.track_files as { stream_path: string | null }[] | { stream_path: string | null } | null;
  const previousStream = (Array.isArray(files) ? files[0] : files)?.stream_path ?? null;

  const admin = createAdminClient();

  // Publishing checks this too: a row pointing at nothing is a dead track, and
  // here it would also be a track that used to work.
  if (!(await objectExists(admin, audioPath))) {
    return fail('The uploaded file could not be found.', 400);
  }
  const usableStream = streamPath && (await objectExists(admin, streamPath)) ? streamPath : null;

  const columns = trackFileColumns(body.file ?? {}, audioPath, duration, usableStream);

  const { error: fileError } = await supabase
    .from('track_files')
    .update(columns)
    .eq('track_id', id);
  if (fileError) return fail(fileError.message, 500);

  const { error: trackError } = await supabase
    .from('tracks')
    .update({ audio_path: audioPath, duration })
    .eq('id', id)
    .eq('owner_id', user.id);

  if (trackError) {
    // The details row now describes a file the track does not use. Put it back
    // rather than leave the two disagreeing.
    await supabase
      .from('track_files')
      .update(trackFileColumns({}, previousPath, duration, previousStream))
      .eq('track_id', id);
    return fail(trackError.message, 500);
  }

  // Only once nothing points at them any more.
  const stale = [previousPath];
  if (previousStream && previousStream !== usableStream) stale.push(previousStream);
  await admin.storage.from('audio').remove(stale);

  return json({
    ok: true,
    duration,
    waveform: columns.waveform,
    format: columns.format,
    bitrate: columns.bitrate,
    sampleRate: columns.sample_rate,
  });
}
