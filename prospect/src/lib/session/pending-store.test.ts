import { beforeEach, describe, expect, it } from 'vitest';
import {
  acknowledgePending,
  appendPending,
  clearPending,
  pendingCount,
  readPending,
  type StorageLike,
} from './pending-store';
import type { PendingPoint } from './types';

/** Storage en mémoire, avec quota optionnel pour simuler un disque plein. */
function memoryStorage(options: { quota?: number } = {}): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      if (options.quota !== undefined && value.length > options.quota) {
        throw new DOMException('quota', 'QuotaExceededError');
      }
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

function point(id: string, lat = 48.85): PendingPoint {
  return {
    id,
    lat,
    lon: 2.35,
    recorded_at: '2026-08-20T10:00:00.000Z',
    accuracy_m: 6,
    altitude_m: null,
    altitude_accuracy_m: null,
    speed_ms: null,
    heading_deg: null,
    is_reliable: true,
  };
}

const SESSION = 'session-1';
let storage: StorageLike;

beforeEach(() => {
  storage = memoryStorage();
});

describe('tampon local des points GPS', () => {
  it('conserve les points ajoutés', () => {
    appendPending(SESSION, [point('a'), point('b')], storage);
    expect(readPending(SESSION, storage).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('ne duplique jamais un identifiant déjà présent', () => {
    appendPending(SESSION, [point('a')], storage);
    appendPending(SESSION, [point('a'), point('b')], storage);
    expect(readPending(SESSION, storage).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('ne retire que les points confirmés par le serveur', () => {
    appendPending(SESSION, [point('a'), point('b'), point('c')], storage);
    acknowledgePending(SESSION, ['a', 'c'], storage);
    expect(readPending(SESSION, storage).map((p) => p.id)).toEqual(['b']);
  });

  it('garde les points si le serveur n’en confirme aucun', () => {
    appendPending(SESSION, [point('a'), point('b')], storage);
    acknowledgePending(SESSION, [], storage);
    expect(pendingCount(SESSION, storage)).toBe(2);
  });

  it('isole les sorties les unes des autres', () => {
    appendPending(SESSION, [point('a')], storage);
    appendPending('session-2', [point('z')], storage);
    expect(readPending(SESSION, storage).map((p) => p.id)).toEqual(['a']);
    expect(readPending('session-2', storage).map((p) => p.id)).toEqual(['z']);
  });

  it('survit à un rechargement : la lecture repart du stockage', () => {
    appendPending(SESSION, [point('a'), point('b')], storage);
    // Simule un nouveau chargement de page : aucune mémoire partagée.
    expect(readPending(SESSION, storage)).toHaveLength(2);
  });

  it('signale un échec d’écriture au lieu de faire croire à une sauvegarde', () => {
    const tiny = memoryStorage({ quota: 10 });
    const result = appendPending(SESSION, [point('a')], tiny);
    expect(result.persisted).toBe(false);
    // Les points restent disponibles en mémoire pour l'envoi immédiat.
    expect(result.points.map((p) => p.id)).toEqual(['a']);
  });

  it('tolère un contenu corrompu sans interrompre la sortie', () => {
    storage.setItem('prospect:pending-points:session-1', '{ pas du json');
    expect(readPending(SESSION, storage)).toEqual([]);
  });

  it('se vide complètement', () => {
    appendPending(SESSION, [point('a')], storage);
    clearPending(SESSION, storage);
    expect(pendingCount(SESSION, storage)).toBe(0);
  });
});

describe('instantané pour React', () => {
  it('renvoie la même référence tant que rien ne change', async () => {
    const { pendingSnapshot } = await import('./pending-store');
    appendPending(SESSION, [point('a')], storage);
    const first = pendingSnapshot(SESSION, storage);
    const second = pendingSnapshot(SESSION, storage);
    expect(second).toBe(first);
  });

  it('renvoie une nouvelle référence après un ajout', async () => {
    const { pendingSnapshot } = await import('./pending-store');
    appendPending(SESSION, [point('a')], storage);
    const first = pendingSnapshot(SESSION, storage);
    appendPending(SESSION, [point('b')], storage);
    const second = pendingSnapshot(SESSION, storage);
    expect(second).not.toBe(first);
    expect(second).toHaveLength(2);
  });

  it('prévient les abonnés à chaque écriture', async () => {
    const { subscribePending } = await import('./pending-store');
    let calls = 0;
    const unsubscribe = subscribePending(() => {
      calls += 1;
    });

    appendPending(SESSION, [point('a')], storage);
    acknowledgePending(SESSION, ['a'], storage);
    unsubscribe();
    appendPending(SESSION, [point('b')], storage);

    expect(calls).toBe(2);
  });
});
