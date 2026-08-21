/**
 * Qualification de l'incertitude GPS.
 *
 * Le GPS d'un smartphone est métrique, jamais centimétrique : ces seuils
 * servent à afficher honnêtement la marge d'erreur plutôt qu'à la masquer.
 */
export type AccuracyLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'unusable';

export type AccuracyGrade = {
  level: AccuracyLevel;
  label: string;
  /** Classe de couleur Tailwind associée. */
  tone: string;
};

const GRADES: { maxM: number; grade: AccuracyGrade }[] = [
  { maxM: 5, grade: { level: 'excellent', label: 'Excellente', tone: 'text-emerald-400' } },
  { maxM: 10, grade: { level: 'good', label: 'Bonne', tone: 'text-lime-400' } },
  { maxM: 20, grade: { level: 'fair', label: 'Moyenne', tone: 'text-amber-400' } },
  { maxM: 50, grade: { level: 'poor', label: 'Faible', tone: 'text-orange-400' } },
];

const UNUSABLE: AccuracyGrade = {
  level: 'unusable',
  label: 'Inexploitable',
  tone: 'text-red-400',
};

export function gradeAccuracy(accuracyM: number): AccuracyGrade {
  if (!Number.isFinite(accuracyM) || accuracyM < 0) return UNUSABLE;
  for (const { maxM, grade } of GRADES) {
    if (accuracyM <= maxM) return grade;
  }
  return UNUSABLE;
}

/**
 * Un fix est retenu pour la trace si son incertitude reste sous le seuil
 * configuré par l'utilisateur (`user_settings.gps_max_accuracy_m`).
 */
export function isUsableForTrack(accuracyM: number, maxAccuracyM: number): boolean {
  return Number.isFinite(accuracyM) && accuracyM > 0 && accuracyM <= maxAccuracyM;
}
