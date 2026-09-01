import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import UploadStudio from '@/components/UploadStudio';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Upload' };
export const dynamic = 'force-dynamic';

export default async function UploadPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=%2Fupload');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();

  return (
    <div className="container container--narrow">
      <UploadStudio defaultArtist={profile?.display_name ?? user.email?.split('@')[0] ?? ''} />
    </div>
  );
}
