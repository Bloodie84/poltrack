/**
 * Configuration d'environnement.
 *
 * L'application doit rester utilisable sans backend : la carte et le GPS
 * fonctionnent entièrement côté client. Tant que Supabase n'est pas configuré,
 * `supabaseConfig()` renvoie `null` et l'interface l'indique explicitement
 * plutôt que de proposer des actions qui échoueraient.
 */

export type SupabaseConfig = {
  url: string;
  /** Clé publique (anon / publishable). Jamais la clé secrète. */
  key: string;
};

function firstNonEmpty(...values: (string | undefined)[]): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

/**
 * Les variables NEXT_PUBLIC_* sont inlinées au build : elles doivent être lues
 * littéralement, pas via un index dynamique sur `process.env`.
 */
export function supabaseConfig(): SupabaseConfig | null {
  const url = firstNonEmpty(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = firstNonEmpty(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  if (!url || !key) return null;
  if (!/^https?:\/\//.test(url)) return null;

  return { url, key };
}

export function isSupabaseConfigured(): boolean {
  return supabaseConfig() !== null;
}

/** URL publique du site, utilisée pour les liens de connexion par e-mail. */
export function siteUrl(): string | null {
  return firstNonEmpty(process.env.NEXT_PUBLIC_SITE_URL) ?? null;
}
