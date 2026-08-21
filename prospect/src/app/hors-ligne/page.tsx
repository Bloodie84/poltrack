import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Hors ligne' };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Pas de réseau</h1>
      <p className="text-sm leading-relaxed text-ink-2">
        Cette page n’a pas pu être chargée. En phase 1, seule la coque de l’application est
        disponible hors ligne : l’enregistrement des sorties et des découvertes sans réseau
        arrivera en phase 5.
      </p>
      <p className="text-sm leading-relaxed text-ink-2">
        Si l’application est déjà ouverte, la carte et le GPS continuent de fonctionner avec
        les tuiles déjà chargées.
      </p>
    </main>
  );
}
