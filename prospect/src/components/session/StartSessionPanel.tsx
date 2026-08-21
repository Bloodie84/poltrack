'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Field';
import { formatDistance, formatDuration } from '@/lib/geo/format';
import type { SessionSummary } from '@/lib/session/types';
import type { GpsFix } from '@/lib/geo/types';
import type { UnitSystem } from '@/lib/supabase/types';

export type StartSessionPanelProps = {
  fix: GpsFix | null;
  canRecord: boolean;
  busy: boolean;
  error: string | null;
  justFinished: SessionSummary | null;
  units: UnitSystem;
  onStart: (saveVehicle: boolean) => void;
  onDismissSummary: () => void;
};

/** Récapitulatif affiché juste après la fin d'une sortie. */
function FinishedSummary({
  session,
  units,
  onDismiss,
}: {
  session: SessionSummary;
  units: UnitSystem;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-2xl border border-success/40 bg-success/10 p-4">
      <p className="text-sm font-semibold text-success">Sortie terminée</p>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-[11px] text-ink-2 uppercase">Durée</dt>
          <dd className="font-mono text-ink-0">{formatDuration(session.active_seconds * 1000)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-ink-2 uppercase">Distance</dt>
          <dd className="font-mono text-ink-0">{formatDistance(session.distance_m, units)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-ink-2 uppercase">Points</dt>
          <dd className="font-mono text-ink-0">{session.point_count}</dd>
        </div>
      </dl>
      <div className="mt-3 flex gap-2">
        <Link href={`/sorties/${session.id}`} className="flex-1">
          <Button variant="secondary" size="sm" className="w-full">
            Voir la sortie
          </Button>
        </Link>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Fermer
        </Button>
      </div>
    </div>
  );
}

export function StartSessionPanel({
  fix,
  canRecord,
  busy,
  error,
  justFinished,
  units,
  onStart,
  onDismissSummary,
}: StartSessionPanelProps) {
  const [saveVehicle, setSaveVehicle] = useState(true);

  if (justFinished) {
    return (
      <FinishedSummary session={justFinished} units={units} onDismiss={onDismissSummary} />
    );
  }

  if (!canRecord) return null;

  return (
    <div className="rounded-2xl border border-line bg-surface-1/95 p-4 backdrop-blur">
      <Toggle
        checked={saveVehicle}
        onChange={(event) => setSaveVehicle(event.target.checked)}
        label="Enregistrer mon point de retour"
        hint="Votre position de départ servira à vous guider au retour."
        disabled={!fix}
      />

      <Button
        variant="primary"
        size="lg"
        className="mt-3 w-full"
        onClick={() => onStart(saveVehicle && fix !== null)}
        disabled={busy}
      >
        {busy ? 'Démarrage…' : 'Démarrer une sortie'}
      </Button>

      {!fix ? (
        <p className="mt-2 text-center text-[11px] text-ink-2">
          Sans position GPS, la sortie démarre sans point de départ ; l’enregistrement
          commencera dès le premier fix.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-center text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
