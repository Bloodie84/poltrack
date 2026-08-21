/** Concatène des classes conditionnelles sans dépendance externe. */
export function cn(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}
