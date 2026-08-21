'use client';

import { cn } from '@/lib/cn';
import { PERIODS, type PeriodId } from '@/lib/session/period';

export type HistoryControlProps = {
  period: PeriodId | null;
  loading: boolean;
  error: string | null;
  trackCount: number;
  onChange: (period: PeriodId | null) => void;
};

/**
 * Affichage des passages précédents sur la carte.
 *
 * Désactivé par défaut : la question « où suis-je déjà passé ? » ne doit pas
 * encombrer l'écran pendant la détection.
 */
export function HistoryControl({
  period,
  loading,
  error,
  trackCount,
  onChange,
}: HistoryControlProps) {
  return (
    <div className="pointer-events-none absolute top-4 left-3 z-10 max-w-[calc(100%-5.5rem)] pt-safe">
      <div className="pointer-events-auto rounded-xl border border-line bg-surface-1/90 backdrop-blur">
        <div className="flex flex-wrap items-center gap-1 p-1.5">
          <span className="px-1.5 text-[11px] tracking-wide text-ink-2 uppercase">Passages</span>

          <button
            type="button"
            onClick={() => onChange(null)}
            aria-pressed={period === null}
            className={cn(
              'rounded-lg px-2 py-1 text-xs transition-colors',
              period === null ? 'bg-surface-3 text-ink-0' : 'text-ink-2 hover:text-ink-0',
            )}
          >
            Masqués
          </button>

          {PERIODS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              aria-pressed={period === item.id}
              className={cn(
                'rounded-lg px-2 py-1 text-xs transition-colors',
                period === item.id
                  ? 'bg-accent-strong text-surface-0'
                  : 'text-ink-2 hover:text-ink-0',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {period ? (
          <p className="border-t border-line px-3 py-1.5 text-[11px] text-ink-2">
            {error
              ? error
              : loading
                ? 'Chargement…'
                : trackCount === 0
                  ? 'Aucun passage dans cette zone'
                  : `${trackCount} trace${trackCount > 1 ? 's' : ''} affichée${trackCount > 1 ? 's' : ''}`}
          </p>
        ) : null}
      </div>
    </div>
  );
}
