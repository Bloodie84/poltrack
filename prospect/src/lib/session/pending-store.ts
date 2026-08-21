import type { PendingPoint } from './types';

/**
 * Tampon local des points GPS pas encore confirmés par le serveur.
 *
 * Un point n'est retiré du tampon qu'une fois le serveur l'ayant accepté. Il
 * survit donc à une coupure réseau, à un rechargement de page et à la fermeture
 * de l'onglet — les points GPS d'une sortie ne peuvent pas être reperdus.
 *
 * Ce n'est PAS le mode hors ligne complet (découvertes, photos, file de
 * synchronisation) : celui-ci arrive en phase 5 et reposera sur IndexedDB.
 */

const PREFIX = 'prospect:pending-points:';

/** Sous-ensemble de l'API Storage réellement utilisé, pour pouvoir la simuler. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type FlushResult = {
  /** Le tampon a-t-il pu être écrit sur le disque du navigateur ? */
  persisted: boolean;
  points: PendingPoint[];
};

function keyFor(sessionId: string): string {
  return `${PREFIX}${sessionId}`;
}

// ---------------------------------------------------------------------------
// Abonnement : le tampon est un magasin externe à React (localStorage). Il est
// exposé via `useSyncExternalStore`, ce qui évite tout effet de synchronisation.
// ---------------------------------------------------------------------------

const listeners = new Set<() => void>();

export function subscribePending(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

const EMPTY: PendingPoint[] = [];
let snapshotRaw: string | null = null;
let snapshotKey = '';
let snapshotValue: PendingPoint[] = EMPTY;

/**
 * Instantané stable du tampon : renvoie la MÊME référence tant que le contenu
 * stocké n'a pas changé, condition nécessaire à `useSyncExternalStore`.
 */
export function pendingSnapshot(
  sessionId: string,
  storage = browserStorage(),
): PendingPoint[] {
  if (!storage) return EMPTY;

  let raw: string | null = null;
  try {
    raw = storage.getItem(keyFor(sessionId));
  } catch {
    return EMPTY;
  }

  if (sessionId === snapshotKey && raw === snapshotRaw) return snapshotValue;

  snapshotKey = sessionId;
  snapshotRaw = raw;
  snapshotValue = raw ? readPending(sessionId, storage) : EMPTY;
  return snapshotValue;
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    // Navigation privée ou stockage bloqué : l'application continue en mémoire.
    return null;
  }
}

export function readPending(sessionId: string, storage = browserStorage()): PendingPoint[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(keyFor(sessionId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingPoint[]) : [];
  } catch {
    // Contenu illisible : on ne fait pas planter une sortie en cours pour ça.
    return [];
  }
}

function write(
  sessionId: string,
  points: PendingPoint[],
  storage: StorageLike | null,
): boolean {
  if (!storage) return false;
  try {
    if (points.length === 0) storage.removeItem(keyFor(sessionId));
    else storage.setItem(keyFor(sessionId), JSON.stringify(points));
    return true;
  } catch {
    // Quota dépassé : l'appelant en informe l'utilisateur plutôt que de
    // laisser croire que tout est sauvegardé.
    return false;
  }
}

/** Ajoute des points au tampon, en ignorant les identifiants déjà présents. */
export function appendPending(
  sessionId: string,
  incoming: PendingPoint[],
  storage = browserStorage(),
): FlushResult {
  const existing = readPending(sessionId, storage);
  const known = new Set(existing.map((point) => point.id));
  const merged = [...existing];

  for (const point of incoming) {
    if (!known.has(point.id)) {
      known.add(point.id);
      merged.push(point);
    }
  }

  const persisted = write(sessionId, merged, storage);
  notify();
  return { persisted, points: merged };
}

/** Retire les points confirmés par le serveur. */
export function acknowledgePending(
  sessionId: string,
  acknowledgedIds: readonly string[],
  storage = browserStorage(),
): FlushResult {
  const acknowledged = new Set(acknowledgedIds);
  const remaining = readPending(sessionId, storage).filter(
    (point) => !acknowledged.has(point.id),
  );
  const persisted = write(sessionId, remaining, storage);
  notify();
  return { persisted, points: remaining };
}

export function clearPending(sessionId: string, storage = browserStorage()): void {
  write(sessionId, [], storage);
  notify();
}

export function pendingCount(sessionId: string, storage = browserStorage()): number {
  return readPending(sessionId, storage).length;
}
