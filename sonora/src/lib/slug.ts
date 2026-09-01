export function slugify(input: string): string {
  const base = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return base || 'track';
}

/** `midnight-drive-9f3a1c7d2b6e` -> `9f3a1c7d2b6e` */
export function shortIdFromParam(param: string): string | null {
  const decoded = decodeURIComponent(param);
  const match = decoded.match(/([0-9a-f]{12})$/i);
  return match ? match[1].toLowerCase() : null;
}
