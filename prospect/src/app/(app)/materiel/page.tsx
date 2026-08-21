import type { Metadata } from 'next';
import Link from 'next/link';
import { DetectorManager } from './DetectorManager';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getServerClient } from '@/lib/supabase/server';
import { loadAppContext } from '@/lib/data/context';
import type { DetectorRow } from '@/lib/supabase/types';

export const metadata: Metadata = { title: 'Matériel' };

export default async function DetectorsPage() {
  const context = await loadAppContext();
  const supabase = await getServerClient();

  if (!context.user || !supabase) {
    return (
      <div className="mx-auto w-full max-w-2xl p-5">
        <Card
          title="Connexion requise"
          description="Votre matériel est enregistré sur votre compte."
        >
          <Link href="/connexion">
            <Button variant="primary">Se connecter</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const { data, error } = (await supabase
    .from('detectors')
    .select('*')
    .is('deleted_at', null)
    .order('is_default', { ascending: false })
    .order('brand', { ascending: true })) as { data: DetectorRow[] | null; error: unknown };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 p-5">
      <header>
        <h1 className="text-xl font-semibold">Matériel</h1>
        <p className="mt-1 text-sm text-ink-2">
          Chaque sortie et chaque découverte pourra être rattachée au détecteur utilisé.
        </p>
      </header>

      {error ? (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          Impossible de charger le matériel. Les migrations sont-elles appliquées ?
        </p>
      ) : null}

      <DetectorManager detectors={data ?? []} />
    </div>
  );
}
