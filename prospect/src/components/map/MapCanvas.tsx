'use client';

import { useEffect, useRef, useState } from 'react';
import { GeoJSONSource, Map as MapLibreMap, ScaleControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { EMPTY_FEATURES, type PositionFeatures } from '@/lib/geo/position-feature';
import { resolveBasemap, type BasemapId } from './basemaps';

export const POSITION_SOURCE_ID = 'current-position';

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
function installPositionLayers(map: MapLibreMap, data: PositionFeatures): void {
  // `styledata` peut être émis avant que le style soit exploitable : y ajouter
  // une couche lèverait une exception qui interromprait la séquence de
  // chargement de MapLibre (et donc l'événement `load`).
  if (!map.isStyleLoaded() || map.getSource(POSITION_SOURCE_ID)) return;

  map.addSource(POSITION_SOURCE_ID, { type: 'geojson', data });

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
  /** Position courante à représenter, ou `null` tant qu'aucun fix n'est reçu. */
  positionFeatures: PositionFeatures | null;
  initialCenter: [number, number];
  initialZoom: number;
  /** Appelé une fois la carte prête ; permet au parent de piloter la caméra. */
  onReady: (map: MapLibreMap) => void;
  /** Déclenché quand l'utilisateur déplace la carte lui-même. */
  onUserInteraction?: () => void;
};

/**
 * Conteneur MapLibre. Ne gère que le cycle de vie de la carte et les couches de
 * position ; toute la logique GPS vit dans le composant parent.
 */
export function MapCanvas({
  basemapId,
  positionFeatures,
  initialCenter,
  initialZoom,
  onReady,
  onUserInteraction,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [webglSupported] = useState(detectWebGl);

  // Les callbacks sont lus via une ref : la carte ne doit jamais être recréée
  // parce qu'une fonction parente a changé d'identité entre deux rendus.
  const onReadyRef = useRef(onReady);
  const onUserInteractionRef = useRef(onUserInteraction);
  const initialViewRef = useRef({ center: initialCenter, zoom: initialZoom });
  // Dernières données connues : servent aussi de contenu initial lorsque la
  // source est recréée après un changement de style.
  const featuresRef = useRef<PositionFeatures>(positionFeatures ?? EMPTY_FEATURES);
  // Style déjà appliqué : évite un `setStyle` inutile au montage, qui
  // provoquerait une reconstruction complète avant la fin du chargement.
  const appliedBasemapRef = useRef(basemapId);

  useEffect(() => {
    onReadyRef.current = onReady;
    onUserInteractionRef.current = onUserInteraction;
  });

  useEffect(() => {
    const map = mapRef.current;
    const data = positionFeatures ?? EMPTY_FEATURES;
    featuresRef.current = data;
    map?.getSource<GeoJSONSource>(POSITION_SOURCE_ID)?.setData(data);
  }, [positionFeatures]);

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

    const install = () => installPositionLayers(map, featuresRef.current);
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
