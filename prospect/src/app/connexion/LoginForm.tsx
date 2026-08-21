'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { getBrowserClient } from '@/lib/supabase/browser';
import { siteUrl } from '@/lib/env';

type Status = { kind: 'idle' | 'sending' | 'sent' | 'error'; message: string };

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle', message: '' });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const supabase = getBrowserClient();
    if (!supabase) {
      setStatus({ kind: 'error', message: 'Supabase n’est pas configuré.' });
      return;
    }

    setStatus({ kind: 'sending', message: '' });

    // NEXT_PUBLIC_SITE_URL prend le pas sur l'origine du navigateur : derrière
    // un proxy ou un tunnel, l'origine vue par le client n'est pas celle que
    // Supabase autorise.
    const redirectTo = new URL('/auth/confirm', siteUrl() ?? window.location.origin);
    redirectTo.searchParams.set('suivant', next);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo.toString() },
    });

    setStatus(
      error
        ? { kind: 'error', message: error.message }
        : {
            kind: 'sent',
            message:
              'Lien envoyé. Ouvrez-le depuis cet appareil : il expire au bout de quelques minutes.',
          },
    );
  }

  if (status.kind === 'sent') {
    return (
      <div className="rounded-2xl border border-success/40 bg-success/10 p-5 text-sm text-success">
        <p className="font-medium">Vérifiez votre boîte mail</p>
        <p className="mt-2 leading-relaxed">{status.message}</p>
        <button
          type="button"
          className="mt-3 text-xs underline underline-offset-2"
          onClick={() => setStatus({ kind: 'idle', message: '' })}
        >
          Utiliser une autre adresse
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Adresse e-mail">
        <TextInput
          type="email"
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
          inputMode="email"
          placeholder="vous@exemple.fr"
        />
      </Field>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full"
        disabled={status.kind === 'sending' || email.trim() === ''}
      >
        {status.kind === 'sending' ? 'Envoi…' : 'Recevoir mon lien de connexion'}
      </Button>

      {status.kind === 'error' ? (
        <p role="alert" className="text-sm text-danger">
          {status.message}
        </p>
      ) : null}
    </form>
  );
}
