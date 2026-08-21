'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  createDetector,
  deleteDetector,
  setDefaultDetector,
  updateDetector,
} from './actions';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, TextInput, Toggle } from '@/components/ui/Field';
import { IDLE, type ActionState } from '@/lib/forms';
import type { DetectorRow } from '@/lib/supabase/types';

function SubmitButton({
  children,
  variant = 'primary',
}: {
  children: string;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size="sm" disabled={pending}>
      {pending ? '…' : children}
    </Button>
  );
}

function Feedback({ state }: { state: ActionState }) {
  if (state.status === 'idle') return null;
  return (
    <p
      role="status"
      className={`text-sm ${state.status === 'error' ? 'text-danger' : 'text-success'}`}
    >
      {state.message}
    </p>
  );
}

/** Champs partagés par la création et la modification. */
function DetectorFields({
  detector,
  errors,
}: {
  detector?: DetectorRow;
  errors?: Record<string, string>;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Marque" error={errors?.brand}>
          <TextInput name="brand" defaultValue={detector?.brand ?? ''} required maxLength={60} />
        </Field>
        <Field label="Modèle" error={errors?.model}>
          <TextInput name="model" defaultValue={detector?.model ?? ''} required maxLength={60} />
        </Field>
        <Field label="Disque" error={errors?.coil}>
          <TextInput
            name="coil"
            defaultValue={detector?.coil ?? ''}
            maxLength={60}
            placeholder="ex. 28 cm elliptique"
          />
        </Field>
        <Field label="Fréquence (kHz)" error={errors?.frequency_khz}>
          <TextInput
            name="frequency_khz"
            type="number"
            step="0.1"
            min="0"
            defaultValue={detector?.frequency_khz ?? ''}
          />
        </Field>
      </div>

      <Field label="Notes" error={errors?.notes}>
        <TextInput name="notes" defaultValue={detector?.notes ?? ''} maxLength={2000} />
      </Field>

      <Toggle
        name="is_default"
        label="Détecteur par défaut"
        defaultChecked={detector?.is_default ?? false}
      />
    </>
  );
}

function DetectorCard({ detector }: { detector: DetectorRow }) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction] = useActionState(updateDetector, IDLE);
  const [defaultState, defaultAction] = useActionState(setDefaultDetector, IDLE);
  const [deleteState, deleteAction] = useActionState(deleteDetector, IDLE);

  return (
    <li className="rounded-2xl border border-line bg-surface-1/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink-0">
            {detector.brand} {detector.model}
            {detector.is_default ? (
              <span className="ml-2 rounded-full border border-accent/40 px-2 py-0.5 text-[11px] text-accent">
                par défaut
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-ink-2">
            {[
              detector.coil,
              detector.frequency_khz != null ? `${detector.frequency_khz} kHz` : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'Aucun détail'}
          </p>
          {detector.notes ? (
            <p className="mt-2 text-sm text-ink-1">{detector.notes}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!detector.is_default ? (
            <form action={defaultAction}>
              <input type="hidden" name="id" value={detector.id} />
              <SubmitButton variant="secondary">Par défaut</SubmitButton>
            </form>
          ) : null}

          <Button size="sm" variant="secondary" onClick={() => setEditing((value) => !value)}>
            {editing ? 'Annuler' : 'Modifier'}
          </Button>

          <form action={deleteAction}>
            <input type="hidden" name="id" value={detector.id} />
            <SubmitButton variant="danger">Retirer</SubmitButton>
          </form>
        </div>
      </div>

      <Feedback state={defaultState} />
      <Feedback state={deleteState} />

      {editing ? (
        <form action={updateAction} className="mt-4 space-y-4 border-t border-line pt-4">
          <input type="hidden" name="id" value={detector.id} />
          <DetectorFields detector={detector} errors={updateState.fieldErrors} />
          <div className="flex items-center gap-3">
            <SubmitButton>Enregistrer</SubmitButton>
            <Feedback state={updateState} />
          </div>
        </form>
      ) : null}
    </li>
  );
}

export function DetectorManager({ detectors }: { detectors: DetectorRow[] }) {
  const [createState, createAction] = useActionState(createDetector, IDLE);

  return (
    <div className="space-y-5">
      {detectors.length > 0 ? (
        <ul className="space-y-3">
          {detectors.map((detector) => (
            <DetectorCard key={detector.id} detector={detector} />
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-2">
          Aucun détecteur enregistré.
        </p>
      )}

      <Card title="Ajouter un détecteur">
        <form action={createAction} className="space-y-4">
          <DetectorFields errors={createState.fieldErrors} />
          <div className="flex items-center gap-3">
            <SubmitButton>Ajouter</SubmitButton>
            <Feedback state={createState} />
          </div>
        </form>
      </Card>
    </div>
  );
}
