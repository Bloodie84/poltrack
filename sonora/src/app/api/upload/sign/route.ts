import { NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  AUDIO_EXTENSIONS, IMAGE_EXTENSIONS, MAX_AUDIO_BYTES, MAX_COVER_BYTES,
  extensionOf, fail, json, safeFilename,
} from '@/lib/validation';

export const runtime = 'nodejs';

/**
 * Issues a short-lived signed upload URL scoped to `<user id>/…`. The client
 * PUTs the bytes straight to storage so it can report real progress, but it
 * never gets to choose where the object lands.
 */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('You must be signed in to upload.', 401);

  let body: { kind?: string; filename?: string; size?: number };
  try {
    body = await request.json();
  } catch {
    return fail('Invalid request body.');
  }

  const kind = body.kind === 'cover' ? 'cover' : 'audio';
  const filename = typeof body.filename === 'string' ? body.filename : '';
  const size = Number(body.size ?? 0);
  const ext = extensionOf(filename);

  if (!filename) return fail('A filename is required.');
  if (!Number.isFinite(size) || size <= 0) return fail('Invalid file size.');

  const bucket = kind === 'cover' ? 'covers' : 'audio';
  const allowed = kind === 'cover' ? IMAGE_EXTENSIONS : AUDIO_EXTENSIONS;
  const maxBytes = kind === 'cover' ? MAX_COVER_BYTES : MAX_AUDIO_BYTES;

  if (!allowed.includes(ext)) {
    return fail(
      kind === 'cover'
        ? 'Cover must be a JPG, PNG, WebP or AVIF image.'
        : 'Audio must be an MP3, WAV, FLAC, M4A or AAC file.'
    );
  }
  if (size > maxBytes) {
    return fail(`File is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB).`);
  }

  const path = `${user.id}/${crypto.randomUUID()}/${safeFilename(filename)}`;
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path);

  if (error || !data) return fail(error?.message ?? 'Could not start the upload.', 500);

  return json({ bucket, path: data.path, signedUrl: data.signedUrl, token: data.token });
}
