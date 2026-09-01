'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from './Toast';
import { AlertIcon, CheckIcon } from './icons';

/**
 * Attaches an e-mail and password to a guest account. The user id never
 * changes, so every track they have already uploaded stays theirs.
 */
export default function ClaimAccount({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ email, password });
    setBusy(false);
    if (updateError) {
      setError(
        /registered/i.test(updateError.message)
          ? 'That e-mail is already used by another account.'
          : updateError.message
      );
      return;
    }
    setDone(true);
    toast('Account saved');
    router.refresh();
  };

  if (done) {
    return (
      <div className="claim claim--done">
        <CheckIcon size={16} />
        <span>
          Saved to <strong>{email}</strong>. If confirmation e-mails are on, open the link we just
          sent to finish.
        </span>
      </div>
    );
  }

  return (
    <form className={`claim ${compact ? 'claim--compact' : ''}`} onSubmit={submit} noValidate>
      <div className="stack stack--4">
        <h3 style={{ fontSize: 15 }}>Keep these tracks</h3>
        <p className="hint">
          They belong to this browser right now. Add an e-mail and a password to reach them from
          anywhere — your links and play counts stay exactly as they are.
        </p>
      </div>

      {error && (
        <div className="alert alert--error" role="alert">
          <AlertIcon size={16} /> <span>{error}</span>
        </div>
      )}

      <div className="claim__fields">
        <div className="field">
          <label className="label" htmlFor="claim-email">E-mail</label>
          <input
            id="claim-email"
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="claim-password">Password</label>
          <input
            id="claim-password"
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            required
          />
        </div>
      </div>

      <button className="btn btn--primary" type="submit" disabled={busy}>
        {busy && <span className="spinner" />} Save my account
      </button>
    </form>
  );
}
