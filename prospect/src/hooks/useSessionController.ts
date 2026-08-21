'use client';

import { useCallback, useState, useTransition } from 'react';
import {
  finishSession,
  pauseSession,
  resumeSession,
  setVehiclePoint,
  startSession,
} from '@/lib/session/actions';
import type { SessionSummary } from '@/lib/session/types';
import type { LatLng } from '@/lib/geo/types';

export type SessionController = {
  session: SessionSummary | null;
  /** Dernière sortie terminée, pour afficher son récapitulatif. */
  justFinished: SessionSummary | null;
  busy: boolean;
  error: string | null;
  setSession: (session: SessionSummary) => void;
  start: (options: { position: LatLng | null; saveVehicle: boolean; title: string | null }) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  finish: (beforeFinish?: () => Promise<void>) => Promise<void>;
  saveVehicle: (position: LatLng | null, label: string | null) => Promise<void>;
  dismissSummary: () => void;
};

/** Pilote le cycle de vie d'une sortie depuis l'interface de terrain. */
export function useSessionController(initial: SessionSummary | null): SessionController {
  const [session, setSessionState] = useState<SessionSummary | null>(initial);
  const [justFinished, setJustFinished] = useState<SessionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const run = useCallback(
    (action: () => Promise<void>) =>
      new Promise<void>((resolve) => {
        startTransition(async () => {
          await action();
          resolve();
        });
      }),
    [],
  );

  const setSession = useCallback((next: SessionSummary) => {
    // Une réponse tardive ne doit pas ressusciter une sortie déjà terminée.
    setSessionState((current) => (current && current.id !== next.id ? current : next));
  }, []);

  const start = useCallback<SessionController['start']>(
    (options) =>
      run(async () => {
        setError(null);
        const result = await startSession({
          lat: options.position?.lat ?? null,
          lon: options.position?.lon ?? null,
          title: options.title,
          saveVehicle: options.saveVehicle,
          detectorId: null,
        });

        if (!result.ok) {
          setError(result.message);
          return;
        }
        setJustFinished(null);
        setSessionState(result.session);
      }),
    [run],
  );

  const transition = useCallback(
    (action: (id: string) => Promise<{ ok: boolean; session?: SessionSummary | null; message?: string }>) =>
      run(async () => {
        if (!session) return;
        setError(null);
        const result = await action(session.id);
        if (!result.ok) {
          setError(result.message ?? 'Action impossible.');
          return;
        }
        if (result.session) setSessionState(result.session);
      }),
    [run, session],
  );

  const pause = useCallback(() => transition(pauseSession), [transition]);
  const resume = useCallback(() => transition(resumeSession), [transition]);

  const finish = useCallback<SessionController['finish']>(
    (beforeFinish) =>
      run(async () => {
        if (!session) return;
        setError(null);

        // Les points encore en attente partent AVANT la clôture : la trace
        // finale doit contenir la fin du parcours.
        if (beforeFinish) await beforeFinish();

        const result = await finishSession(session.id);
        if (!result.ok) {
          setError(result.message);
          return;
        }

        setJustFinished(result.session);
        setSessionState(null);
      }),
    [run, session],
  );

  const saveVehicle = useCallback<SessionController['saveVehicle']>(
    (position, label) =>
      transition(async (id) =>
        setVehiclePoint({
          sessionId: id,
          lat: position?.lat ?? null,
          lon: position?.lon ?? null,
          label,
        }),
      ),
    [transition],
  );

  const dismissSummary = useCallback(() => setJustFinished(null), []);

  return {
    session,
    justFinished,
    busy,
    error,
    setSession,
    start,
    pause,
    resume,
    finish,
    saveVehicle,
    dismissSummary,
  };
}
