'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { gradeAccuracy } from '@/lib/geo/accuracy';
import {
  formatBearing,
  formatDecimal,
  formatDms,
  formatDistance,
  formatSpeed,
} from '@/lib/geo/format';
import type { GeolocationState } from '@/hooks/useGeolocation';
import type { UnitSystem } from '@/lib/supabase/types';

export type PositionReadoutProps = {
  geo: GeolocationState;
  units: UnitSystem;
  canSaveHome: boolean;
  saveState: string | null;
  onSaveHome: () => void;
  onStart: () => void;
};

/**
 * Panneau d'information GPS. Le positionnement est laissé au parent : deux
 * panneaux superposés en `absolute` se recouvriraient et bloqueraient les clics.
 *
 * Il affiche systématiquement l'incertitude : le GPS d'un smartphone est
 * métrique, jamais centimétrique.
 */
export function PositionReadout({
  geo,
  units,
  canSaveHome,
  saveState,
  onSaveHome,
  onStart,
}: PositionReadoutProps) {
  const [showDms, setShowDms] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { fix, status, error, fixCount } = geo;

  if (!fix) {
    return (
      <div className="pb-safe">
        <div className="rounded-2xl border border-line bg-surface-1/95 p-4 backdrop-blur">
          <p className="text-sm text-ink-1">
            {status === 'requesting'
              ? 'Recherche du signal GPS…'
              : (error ?? 'Le GPS est éteint. Activez-le pour voir votre position.')}
          </p>
          {status !== 'requesting' && status !== 'denied' ? (
            <Button variant="primary" size="lg" className="mt-3 w-full" onClick={onStart}>
              Activer le GPS
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const grade = gradeAccuracy(fix.accuracyM);

  return (
    <div className="pb-safe">
      <div className="rounded-2xl border border-line bg-surface-1/95 backdrop-blur">
        <div className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => setShowDms((value) => !value)}
              className="block truncate text-left font-mono text-sm text-ink-0"
              title="Basculer entre degrés décimaux et DMS"
            >
              {showDms ? formatDms(fix) : formatDecimal(fix)}
            </button>
            <p className="mt-1 text-xs text-ink-2">
              Précision{' '}
              <span className={cn('font-semibold', grade.tone)}>
                ± {formatDistance(fix.accuracyM, units)}
              </span>{' '}
              · {grade.label}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="tap-target shrink-0 rounded-lg px-2 text-xs text-ink-2 hover:text-ink-0"
          >
            {expanded ? 'Réduire' : 'Détails'}
          </button>
        </div>

        {expanded ? (
          <div className="border-t border-line p-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Detail label="Altitude">
                {fix.altitudeM === null ? '—' : formatDistance(fix.altitudeM, units)}
              </Detail>
              <Detail label="Vitesse">{formatSpeed(fix.speedMs, units)}</Detail>
              <Detail label="Cap">{formatBearing(fix.headingDeg)}</Detail>
              <Detail label="Positions reçues">{fixCount}</Detail>
              <Detail label="Dernier point">
                {new Date(fix.timestamp).toLocaleTimeString('fr-FR')}
              </Detail>
              <Detail label="Incertitude altitude">
                {fix.altitudeAccuracyM === null
                  ? '—'
                  : `± ${formatDistance(fix.altitudeAccuracyM, units)}`}
              </Detail>
            </dl>

            {canSaveHome ? (
              <div className="mt-4">
                <Button variant="secondary" size="md" className="w-full" onClick={onSaveHome}>
                  Définir comme point d’ouverture de la carte
                </Button>
                {saveState ? (
                  <p className="mt-2 text-center text-xs text-ink-2">{saveState}</p>
                ) : null}
              </div>
            ) : null}

            {error ? <p className="mt-3 text-xs text-danger">{error}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-2">{label}</dt>
      <dd className="mt-0.5 font-mono text-ink-0">{children}</dd>
    </div>
  );
}
