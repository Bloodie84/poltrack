'use client';

import { useEffect, useState } from 'react';

/**
 * Empêche l'écran de s'éteindre pendant une sortie.
 *
 * `Screen Wake Lock` n'est pas disponible partout : l'état renvoyé permet à
 * l'interface de dire ce qu'il en est, au lieu de laisser croire que l'écran
 * restera allumé.
 */
export type WakeLockState = {
  supported: boolean;
  active: boolean;
};

export function useWakeLock(enabled: boolean): WakeLockState {
  // Composant client uniquement : la capacité se lit directement au rendu.
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!enabled || !supported) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          await sentinel.release();
          return;
        }
        setActive(true);
        sentinel.addEventListener('release', () => setActive(false));
      } catch {
        // Refus du navigateur (onglet en arrière-plan, batterie faible…).
        setActive(false);
      }
    };

    // Le verrou est perdu dès que l'onglet passe en arrière-plan : il faut le
    // reprendre au retour, sinon l'écran s'éteint au milieu d'une sortie.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release().catch(() => undefined);
      setActive(false);
    };
  }, [enabled, supported]);

  return { supported, active };
}
