'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { flushSessionPoints } from '@/lib/session/actions';
import {
  acknowledgePending,
  appendPending,
  clearPending,
  pendingSnapshot,
  readPending,
  subscribePending,
} from '@/lib/session/pending-store';
import { toPendingPoint, type PendingPoint, type SessionSummary } from '@/lib/session/types';
import { decideSampling, isReliableFix, type SamplingSettings } from '@/lib/geo/sampling';
import { MAX_POINTS_PER_BATCH } from '@/lib/validation/session';
import type { GpsFix, LatLng } from '@/lib/geo/types';

/** Intervalle d'envoi des points au serveur. */
const FLUSH_INTERVAL_MS = 15_000;

/** Au-delà de ce nombre de points en attente, l'envoi part sans attendre. */
const FLUSH_THRESHOLD = 20;

const NO_POINTS: PendingPoint[] = [];

export type SessionRecorder = {
  /** Points enregistrés mais pas encore confirmés par le serveur. */
  pendingCount: number;
  /** Faux si le navigateur refuse d'écrire le tampon (quota, navigation privée). */
  persisted: boolean;
  /** Points retenus depuis l'ouverture de la page, pour tracer le trajet en direct. */
  recorded: LatLng[];
  lastError: string | null;
  syncing: boolean;
  /** À brancher sur `useGeolocation` : appelé à chaque fix reçu. */
  handleFix: (fix: GpsFix) => void;
  /** Force un envoi immédiat, par exemple avant de terminer la sortie. */
  flushNow: () => Promise<void>;
  /** Oublie le tampon local d'une sortie terminée. */
  reset: (sessionId: string) => void;
};

/**
 * Enregistre les points GPS d'une sortie en cours.
 *
 * Chaque point retenu est d'abord écrit dans le tampon local, puis envoyé au
 * serveur ; il n'en est retiré qu'une fois accepté. Une coupure réseau ou un
 * rechargement de page ne perd donc aucun point.
 */
export function useSessionRecorder(options: {
  session: SessionSummary | null;
  settings: SamplingSettings;
  onSessionUpdate: (session: SessionSummary) => void;
}): SessionRecorder {
  const { session, settings, onSessionUpdate } = options;
  const sessionId = session?.id ?? null;
  const sessionStatus = session?.status ?? null;

  // Le tampon vit dans localStorage : c'est un magasin externe à React, lu ici
  // sans effet de synchronisation.
  const pending = useSyncExternalStore(
    subscribePending,
    () => (sessionId ? pendingSnapshot(sessionId) : NO_POINTS),
    () => NO_POINTS,
  );

  const [recorded, setRecorded] = useState<LatLng[]>([]);
  const [persisted, setPersisted] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const lastKeptRef = useRef<GpsFix | null>(null);
  const inFlightRef = useRef(false);
  const sessionRef = useRef(session);
  const settingsRef = useRef(settings);
  const onUpdateRef = useRef(onSessionUpdate);

  useEffect(() => {
    sessionRef.current = session;
    settingsRef.current = settings;
    onUpdateRef.current = onSessionUpdate;
  });

  const flush = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || inFlightRef.current) return;

    const queue = readPending(current.id);
    if (queue.length === 0) return;

    inFlightRef.current = true;
    setSyncing(true);

    const batch = queue.slice(0, MAX_POINTS_PER_BATCH);

    try {
      const result = await flushSessionPoints(current.id, batch);

      if (result.ok) {
        // Le serveur a accepté le lot : il peut quitter le tampon. Un lot
        // rejoué après coupure est acquitté de la même façon, sans doublon.
        const remaining = acknowledgePending(
          current.id,
          batch.map((point) => point.id),
        );
        if (result.session) onUpdateRef.current(result.session);
        setPersisted(remaining.persisted);
        setLastError(null);
      } else {
        // Les points restent dans le tampon : rien n'est perdu.
        setLastError(result.message);
      }
    } catch {
      setLastError('Réseau indisponible : les points sont conservés sur l’appareil.');
    } finally {
      inFlightRef.current = false;
      setSyncing(false);
    }
  }, []);

  const handleFix = useCallback(
    (fix: GpsFix) => {
      const current = sessionRef.current;
      if (!current || current.status !== 'active') return;

      const decision = decideSampling(fix, lastKeptRef.current, settingsRef.current);
      if (!decision.keep) return;

      lastKeptRef.current = fix;

      const point = toPendingPoint(
        fix,
        isReliableFix(fix, settingsRef.current),
        crypto.randomUUID(),
      );

      const stored = appendPending(current.id, [point]);
      setPersisted(stored.persisted);
      setRecorded((previous) => [...previous, { lat: point.lat, lon: point.lon }]);

      if (stored.points.length >= FLUSH_THRESHOLD) void flush();
    },
    [flush],
  );

  // Une pause coupe l'enregistrement : le point suivant repart de zéro pour ne
  // pas relier deux positions séparées par une interruption.
  useEffect(() => {
    if (sessionStatus !== 'active') lastKeptRef.current = null;
  }, [sessionStatus]);

  // Envoi périodique, et reprise du tampon laissé par un chargement précédent.
  // Les dépendances se limitent à l'identité de la sortie : sans cela, chaque
  // mise à jour de la distance relancerait le minuteur.
  useEffect(() => {
    if (!sessionId || sessionStatus === 'finished') return;
    void flush();
    const timer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [sessionId, sessionStatus, flush]);

  const reset = useCallback((id: string) => {
    clearPending(id);
    lastKeptRef.current = null;
    setRecorded([]);
    setPersisted(true);
    setLastError(null);
  }, []);

  return {
    pendingCount: pending.length,
    persisted,
    recorded,
    lastError,
    syncing,
    handleFix,
    flushNow: flush,
    reset,
  };
}
