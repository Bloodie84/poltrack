'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AlertIcon, MailIcon } from './icons';

type Mode = 'login' | 'register';

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/library';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get('error'));
  const [confirmSent, setConfirmSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'register' && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setBusy(true);
    const supabase = createClient();

    if (mode === 'login') {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (signInError) {
        setError(
          signInError.message === 'Invalid login credentials'
            ? 'Wrong e-mail or password.'
            : signInError.message
        );
        return;
      }
      router.push(next);
      router.refresh();
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName.trim() || email.split('@')[0] },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setBusy(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (data.session) {
      router.push(next);
      router.refresh();
      return;
    }

    setConfirmSent(true);
  };

  if (confirmSent) {
    return (
      <div className="card fade-in" style={{ textAlign: 'center' }}>
        <div className="auth__icon"><MailIcon size={22} /></div>
        <h1 style={{ fontSize: 21, marginBottom: 8 }}>Check your inbox</h1>
        <p className="hint" style={{ marginBottom: 18 }}>
          We sent a confirmation link to <strong style={{ color: 'var(--text-2)' }}>{email}</strong>.
          Open it to activate your account.
        </p>
        <Link href="/login" className="btn btn--outline btn--block">Back to log in</Link>
      </div>
    );
  }

  return (
    <form className="card stack stack--16 fade-in" method="post" onSubmit={submit} noValidate>
      <div className="stack stack--4">
        <h1 style={{ fontSize: 22 }}>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="hint">
          {mode === 'login'
            ? 'Log in to upload and manage your tracks.'
            : 'It takes a few seconds. Then upload your first track.'}
        </p>
      </div>

      {error && (
        <div className="alert alert--error" role="alert">
          <AlertIcon size={16} /> <span>{error}</span>
        </div>
      )}

      {mode === 'register' && (
        <div className="field">
          <label className="label" htmlFor="displayName">Artist name</label>
          <input
            id="displayName"
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How your tracks are credited"
            autoComplete="nickname"
            maxLength={60}
          />
        </div>
      )}

      <div className="field">
        <label className="label" htmlFor="email">E-mail</label>
        <input
          id="email"
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
        <label className="label" htmlFor="password">Password</label>
        <input
          id="password"
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
          minLength={mode === 'register' ? 8 : undefined}
        />
      </div>

      <button className="btn btn--primary btn--lg btn--block" type="submit" disabled={busy}>
        {busy && <span className="spinner" />}
        {mode === 'login' ? 'Log in' : 'Create account'}
      </button>

      <p className="hint" style={{ textAlign: 'center' }}>
        {mode === 'login' ? (
          <>No account yet? <Link href="/register" className="link">Create one</Link></>
        ) : (
          <>Already have an account? <Link href="/login" className="link">Log in</Link></>
        )}
      </p>
    </form>
  );
}
