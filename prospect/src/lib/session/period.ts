/**
 * Périodes de filtrage de l'historique.
 *
 * Les bornes sont calculées dans le fuseau du navigateur — « aujourd'hui »
 * doit correspondre à la journée de l'utilisateur, pas à celle du serveur —
 * puis transmises au serveur en ISO 8601.
 */

export type PeriodId = 'today' | 'week' | 'month' | 'year' | 'all';

export const PERIODS: { id: PeriodId; label: string }[] = [
  { id: 'today', label: "Aujourd'hui" },
  { id: 'week', label: 'Semaine' },
  { id: 'month', label: 'Mois' },
  { id: 'year', label: 'Année' },
  { id: 'all', label: 'Tout' },
];

export type PeriodRange = { from: Date | null; to: Date | null };

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Bornes d'une période, la semaine commençant le lundi. */
export function periodRange(id: PeriodId, now: Date): PeriodRange {
  switch (id) {
    case 'today':
      return { from: startOfDay(now), to: null };
    case 'week': {
      const day = now.getDay();
      // getDay() renvoie 0 pour dimanche : on recule jusqu'au lundi précédent.
      const offset = (day + 6) % 7;
      const monday = startOfDay(now);
      monday.setDate(monday.getDate() - offset);
      return { from: monday, to: null };
    }
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: null };
    case 'year':
      return { from: new Date(now.getFullYear(), 0, 1), to: null };
    case 'all':
      return { from: null, to: null };
  }
}

export function isPeriodId(value: unknown): value is PeriodId {
  return PERIODS.some((period) => period.id === value);
}
