import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from './LoginForm';
import { isSupabaseConfigured } from '@/lib/env';

export const metadata: Metadata = { title: 'Connexion' };

export default async function LoginPage(props: PageProps<'/connexion'>) {
  const searchParams = await props.searchParams;
  const nextParam = searchParams.suivant;
  const next = typeof nextParam === 'string' && nextParam.startsWith('/') ? nextParam : '/carte';
  const error = typeof searchParams.erreur === 'string' ? searchParams.erreur : null;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-6 px-5 py-12">
      <header>
        <p className="text-sm font-semibold tracking-[0.2em] text-accent">PROSPECT</p>
        <h1 className="mt-2 text-2xl font-semibold">Connexion</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          Vos positions et vos découvertes sont privées. Un lien de connexion vous est envoyé
          par e-mail : aucun mot de passe à retenir.
        </p>
      </header>

      {error ? (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {isSupabaseConfigured() ? (
        <LoginForm next={next} />
      ) : (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm text-amber-100">
          <p className="font-medium">Backend non configuré</p>
          <p className="mt-2 leading-relaxed">
            La connexion nécessite un projet Supabase. La carte et le GPS restent utilisables
            sans compte, mais rien n’est enregistré.
          </p>
          <Link
            href="/configuration"
            className="mt-3 inline-block underline underline-offset-2"
          >
            Voir la procédure de configuration
          </Link>
        </div>
      )}

      <p className="text-center text-xs text-ink-2">
        <Link href="/carte" className="underline underline-offset-2">
          Continuer sans compte
        </Link>
      </p>
    </main>
  );
}
