import type { Metadata } from 'next';
import UploadStudio from '@/components/UploadStudio';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Upload' };
export const dynamic = 'force-dynamic';

/** Open to everyone: an account is created only if the visitor publishes. */
export default async function UploadPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const guest = !user || user.is_anonymous === true || !user.email;

  let defaultArtist = '';
  if (user && !guest) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();
    defaultArtist = profile?.display_name ?? user.email?.split('@')[0] ?? '';
  }

  return (
    <div className="container container--narrow">
      <UploadStudio defaultArtist={defaultArtist} isGuest={guest} />
    </div>
  );
}
