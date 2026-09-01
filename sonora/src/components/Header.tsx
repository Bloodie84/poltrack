import Link from 'next/link';
import HeaderNav from './HeaderNav';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SITE_NAME } from '@/lib/site';

export default async function Header() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let displayName = '';
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();
    displayName = profile?.display_name ?? user.email?.split('@')[0] ?? 'Artist';
  }

  return (
    <header className="header">
      <div className="container container--wide header__inner">
        <Link href="/" className="logo" aria-label={`${SITE_NAME} home`}>
          <span className="logo__mark" aria-hidden="true"><i /><i /><i /><i /></span>
          {SITE_NAME}
        </Link>
        <HeaderNav user={user ? { email: user.email ?? null, displayName } : null} />
      </div>
    </header>
  );
}
