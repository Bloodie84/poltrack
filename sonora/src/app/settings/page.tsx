import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import SettingsForm from '@/components/SettingsForm';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=%2Fsettings');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();

  const guest = user.is_anonymous === true || !user.email;

  return (
    <div className="container container--narrow">
      <h1 style={{ fontSize: 26, marginBottom: 20 }}>Settings</h1>
      <SettingsForm
        email={user.email ?? ''}
        displayName={profile?.display_name ?? (guest ? '' : user.email?.split('@')[0] ?? '')}
        isGuest={guest}
      />
    </div>
  );
}
