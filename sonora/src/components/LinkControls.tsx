'use client';

import { useState } from 'react';
import { useToast } from './Toast';
import { formatDate } from '@/lib/format';
import { CheckIcon, LockIcon } from './icons';

export interface LinkState {
  hasPassword: boolean;
  expiresAt: string | null;
}

/** Offered as durations rather than a date picker: nobody means "14 March". */
const WINDOWS: { label: string; hours: number | null }[] = [
  { label: 'Never', hours: null },
  { label: '24 hours', hours: 24 },
  { label: '7 days', hours: 24 * 7 },
  { label: '30 days', hours: 24 * 30 },
];

/**
 * Controls that belong to the link rather than to the track: a password, and a
 * date after which it stops working.
 *
 * Both are enforced by the server on every path — the page, the stream and the
 * download — so this is a control, not a hint. PRIVATE is still the setting
 * that means nobody but the owner; a password is for a link you do want to send
 * but not to anyone who is forwarded it.
 */
export default function LinkControls({
  trackId,
  initial,
  onChanged,
}: {
  trackId: string;
  initial: LinkState;
  onChanged: (state: LinkState) => void;
}) {
  const toast = useToast();
  const [state, setState] = useState<LinkState>(initial);
  const [password, setPassword] = useState('');
  const [editingPassword, setEditingPassword] = useState(!initial.hasPassword);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (payload: Record<string, unknown>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tracks/${trackId}/link`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Could not change the link.');
      const next: LinkState = { hasPassword: body.hasPassword, expiresAt: body.expiresAt };
      setState(next);
      onChanged(next);
      toast(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the link.');
    } finally {
      setBusy(false);
    }
  };

  const setWindow = (hours: number | null) => {
    const expiresAt = hours === null ? null : new Date(Date.now() + hours * 3600_000).toISOString();
    void send({ expiresAt }, hours === null ? 'The link no longer expires' : 'Expiry set');
  };

  const currentHours = (() => {
    if (!state.expiresAt) return null;
    const ms = new Date(state.expiresAt).getTime() - Date.now();
    const match = WINDOWS.find((w) => w.hours !== null && Math.abs(w.hours * 3600_000 - ms) < 3600_000);
    return match?.hours ?? -1;
  })();

  return (
    <section className="linkctl" aria-label="Link controls">
      <div className="replace__head">
        <span className="label" style={{ margin: 0 }}>Link controls</span>
        <span className="hint">A password to open it, and a date it stops working.</span>
      </div>

      {error && <p className="gate__error" role="alert">{error}</p>}

      <div className="linkctl__row">
        <span className="linkctl__legend"><LockIcon size={13} /> Password</span>
        {state.hasPassword && !editingPassword ? (
          <div className="row" style={{ gap: 8 }}>
            <span className="linkctl__on"><CheckIcon size={13} /> Set</span>
            <button type="button" className="btn btn--sm btn--ghost" disabled={busy}
              onClick={() => { setPassword(''); setEditingPassword(true); }}>
              Change
            </button>
            <button type="button" className="btn btn--sm btn--ghost" disabled={busy}
              onClick={() => { setEditingPassword(true); void send({ password: null }, 'Password removed'); }}>
              Remove
            </button>
          </div>
        ) : (
          <div className="row" style={{ gap: 8 }}>
            <input
              className="input input--sm"
              type="password"
              autoComplete="new-password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="btn btn--sm"
              disabled={busy || password.length < 6}
              onClick={() => send({ password }, 'Link locked').then(() => {
                setPassword('');
                setEditingPassword(false);
              })}
            >
              Lock
            </button>
          </div>
        )}
      </div>

      <div className="linkctl__row">
        <span className="linkctl__legend">Expires</span>
        <div className="row row--wrap" style={{ gap: 6 }}>
          {WINDOWS.map((w) => (
            <button
              key={w.label}
              type="button"
              className={`chip chip--action ${currentHours === w.hours ? 'is-on' : ''}`}
              disabled={busy}
              onClick={() => setWindow(w.hours)}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {state.expiresAt && (
        <p className="hint">Stops working on {formatDate(state.expiresAt)}.</p>
      )}
    </section>
  );
}
