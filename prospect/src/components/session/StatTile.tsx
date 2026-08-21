import { cn } from '@/lib/cn';

/**
 * `data-stat` est un point d'ancrage stable pour les tests de bout en bout :
 * les libellés sont mis en majuscules par CSS, ce qui rend la sélection par le
 * texte affiché trompeuse.
 */
export function StatTile({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div data-stat={label} className={cn('min-w-0', className)}>
      <p className="text-[11px] tracking-wide text-ink-2 uppercase">{label}</p>
      <p className="mt-0.5 truncate font-mono text-xl text-ink-0 tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 truncate text-[11px] text-ink-2">{hint}</p> : null}
    </div>
  );
}
