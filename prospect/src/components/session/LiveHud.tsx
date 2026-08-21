'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { StatTile } from './StatTile';
import { ReturnToVehicle } from './ReturnToVehicle';
import { cn } from '@/lib/cn';
import { activeSeconds, averageSpeedMs } from '@/lib/session/clock';
import { formatDistance, formatDuration, formatSpeed } from '@/lib/geo/format';
import { gradeAccuracy } from '@/lib/geo/accuracy';
import type { SessionSummary } from '@/lib/session/types';
import type { GpsFix } from '@/lib/geo/types';
import type { UnitSystem } from '@/lib/supabase/types';

export type LiveHudProps = {
  session: SessionSummary;
  fix: GpsFix | null;
  units: UnitSystem;
  pendingCount: number;
  persisted: boolean;
  syncing: boolean;
  recorderError: string | null;
  wakeLockActive: boolean;
  /** Le GPS est-il réellement en train de fournir des positions ? */
  gpsActive: boolean;
  busy: boolean;
  error: string | null;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onSaveVehicle: () => void;
  onEnableGps: () => void;
};

/**
 * Écran de terrain. Tout ce qui n'est pas indispensable pendant la détection
 * est masqué ; les commandes restent atteignables au pouce.
 */
export function LiveHud({
  session,
  fix,
  units,
  pendingCount,
  persisted,
  syncing,
  recorderError,
  wakeLockActive,
  gpsActive,
  busy,
  error,
  onPause,
  onResume,
  onFinish,
  onSaveVehicle,
  onEnableGps,
}: LiveHudProps) {
  const [now, setNow] = useState(() => Date.now());
  const [confirmFinish, setConfirmFinish] = useState(false);

  // Le chronomètre avance localement : aucun aller-retour réseau par seconde.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const paused = session.status === 'paused';
  const active = activeSeconds(session, now);
  const speed = averageSpeedMs(session.distance_m, active);
  const grade = fix ? gradeAccuracy(fix.accuracyM) : null;

  const vehicle =
    session.vehicle_lat != null && session.vehicle_lon != null
      ? { lat: session.vehicle_lat, lon: session.vehicle_lon }
      : null;

  return (
    <div className="rounded-2xl border border-line bg-surface-1/95 backdrop-blur">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <p className="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
          <span
            className={cn(
              'size-2 rounded-full',
              paused ? 'bg-amber-400' : 'animate-pulse bg-success',
            )}
          />
          <span className={paused ? 'text-amber-300' : 'text-success'}>
            {paused ? 'Sortie en pause' : 'Sortie en cours'}
          </span>
        </p>

        <p className="truncate text-xs text-ink-2">
          {syncing ? 'Envoi…' : pendingCount > 0 ? `${pendingCount} pt en attente` : 'Synchronisé'}
        </p>
      </div>

      {!gpsActive ? (
        <div className="border-b border-line bg-danger/10 px-4 py-3">
          <p className="text-xs text-danger">
            Le GPS est inactif : <strong>aucun point n’est enregistré</strong>.
          </p>
          <Button variant="primary" size="sm" className="mt-2 w-full" onClick={onEnableGps}>
            Activer le GPS
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-3 px-4 py-3">
        <StatTile label="Temps" value={formatDuration(active * 1000)} />
        <StatTile
          label="Distance"
          value={formatDistance(session.distance_m, units)}
          hint={speed ? formatSpeed(speed, units) : undefined}
        />
        <StatTile
          label="Points"
          value={String(session.point_count + pendingCount)}
          hint={grade ? `± ${formatDistance(fix?.accuracyM ?? 0, units)}` : 'GPS inactif'}
        />
      </div>

      {vehicle ? (
        <div className="border-t border-line px-4 py-3">
          <ReturnToVehicle
            vehicle={vehicle}
            current={fix}
            label={session.vehicle_label}
            units={units}
          />
        </div>
      ) : (
        <div className="border-t border-line px-4 py-3">
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={onSaveVehicle}
            disabled={!fix || busy}
          >
            {fix ? 'Enregistrer ma voiture ici' : 'Position GPS requise pour le point de retour'}
          </Button>
        </div>
      )}

      <div className="flex gap-2 border-t border-line px-4 py-3 pb-safe">
        {paused ? (
          <Button variant="primary" size="lg" className="flex-1" onClick={onResume} disabled={busy}>
            Reprendre
          </Button>
        ) : (
          <Button variant="secondary" size="lg" className="flex-1" onClick={onPause} disabled={busy}>
            Pause
          </Button>
        )}

        {confirmFinish ? (
          <>
            <Button
              variant="danger"
              size="lg"
              className="flex-1"
              onClick={() => {
                setConfirmFinish(false);
                onFinish();
              }}
              disabled={busy}
            >
              Confirmer
            </Button>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => setConfirmFinish(false)}
              disabled={busy}
            >
              Annuler
            </Button>
          </>
        ) : (
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            onClick={() => setConfirmFinish(true)}
            disabled={busy}
          >
            Terminer
          </Button>
        )}
      </div>

      {(error || recorderError || !persisted || !wakeLockActive) && (
        <div className="space-y-1 border-t border-line px-4 py-2 text-[11px]">
          {error ? <p className="text-danger">{error}</p> : null}
          {recorderError ? <p className="text-amber-300">{recorderError}</p> : null}
          {!persisted ? (
            <p className="text-danger">
              Le navigateur refuse d’écrire le tampon local : en cas de coupure réseau, les
              derniers points pourraient être perdus.
            </p>
          ) : null}
          {!wakeLockActive ? (
            <p className="text-ink-2">
              L’écran peut s’éteindre : ce navigateur ne maintient pas l’écran allumé.
            </p>
          ) : null}
        </div>
      )}

      <p className="border-t border-line px-4 py-2 text-[11px] text-ink-2">
        <Link href={`/sorties/${session.id}`} className="underline underline-offset-2">
          Voir la fiche de cette sortie
        </Link>
      </p>
    </div>
  );
}
