'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { MapCanvas } from './MapCanvas';
import { MapControls } from './MapControls';
import { PositionReadout } from './PositionReadout';
import { useGeolocation } from '@/hooks/useGeolocation';
import { buildPositionFeatures } from '@/lib/geo/position-feature';
import type { BasemapId } from './basemaps';
import { FIELD_ZOOM } from './constants';
import type { UnitSystem } from '@/lib/supabase/types';

export type MapScreenProps = {
  basemapId: BasemapId;
  /** Vue d'ouverture : point d'accueil du profil, ou centre de la France. */
  initialCenter: [number, number];
  initialZoom: number;
  units: UnitSystem;
  /**
   * Enregistre la position courante comme point d'ouverture de la carte.
   * `null` quand aucun backend n'est disponible : le bouton est alors masqué
   * plutôt que présenté sans effet.
   */
  onSaveHomePoint: ((lat: number, lon: number, zoom: number) => Promise<string>) | null;
};

export function MapScreen({
  basemapId,
  initialCenter,
  initialZoom,
  units,
  onSaveHomePoint,
}: MapScreenProps) {
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [follow, setFollow] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [saveState, setSaveState] = useState<string | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  // Passe à true quand l'utilisateur demande le suivi avant d'avoir un fix :
  // le premier point reçu doit alors cadrer sur le terrain, pas rester sur la
  // vue France entière.
  const awaitingFirstFocusRef = useRef(false);

  const geo = useGeolocation();
  const { fix, status, start } = geo;

  const handleReady = useCallback((map: MapLibreMap) => {
    mapRef.current = map;
    setMapReady(true);
  }, []);

  // Un déplacement manuel coupe le suivi : la carte ne doit jamais reprendre
  // la main pendant que l'utilisateur explore.
  const handleUserInteraction = useCallback(() => setFollow(false), []);

  const features = useMemo(() => (fix ? buildPositionFeatures(fix) : null), [fix]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !follow || !fix) return;

    if (awaitingFirstFocusRef.current) {
      awaitingFirstFocusRef.current = false;
      map.easeTo({
        center: [fix.lon, fix.lat],
        zoom: Math.max(map.getZoom(), FIELD_ZOOM),
        duration: 900,
      });
      return;
    }

    map.easeTo({ center: [fix.lon, fix.lat], duration: 600 });
  }, [fix, follow, mapReady]);

  const recenter = useCallback(() => {
    if (status === 'idle' || status === 'error') start();
    setFollow(true);

    const map = mapRef.current;
    if (map && fix) {
      map.easeTo({
        center: [fix.lon, fix.lat],
        zoom: Math.max(map.getZoom(), FIELD_ZOOM),
        duration: 600,
      });
      return;
    }

    // Aucun fix pour l'instant : le cadrage se fera à la première position.
    awaitingFirstFocusRef.current = true;
  }, [fix, start, status]);

  const zoomBy = useCallback((delta: number) => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ zoom: map.getZoom() + delta, duration: 200 });
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const shell = shellRef.current;
    if (!shell) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await shell.requestFullscreen();
      }
    } catch {
      // Safari iOS refuse le plein écran sur un div : l'interface reste
      // utilisable, on n'affiche pas d'erreur bloquante.
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const saveHome = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !onSaveHomePoint || !fix) return;
    setSaveState('Enregistrement…');
    setSaveState(await onSaveHomePoint(fix.lat, fix.lon, map.getZoom()));
  }, [fix, onSaveHomePoint]);

  return (
    <div ref={shellRef} className="relative h-full w-full bg-surface-0">
      <MapCanvas
        basemapId={basemapId}
        positionFeatures={features}
        initialCenter={initialCenter}
        initialZoom={initialZoom}
        onReady={handleReady}
        onUserInteraction={handleUserInteraction}
      />

      <MapControls
        ready={mapReady}
        follow={follow}
        gpsStatus={status}
        isFullscreen={isFullscreen}
        onRecenter={recenter}
        onZoomIn={() => zoomBy(1)}
        onZoomOut={() => zoomBy(-1)}
        onToggleFullscreen={toggleFullscreen}
      />

      <PositionReadout
        geo={geo}
        units={units}
        canSaveHome={onSaveHomePoint !== null}
        saveState={saveState}
        onSaveHome={saveHome}
        onStart={recenter}
      />
    </div>
  );
}
