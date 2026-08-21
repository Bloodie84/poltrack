import { z } from 'zod';

/** Résultat uniforme d'une Server Action de formulaire. */
export type ActionState = {
  status: 'idle' | 'success' | 'error';
  message: string;
  /** Erreurs par champ, pour l'affichage inline. */
  fieldErrors?: Record<string, string>;
};

export const IDLE: ActionState = { status: 'idle', message: '' };

export function ok(message: string): ActionState {
  return { status: 'success', message };
}

export function fail(message: string, fieldErrors?: Record<string, string>): ActionState {
  return { status: 'error', message, fieldErrors };
}

/** Aplatit une erreur Zod en une map champ → premier message. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    result[key] ??= issue.message;
  }
  return result;
}

/** Lit un nombre optionnel depuis un FormData (chaîne vide => null). */
export function numberField(value: FormDataEntryValue | null): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(',', '.');
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/** Lit une chaîne depuis un FormData. */
export function textField(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : '';
}
