/**
 * Fabrique le cookie de session attendu par `@supabase/ssr`.
 *
 * Format observé dans `node_modules/@supabase/ssr/dist/main/cookies.js` :
 * `base64-` suivi de la session JSON encodée en base64url. La clé de stockage
 * est dérivée du nom d'hôte du projet par supabase-js.
 */
export function buildAuthCookie({ url, userId, email, accessToken = 'test-access-token' }) {
  const hostname = new URL(url).hostname;
  const name = `sb-${hostname.split('.')[0]}-auth-token`;

  const session = {
    access_token: accessToken,
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    // Loin dans le futur : aucun rafraîchissement ne doit être tenté.
    expires_in: 36_000,
    expires_at: Math.floor(Date.now() / 1000) + 36_000,
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email,
      app_metadata: { provider: 'email' },
      user_metadata: {},
      created_at: new Date(0).toISOString(),
    },
  };

  const encoded = Buffer.from(JSON.stringify(session), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return { name, value: `base64-${encoded}` };
}
