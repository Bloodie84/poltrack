import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { getServerClient } from '@/lib/supabase/server';

const OTP_TYPES: EmailOtpType[] = [
  'email',
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
];

/** N'accepte qu'une redirection interne : empêche l'open redirect. */
function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/carte';
}

function failure(request: NextRequest, message: string): NextResponse {
  const url = new URL('/connexion', request.url);
  url.searchParams.set('erreur', message);
  return NextResponse.redirect(url);
}

/**
 * Point d'atterrissage des liens de connexion par e-mail.
 * Supporte les deux formats émis par Supabase : `token_hash` (lien magique) et
 * `code` (flux PKCE).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNext(searchParams.get('suivant'));

  const supabase = await getServerClient();
  if (!supabase) return failure(request, 'Supabase n’est pas configuré.');

  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const code = searchParams.get('code');

  if (tokenHash && type && OTP_TYPES.includes(type as EmailOtpType)) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    });
    if (error) return failure(request, error.message);
    return NextResponse.redirect(new URL(next, request.url));
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return failure(request, error.message);
    return NextResponse.redirect(new URL(next, request.url));
  }

  return failure(request, 'Lien de connexion invalide ou expiré.');
}
