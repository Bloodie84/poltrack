'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/cn';
import { PERIODS, periodRange, type PeriodId } from '@/lib/session/period';

/**
 * Filtres de période.
 *
 * Les bornes sont calculées dans le navigateur : « aujourd'hui » doit
 * correspondre à la journée de l'utilisateur, pas à celle du serveur.
 */
export function SessionFilters({ activeFrom }: { activeFrom: string | null }) {
  const router = useRouter();
  const params = useSearchParams();

  const apply = (id: PeriodId) => {
    const { from } = periodRange(id, new Date());
    const next = new URLSearchParams(params.toString());
    next.delete('page');

    if (from) next.set('depuis', from.toISOString());
    else next.delete('depuis');

    const query = next.toString();
    router.push(query ? `/sorties?${query}` : '/sorties');
  };

  const isActive = (id: PeriodId) => {
    const { from } = periodRange(id, new Date());
    if (!from) return activeFrom === null;
    return activeFrom !== null && Math.abs(Date.parse(activeFrom) - from.getTime()) < 1000;
  };

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par période">
      {PERIODS.map((period) => (
        <button
          key={period.id}
          type="button"
          onClick={() => apply(period.id)}
          aria-pressed={isActive(period.id)}
          className={cn(
            'rounded-xl border px-3 py-1.5 text-sm transition-colors',
            isActive(period.id)
              ? 'border-accent bg-surface-3 text-ink-0'
              : 'border-line text-ink-2 hover:text-ink-0',
          )}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
}
