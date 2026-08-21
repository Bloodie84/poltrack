import type { Metadata } from 'next';
import Link from 'next/link';
import { isSupabaseConfigured } from '@/lib/env';

export const metadata: Metadata = { title: 'Configuration' };

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: '1. Créer un projet Supabase',
    body: (
      <>
        Sur <Code>supabase.com</Code>, créez un projet. Choisissez une région proche
        (Paris/Francfort) : toutes les requêtes de terrain y passeront.
      </>
    ),
  },
  {
    title: '2. Renseigner les variables d’environnement',
    body: (
      <>
        Copiez <Code>.env.example</Code> vers <Code>.env.local</Code>, puis remplissez{' '}
        <Code>NEXT_PUBLIC_SUPABASE_URL</Code>, <Code>NEXT_PUBLIC_SUPABASE_ANON_KEY</Code> et{' '}
        <Code>DATABASE_URL</Code> (Project Settings → Database → Connection string).
        <br />
        La clé <em>service_role</em> ne doit jamais figurer dans un fichier lu par le
        navigateur.
      </>
    ),
  },
  {
    title: '3. Appliquer les migrations',
    body: (
      <>
        <Code>npm run db:migrate</Code> crée les tables, les index, les fonctions et active
        la sécurité au niveau des lignes (RLS). <Code>npm run db:status</Code> affiche l’état
        sans rien modifier.
      </>
    ),
  },
  {
    title: '4. Autoriser l’URL de redirection',
    body: (
      <>
        Dans Authentication → URL Configuration, ajoutez votre URL de développement
        (<Code>http://localhost:3000</Code>) et votre domaine de production aux{' '}
        <em>Redirect URLs</em>, sinon les liens de connexion seront refusés.
      </>
    ),
  },
  {
    title: '5. Redémarrer le serveur',
    body: (
      <>
        Les variables <Code>NEXT_PUBLIC_*</Code> sont injectées au démarrage : relancez{' '}
        <Code>npm run dev</Code> après les avoir modifiées.
      </>
    ),
  },
];

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[0.85em] text-ink-0">
      {children}
    </code>
  );
}

export default function ConfigurationPage() {
  const configured = isSupabaseConfigured();

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-5 py-10">
      <header>
        <h1 className="text-xl font-semibold">Configuration du backend</h1>
        <p
          className={`mt-2 inline-block rounded-full border px-3 py-1 text-xs ${
            configured
              ? 'border-success/40 text-success'
              : 'border-amber-500/40 text-amber-300'
          }`}
        >
          {configured
            ? 'Supabase est configuré côté application.'
            : 'Supabase n’est pas configuré : aucune donnée n’est enregistrée.'}
        </p>
      </header>

      <ol className="space-y-4">
        {STEPS.map((step) => (
          <li key={step.title} className="rounded-2xl border border-line bg-surface-1/80 p-5">
            <h2 className="text-sm font-semibold text-ink-0">{step.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{step.body}</p>
          </li>
        ))}
      </ol>

      <p className="text-sm">
        <Link href="/carte" className="text-accent underline underline-offset-2">
          Retour à la carte
        </Link>
      </p>
    </main>
  );
}
