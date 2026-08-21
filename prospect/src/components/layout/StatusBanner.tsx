import Link from 'next/link';

export type StatusBannerProps = {
  configured: boolean;
  signedIn: boolean;
  warning: string | null;
};

/**
 * Bandeau d'état honnête : il indique précisément ce qui est enregistré et ce
 * qui ne l'est pas, plutôt que de laisser croire à une sauvegarde silencieuse.
 */
export function StatusBanner({ configured, signedIn, warning }: StatusBannerProps) {
  if (!configured) {
    return (
      <Banner tone="warn">
        Aucun backend configuré : la carte et le GPS fonctionnent,{' '}
        <strong>rien n’est enregistré</strong>.{' '}
        <Link href="/configuration" className="underline underline-offset-2">
          Configurer Supabase
        </Link>
      </Banner>
    );
  }

  if (!signedIn) {
    return (
      <Banner tone="warn">
        Vous n’êtes pas connecté : rien ne sera enregistré.{' '}
        <Link href="/connexion" className="underline underline-offset-2">
          Se connecter
        </Link>
      </Banner>
    );
  }

  if (warning) return <Banner tone="error">{warning}</Banner>;

  return null;
}

function Banner({ tone, children }: { tone: 'warn' | 'error'; children: React.ReactNode }) {
  const styles =
    tone === 'error'
      ? 'border-danger/40 bg-danger/10 text-danger'
      : 'border-amber-500/40 bg-amber-500/10 text-amber-200';

  return (
    <p role="status" className={`border-b px-4 py-2 text-center text-xs ${styles}`}>
      {children}
    </p>
  );
}
