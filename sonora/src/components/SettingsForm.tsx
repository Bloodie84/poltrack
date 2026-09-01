'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from './Toast';
import { AlertIcon } from './icons';

export default function SettingsForm({
  email,
  displayName: initialName,
}: {
  email: string;
  displayName: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [displayName, setDisplayName] = useState(initialName);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = displayName.trim();
    if (!name) {
      setNameError('Artist name cannot be empty.');
      return;
    }
    setSavingName(true);
    setNameError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setNameError('Your session expired. Log in again.');
      setSavingName(false);
      return;
    }
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: name })
      .eq('id', user.id);
    setSavingName(false);
    if (error) {
      setNameError(error.message);
      return;
    }
    toast('Profile updated');
    router.refresh();
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setPasswordError('The two passwords do not match.');
      return;
    }
    setSavingPassword(true);
    setPasswordError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPassword(false);
    if (error) {
      setPasswordError(error.message);
      return;
    }
    setPassword('');
    setConfirm('');
    toast('Password updated');
  };

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  return (
    <div className="stack stack--24">
      <form className="card stack stack--16" onSubmit={saveName}>
        <div className="stack stack--4">
          <h2 style={{ fontSize: 17 }}>Profile</h2>
          <p className="hint">The name suggested as the artist when you upload.</p>
        </div>

        {nameError && (
          <div className="alert alert--error" role="alert"><AlertIcon size={16} /> <span>{nameError}</span></div>
        )}

        <div className="field">
          <label className="label" htmlFor="display-name">Artist name</label>
          <input
            id="display-name"
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={60}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="settings-email">E-mail</label>
          <input id="settings-email" className="input" value={email} readOnly disabled />
        </div>

        <div className="row">
          <button className="btn btn--primary" type="submit" disabled={savingName}>
            {savingName && <span className="spinner" />} Save profile
          </button>
        </div>
      </form>

      <form className="card stack stack--16" onSubmit={savePassword}>
        <div className="stack stack--4">
          <h2 style={{ fontSize: 17 }}>Password</h2>
          <p className="hint">Choose a new password for this account.</p>
        </div>

        {passwordError && (
          <div className="alert alert--error" role="alert"><AlertIcon size={16} /> <span>{passwordError}</span></div>
        )}

        <div className="field">
          <label className="label" htmlFor="new-password">New password</label>
          <input
            id="new-password"
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="At least 8 characters"
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="confirm-password">Confirm password</label>
          <input
            id="confirm-password"
            className="input"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </div>

        <div className="row">
          <button className="btn btn--primary" type="submit" disabled={savingPassword || !password}>
            {savingPassword && <span className="spinner" />} Update password
          </button>
        </div>
      </form>

      <div className="card row row--between row--wrap" style={{ gap: 12 }}>
        <div className="stack stack--4">
          <h2 style={{ fontSize: 17 }}>Session</h2>
          <p className="hint">Sign out of this device.</p>
        </div>
        <button type="button" className="btn btn--outline" onClick={signOut}>Sign out</button>
      </div>
    </div>
  );
}
