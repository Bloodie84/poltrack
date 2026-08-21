'use client';

import { useEffect, useRef, useState } from 'react';
import { GeoJSONSource, Map as MapLibreMap, ScaleControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { EMPTY_FEATURES, type PositionFeatures } from '@/lib/geo/position-feature';
import { EMPTY_TRACK, type TrackFeatures } from '@/lib/geo/track-feature';
import { resolveBasemap, type BasemapId } from './basemaps';
import type { FeatureCollection } from 'geojson';
import type { BBox } from '@/lib/geo/types';

export const POSITION_SOURCE_ID = 'current-position';
export const LIVE_TRACK_SOURCE_ID = 'live-track';
export const HISTORY_SOURCE_ID = 'past-tracks';
export const MARKERS_SOURCE_ID = 'markers';

/** Données vectorielles poussées dans la carte. */
export type MapLayerData = {
  position: PositionFeatures;
  liveTrack: TrackFeatures;
  history: FeatureCollection;
  /** Points nommés : départ, point de retour… (découvertes en phase 3). */
  markers: FeatureCollection;
};

const EMPTY_HISTORY: FeatureCollection = { type: 'FeatureCollection', features: [] };

export const EMPTY_LAYER_DATA: MapLayerData = {
  position: EMPTY_FEATURES,
  liveTrack: EMPTY_TRACK,
  history: EMPTY_HISTORY,
  markers: EMPTY_HISTORY,
};

/**
 * MapLibre déduit l'URL de son worker de `import.meta.url`. Après empaquetage,
 * cette URL désigne un chunk du bundle et le fichier du worker n'existe plus à
 * côté : le worker ne démarre pas et aucune source GeoJSON n'est chargée — le
 * marqueur de position resterait invisible, sans la moindre erreur.
 *
 * Le worker est donc servi depuis `public/maplibre/` (voir
 * `scripts/copy-maplibre-worker.mjs`, exécuté avant chaque build).
 */
export const MAPLIBRE_WORKER_URL = '/maplibre/maplibre-gl-worker.mjs';
setWorkerUrl(MAPLIBRE_WORKER_URL);

/**
 * (Ré)installe la source et les couches de position.
 * Appelée au chargement puis après chaque changement de style, `setStyle`
 * repartant d'un style vierge sans les sources personnalisées.
 */
function installLayers(map: MapLibreMap, data: MapLayerData): void {
  // `styledata` peut être émis avant que le style soit exploitable : y ajouter
  // une couche lèverait une exception qui interromprait la séquence de
  // chargement de MapLibre (et donc l'événement `load`).
  if (!map.isStyleLoaded() || map.getSource(POSITION_SOURCE_ID)) return;

  // Ordre d'empilement : passages anciens, puis trace en cours, puis position.
  map.addSource(HISTORY_SOURCE_ID, { type: 'geojson', data: data.history });
  map.addLayer({
    id: 'past-tracks-line',
    type: 'line',
    source: HISTORY_SOURCE_ID,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#a78bfa', 'line-width': 2.5, 'line-opacity': 0.55 },
  });

  map.addSource(LIVE_TRACK_SOURCE_ID, { type: 'geojson', data: data.liveTrack });
  map.addLayer({
    id: 'live-track-line',
    type: 'line',
    source: LIVE_TRACK_SOURCE_ID,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#34d399', 'line-width': 4, 'line-opacity': 0.9 },
  });

  map.addSource(MARKERS_SOURCE_ID, { type: 'geojson', data: data.markers });
  map.addLayer({
    id: 'markers-dot',
    type: 'circle',
    source: MARKERS_SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': 7,
      'circle-color': [
        'match',
        ['get', 'kind'],
        'start',
        '#34d399',
        'vehicle',
        '#f59e0b',
        '#38bdf8',
      ],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#0b1220',
    },
  });

  map.addSource(POSITION_SOURCE_ID, { type: 'geojson', data: data.position });

  map.addLayer({
    id: 'position-accuracy-fill',
    type: 'fill',
    source: POSITION_SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': '#38bdf8', 'fill-opacity': 0.12 },
  });

  map.addLayer({
    id: 'position-accuracy-outline',
    type: 'line',
    source: POSITION_SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'line-color': '#38bdf8', 'line-width': 1, 'line-opacity': 0.5 },
  });

  map.addLayer({
    id: 'position-halo',
    type: 'circle',
    source: POSITION_SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-radius': 11, 'circle-color': '#0ea5e9', 'circle-opacity': 0.25 },
  });

  map.addLayer({
    id: 'position-dot',
    type: 'circle',
    source: POSITION_SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': 6,
      'circle-color': '#38bdf8',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#0b1220',
    },
  });
}

/**
 * MapLibre exige WebGL. La détection est faite au premier rendu (côté client
 * uniquement, ce composant étant chargé sans SSR) afin d'afficher un message
 * clair plutôt qu'une carte vide.
 */
function detectWebGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export type MapCanvasProps = {
  basemapId: BasemapId;
  /** Données vectorielles à afficher : position, trace en cours, historique. */
  layerData: MapLayerData;
  initialCenter: [number, number];
  initialZoom: number;
  /** Appelé une fois la carte prête ; permet au parent de piloter la caméra. */
  onReady: (map: MapLibreMap) => void;
  /** Déclenché quand l'utilisateur déplace la carte lui-même. */
  onUserInteraction?: () => void;
  /** Déclenché à la fin de chaque déplacement, avec l'emprise visible. */
  onViewportChange?: (bounds: BBox) => void;
};

/**
 * Conteneur MapLibre. Ne gère que le cycle de vie de la carte et les couches de
 * position ; toute la logique GPS vit dans le composant parent.
 */
export function MapCanvas({
  basemapId,
  layerData,
  initialCenter,
  initialZoom,
  onReady,
  onUserInteraction,
  onViewportChange,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [webglSupported] = useState(detectWebGl);

  // Les callbacks sont lus via une ref : la carte ne doit jamais être recréée
  // parce qu'une fonction parente a changé d'identité entre deux rendus.
  const onReadyRef = useRef(onReady);
  const onUserInteractionRef = useRef(onUserInteraction);
  const onViewportChangeRef = useRef(onViewportChange);
  const initialViewRef = useRef({ center: initialCenter, zoom: initialZoom });
  // Dernières données connues : servent aussi de contenu initial lorsque les
  // sources sont recréées après un changement de style.
  const dataRef = useRef<MapLayerData>(layerData);
  // Style déjà appliqué : évite un `setStyle` inutile au montage, qui
  // provoquerait une reconstruction complète avant la fin du chargement.
  const appliedBasemapRef = useRef(basemapId);

  useEffect(() => {
    onReadyRef.current = onReady;
    onUserInteractionRef.current = onUserInteraction;
    onViewportChangeRef.current = onViewportChange;
  });

  useEffect(() => {
    dataRef.current = layerData;
    const map = mapRef.current;
    if (!map) return;

    map.getSource<GeoJSONSource>(POSITION_SOURCE_ID)?.setData(layerData.position);
    map.getSource<GeoJSONSource>(LIVE_TRACK_SOURCE_ID)?.setData(layerData.liveTrack);
    map.getSource<GeoJSONSource>(HISTORY_SOURCE_ID)?.setData(layerData.history);
    map.getSource<GeoJSONSource>(MARKERS_SOURCE_ID)?.setData(layerData.markers);
  }, [layerData]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current || !webglSupported) return;

    // Une erreur du constructeur remonte à la frontière d'erreur de la route
    // (`carte/error.tsx`) plutôt que d'être avalée silencieusement.
    const map = new MapLibreMap({
      container,
      style: resolveBasemap(basemapId).style,
      center: initialViewRef.current.center,
      zoom: initialViewRef.current.zoom,
      maxZoom: 19,
      attributionControl: { compact: true },
      // Le cap est indiqué par la flèche du marqueur : garder le nord en haut
      // évite de désorienter pendant une sortie.
      pitchWithRotate: false,
      dragRotate: false,
    });

    mapRef.current = map;
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');

    const install = () => installLayers(map, dataRef.current);
    map.on('load', () => {
      install();
      onReadyRef.current(map);
    });
    // `setStyle` repart d'un style vierge : la source doit être réinstallée.
    map.on('styledata', install);
    map.on('idle', install);

    map.on('error', (event) => {
      // Une tuile manquante ne doit pas interrompre une sortie : on journalise
      // sans casser la carte.
      console.warn('[carte]', event.error?.message ?? event);
    });

    // `originalEvent` n'est présent que si le déplacement vient d'un geste de
    // l'utilisateur. Sans ce filtre, nos propres `easeTo` couperaient le suivi.
    const notifyInteraction = (event: { originalEvent?: unknown }) => {
      if (event.originalEvent) onUserInteractionRef.current?.();
    };
    map.on('dragstart', notifyInteraction);
    map.on('zoomstart', notifyInteraction);
    map.on('rotatestart', notifyInteraction);

    map.on('moveend', () => {
      const bounds = map.getBounds();
      onViewportChangeRef.current?.([
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ]);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Monté une seule fois : le changement de fond passe par l'effet suivant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || appliedBasemapRef.current === basemapId) return;
    appliedBasemapRef.current = basemapId;
    map.setStyle(resolveBasemap(basemapId).style, { diff: true });
  }, [basemapId]);

  if (!webglSupported) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-0 p-6 text-center text-sm text-ink-1">
        Ce navigateur n’expose pas WebGL : la carte ne peut pas s’afficher. Vérifiez
        l’accélération matérielle ou essayez un autre navigateur.
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full" />;
}
