import { NextResponse, type NextRequest } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';

/** Déconnexion. En POST uniquement, pour ne pas être déclenchable par un lien. */
export async function POST(request: NextRequest) {
  const supabase = await getServerClient();
  if (supabase) await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/connexion', request.url), { status: 303 });
}
