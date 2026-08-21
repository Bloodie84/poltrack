import type { StyleSpecification } from 'maplibre-gl';

/**
 * Registre des fonds de carte.
 *
 * Un seul fond est disponible en phase 1 : OpenStreetMap, libre et sans clé.
 * Les couches IGN / Géoplateforme (plan, orthophoto, cadastre, LiDAR HD) seront
 * ajoutées ici en phase 8, en lisant le GetCapabilities du service plutôt qu'en
 * codant les URLs en dur.
 */
export type BasemapId = 'osm';

export type Basemap = {
  id: BasemapId;
  label: string;
  /** Ce que l'utilisateur doit savoir avant de l'utiliser intensivement. */
  notice: string;
  style: StyleSpecification;
};

const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    },
  },
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
      // Léger assombrissement pour que les données personnelles ressortent sur
      // le thème sombre, sans rendre le fond illisible.
      paint: { 'raster-brightness-max': 0.92, 'raster-saturation': -0.15 },
    },
  ],
};

export const BASEMAPS: Record<BasemapId, Basemap> = {
  osm: {
    id: 'osm',
    label: 'OpenStreetMap',
    notice:
      "Tuiles servies par la fondation OpenStreetMap, soumises à sa politique d'usage raisonnable.",
    style: OSM_STYLE,
  },
};

export const DEFAULT_BASEMAP: BasemapId = 'osm';

export function resolveBasemap(id: string | null | undefined): Basemap {
  return id && id in BASEMAPS ? BASEMAPS[id as BasemapId] : BASEMAPS[DEFAULT_BASEMAP];
}
