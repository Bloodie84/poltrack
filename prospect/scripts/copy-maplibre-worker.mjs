#!/usr/bin/env node
/**
 * Copie le worker de MapLibre dans `public/maplibre/`.
 *
 * MapLibre déduit l'URL de son worker de `import.meta.url`. Une fois le paquet
 * empaqueté par le bundler, cette URL pointe vers un chunk et le fichier
 * `maplibre-gl-worker.mjs` n'existe plus à côté : le worker ne démarre pas et
 * AUCUNE source GeoJSON n'est chargée (marqueur de position, traces, zones…).
 *
 * On sert donc le worker tel quel depuis `public/`, et l'application appelle
 * `setWorkerUrl()` avec ce chemin. Le worker importe `maplibre-gl-shared.mjs`
 * en relatif : les deux fichiers doivent rester côte à côte.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(dirname(require.resolve('maplibre-gl/package.json')), 'dist');
const target = join(root, 'public', 'maplibre');

const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

mkdirSync(target, { recursive: true });
for (const file of FILES) {
  copyFileSync(join(dist, file), join(target, file));
}

console.log(`  ✔ worker MapLibre copié dans public/maplibre/ (${FILES.join(', ')})`);
