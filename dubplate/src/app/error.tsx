'use client';

import { useEffect } from 'react';
import { AlertIcon } from '@/components/icons';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container container--narrow" style={{ paddingTop: '10vh', textAlign: 'center' }}>
      <div className="auth__icon" style={{ background: 'var(--danger-dim)', color: 'var(--danger)' }}>
        <AlertIcon size={22} />
      </div>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Something went wrong</h1>
      <p className="hint" style={{ marginBottom: 22 }}>
        The page could not be loaded. This is usually temporary.
      </p>
      <button type="button" className="btn btn--primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
