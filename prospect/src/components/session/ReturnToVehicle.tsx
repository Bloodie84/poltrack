'use client';

import { bearingDeg, haversineDistanceM } from '@/lib/geo/distance';
import { formatBearing, formatDistance } from '@/lib/geo/format';
import type { LatLng } from '@/lib/geo/types';
import type { UnitSystem } from '@/lib/supabase/types';

export type ReturnToVehicleProps = {
  vehicle: LatLng;
  current: LatLng | null;
  label: string | null;
  units: UnitSystem;
};

/**
 * Cap et distance vers le point de retour.
 *
 * Le calcul est entièrement local : il continue de fonctionner sans réseau,
 * ce qui est précisément le cas d'usage (retour à la voiture en forêt).
 */
export function ReturnToVehicle({ vehicle, current, label, units }: ReturnToVehicleProps) {
  if (!current) {
    return (
      <p className="text-xs text-ink-2">
        {label ?? 'Point de retour'} enregistré. En attente d’une position GPS pour indiquer
        la direction.
      </p>
    );
  }

  const distance = haversineDistanceM(current, vehicle);
  const bearing = bearingDeg(current, vehicle);

  return (
    <div className="flex items-center gap-3">
      <svg
        viewBox="0 0 48 48"
        aria-hidden
        className="size-10 shrink-0 text-accent"
        style={{ transform: `rotate(${bearing}deg)` }}
      >
        <path d="M24 6 36 40 24 32 12 40Z" fill="currentColor" />
      </svg>
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-0">
          {label ?? 'Retour'} · {formatDistance(distance, units)}
        </p>
        <p className="text-xs text-ink-2">
          Direction {formatBearing(bearing)} — à vol d’oiseau, sans tenir compte du terrain.
        </p>
      </div>
    </div>
  );
}
