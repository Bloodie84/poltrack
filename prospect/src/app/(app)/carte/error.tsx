'use client';

import { Button } from '@/components/ui/Button';

export default function MapError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-lg font-semibold">La carte n’a pas pu s’afficher</h1>
      <p className="max-w-md text-sm leading-relaxed text-ink-2">{error.message}</p>
      <Button variant="primary" onClick={reset}>
        Réessayer
      </Button>
    </div>
  );
}
