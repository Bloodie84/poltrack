'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertIcon, LockIcon } from './icons';

/**
 * What a visitor sees when the link opened but the track did not: either it is
 * behind a password, or it has passed its end date.
 *
 * Deliberately says nothing about the track. No title, no artist, no artwork —
 * a lock that announced what it was locking would be half a lock.
 */
export default function TrackGate({
  state,
  shortId,
}: {
  state: 'locked' | 'expired';
  shortId: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state === 'expired') {
    return (
      <div className="gate fade-in">
        <span className="gate__mark"><AlertIcon size={22} /></span>
        <h1 className="gate__title">This link has expired</h1>
        <p className="gate__hint">
          The artist set an end date for it. Ask them for a new one.
        </p>
      </div>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/tracks/unlock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ shortId, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'That password does not open this link.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That password does not open this link.');
      setBusy(false);
    }
  };

  return (
    <div className="gate fade-in">
      <span className="gate__mark"><LockIcon size={22} /></span>
      <h1 className="gate__title">This link is protected</h1>
      <p className="gate__hint">Enter the password the artist gave you.</p>

      <form className="gate__form" onSubmit={submit}>
        <label className="visually-hidden" htmlFor="gate-password">Password</label>
        <input
          id="gate-password"
          className="input"
          type="password"
          autoComplete="off"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
        />
        <button type="submit" className="btn btn--primary" disabled={busy || !password}>
          {busy && <span className="spinner" />} Open
        </button>
      </form>

      {error && (
        <p className="gate__error" role="alert">{error}</p>
      )}
    </div>
  );
}
