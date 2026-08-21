import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-line bg-surface-1/80 p-5 shadow-lg shadow-black/20',
        className,
      )}
    >
      {title ? (
        <header className="mb-4">
          <h2 className="text-base font-semibold text-ink-0">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-relaxed text-ink-2">{description}</p>
          ) : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
