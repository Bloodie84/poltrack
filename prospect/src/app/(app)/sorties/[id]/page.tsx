import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { FeatureCollection } from 'geojson';
import { SessionDetails } from './SessionDetails';
import { SessionMapLoader } from '@/components/map/SessionMapLoader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatTile } from '@/components/session/StatTile';
import { resolveBasemap } from '@/components/map/basemaps';
import { formatArea, formatDecimal, formatDistance, formatDuration, formatSpeed } from '@/lib/geo/format';
import { averageSpeedMs } from '@/lib/session/clock';
import { effectiveSettings, loadAppContext } from '@/lib/data/context';
import { getSession, getSessionGeoJson } from '@/lib/data/sessions';
import { getServerClient } from '@/lib/supabase/server';
import type { DetectorRow } from '@/lib/supabase/types';

export const metadata: Metadata = { title: 'Sortie' };

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

export default async function SessionPage(props: PageProps<'/sorties/[id]'>) {
  const { id } = await props.params;
  const context = await loadAppContext();

  if (!context.user) {
    return (
      <div className="mx-auto w-full max-w-3xl p-5">
        <Card title="Connexion requise" description="Cette sortie appartient à votre compte.">
          <Link href="/connexion">
            <Button variant="primary">Se connecter</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const session = await getSession(id);
  if (!session) notFound();

  const settings = effectiveSettings(context);
  const geojson = ((await getSessionGeoJson(id)) as FeatureCollection | null) ?? EMPTY;

  const supabase = await getServerClient();
  const detectorsQuery = supabase
    ? ((await supabase
        .from('detectors')
        .select('*')
        .is('deleted_at', null)
        .order('brand')) as { data: DetectorRow[] | null })
    : { data: null };

  const started = new Date(session.started_at);
  const speed = averageSpeedMs(session.distance_m, session.active_seconds);
  // Surface balayée théorique : longueur parcourue × largeur de prospection.
  // La couverture réelle (recouvrements compris) arrive en phase 4.
  const sweptM2 = session.distance_m * session.sweep_width_m;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/sorties" className="text-xs text-ink-2 underline underline-offset-2">
            ← Toutes les sorties
          </Link>
          <h1 className="mt-1 text-xl font-semibold">
            {session.title ?? started.toLocaleDateString('fr-FR', { dateStyle: 'long' })}
          </h1>
          <p className="mt-1 text-sm text-ink-2">
            {started.toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}
            {session.status !== 'finished' ? ' · sortie en cours' : ''}
          </p>
        </div>
      </header>

      <Card>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile label="Durée" value={formatDuration(session.active_seconds * 1000)} hint="hors pauses" />
          <StatTile label="Distance" value={formatDistance(session.distance_m, settings.units)} />
          <StatTile
            label="Points GPS"
            value={String(session.point_count)}
            hint={`largeur ${session.sweep_width_m} m`}
          />
          <StatTile
            label="Bande balayée"
            value={formatArea(sweptM2, settings.units)}
            hint="estimation, sans recouvrement"
          />
        </dl>

        <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-[11px] text-ink-2 uppercase">Vitesse moyenne</dt>
            <dd className="font-mono text-ink-0">
              {speed ? formatSpeed(speed, settings.units) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-ink-2 uppercase">Pauses</dt>
            <dd className="font-mono text-ink-0">{formatDuration(session.paused_seconds * 1000)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-ink-2 uppercase">Départ</dt>
            <dd className="font-mono text-ink-0">
              {session.start_lat != null && session.start_lon != null
                ? formatDecimal({ lat: session.start_lat, lon: session.start_lon }, 5)
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-ink-2 uppercase">Matériel</dt>
            <dd className="text-ink-0">
              {session.detector_brand
                ? `${session.detector_brand} ${session.detector_model ?? ''}`
                : '—'}
            </dd>
          </div>
        </dl>
      </Card>

      <div className="h-[26rem]">
        <SessionMapLoader
          basemapId={resolveBasemap(settings.default_basemap).id}
          geojson={geojson}
        />
      </div>

      <SessionDetails session={session} detectors={detectorsQuery.data ?? []} />
    </div>
  );
}
