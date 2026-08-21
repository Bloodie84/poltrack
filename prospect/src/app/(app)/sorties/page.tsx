import type { Metadata } from 'next';
import Link from 'next/link';
import { SessionFilters } from './SessionFilters';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { formatDistance, formatDuration } from '@/lib/geo/format';
import { effectiveSettings, loadAppContext } from '@/lib/data/context';
import { listSessions } from '@/lib/data/sessions';
import type { SessionOverviewRow, UnitSystem } from '@/lib/supabase/types';

export const metadata: Metadata = { title: 'Sorties' };

const PAGE_SIZE = 25;

function firstParam(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') return value;
  return Array.isArray(value) ? (value[0] ?? null) : null;
}

/** Ne transmet à la base qu'une date réellement analysable. */
function isoOrNull(value: string | null): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function SessionRow({ session, units }: { session: SessionOverviewRow; units: UnitSystem }) {
  const started = new Date(session.started_at);
  const running = session.status !== 'finished';

  return (
    <li>
      <Link
        href={`/sorties/${session.id}`}
        className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface-1/80 p-4 transition-colors hover:bg-surface-2"
      >
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-0">
            {session.title ?? started.toLocaleDateString('fr-FR', { dateStyle: 'long' })}
            {running ? (
              <span className="ml-2 rounded-full border border-success/40 px-2 py-0.5 text-[11px] text-success">
                en cours
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-ink-2">
            {started.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
            {session.detector_brand
              ? ` · ${session.detector_brand} ${session.detector_model ?? ''}`
              : ''}
          </p>
        </div>

        <dl className="flex shrink-0 gap-4 text-right">
          <div>
            <dt className="text-[11px] text-ink-2 uppercase">Durée</dt>
            <dd className="font-mono text-sm text-ink-0">
              {formatDuration(session.active_seconds * 1000)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-ink-2 uppercase">Distance</dt>
            <dd className="font-mono text-sm text-ink-0">
              {formatDistance(session.distance_m, units)}
            </dd>
          </div>
        </dl>
      </Link>
    </li>
  );
}

export default async function SessionsPage(props: PageProps<'/sorties'>) {
  const searchParams = await props.searchParams;
  const context = await loadAppContext();

  if (!context.user) {
    return (
      <div className="mx-auto w-full max-w-3xl p-5">
        <Card title="Connexion requise" description="Vos sorties sont enregistrées sur votre compte.">
          <Link href="/connexion">
            <Button variant="primary">Se connecter</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const settings = effectiveSettings(context);
  const page = Math.max(Number(firstParam(searchParams.page) ?? '1') || 1, 1);
  const from = isoOrNull(firstParam(searchParams.depuis));
  const to = isoOrNull(firstParam(searchParams.jusqu));

  const { sessions, hasMore, error } = await listSessions({
    from,
    to,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const queryFor = (nextPage: number) => {
    const params = new URLSearchParams();
    if (from) params.set('depuis', from);
    if (to) params.set('jusqu', to);
    if (nextPage > 1) params.set('page', String(nextPage));
    const query = params.toString();
    return query ? `/sorties?${query}` : '/sorties';
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 p-5">
      <header>
        <h1 className="text-xl font-semibold">Sorties</h1>
        <p className="mt-1 text-sm text-ink-2">
          Historique de vos passages. Les traces s’affichent aussi sur la carte principale.
        </p>
      </header>

      <SessionFilters activeFrom={from} />

      {error ? (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          Impossible de charger les sorties. Les migrations sont-elles appliquées ?
        </p>
      ) : null}

      {sessions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-2">
          Aucune sortie sur cette période.
        </p>
      ) : (
        <ul className="space-y-3">
          {sessions.map((session) => (
            <SessionRow key={session.id} session={session} units={settings.units} />
          ))}
        </ul>
      )}

      {(page > 1 || hasMore) && (
        <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
          {page > 1 ? (
            <Link href={queryFor(page - 1)}>
              <Button variant="secondary" size="sm">
                Précédent
              </Button>
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-ink-2">Page {page}</span>
          {hasMore ? (
            <Link href={queryFor(page + 1)}>
              <Button variant="secondary" size="sm">
                Suivant
              </Button>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
