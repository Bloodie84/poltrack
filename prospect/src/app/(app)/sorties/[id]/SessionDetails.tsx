'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Select, TextInput } from '@/components/ui/Field';
import { deleteSession, updateSessionDetails } from '@/lib/session/actions';
import type { SessionOverviewRow, DetectorRow } from '@/lib/supabase/types';

export type SessionDetailsProps = {
  session: SessionOverviewRow;
  detectors: DetectorRow[];
};

/** Édition du titre, des notes et du matériel d'une sortie. */
export function SessionDetails({ session, detectors }: SessionDetailsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; message: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = (formData: FormData) => {
    startTransition(async () => {
      const result = await updateSessionDetails({
        sessionId: session.id,
        title: (formData.get('title') as string)?.trim() || null,
        notes: (formData.get('notes') as string)?.trim() || null,
        detectorId: (formData.get('detector_id') as string) || null,
      });

      setFeedback(
        result.ok
          ? { tone: 'ok', message: 'Sortie enregistrée.' }
          : { tone: 'error', message: result.message },
      );
      if (result.ok) router.refresh();
    });
  };

  const remove = () => {
    startTransition(async () => {
      const result = await deleteSession(session.id);
      if (result.ok) router.push('/sorties');
      else setFeedback({ tone: 'error', message: result.message });
    });
  };

  return (
    <Card title="Informations">
      <form action={save} className="space-y-4">
        <Field label="Titre" hint="Par exemple le nom de la parcelle.">
          <TextInput name="title" defaultValue={session.title ?? ''} maxLength={120} />
        </Field>

        <Field label="Notes" hint="Conditions, observations, points à revoir.">
          <TextInput name="notes" defaultValue={session.notes ?? ''} maxLength={4000} />
        </Field>

        <Field label="Détecteur utilisé">
          <Select name="detector_id" defaultValue={session.detector_id ?? ''}>
            <option value="">Aucun</option>
            {detectors.map((detector) => (
              <option key={detector.id} value={detector.id}>
                {detector.brand} {detector.model}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
          {feedback ? (
            <p
              role="status"
              className={`text-sm ${feedback.tone === 'error' ? 'text-danger' : 'text-success'}`}
            >
              {feedback.message}
            </p>
          ) : null}
        </div>
      </form>

      <div className="mt-5 border-t border-line pt-5">
        {confirmDelete ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-ink-1">
              Retirer cette sortie de vos listes ? Les points GPS sont conservés en base.
            </p>
            <Button variant="danger" size="sm" onClick={remove} disabled={pending}>
              Confirmer
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              Annuler
            </Button>
          </div>
        ) : (
          <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
            Supprimer cette sortie
          </Button>
        )}
      </div>
    </Card>
  );
}
