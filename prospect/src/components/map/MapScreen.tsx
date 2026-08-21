'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { MapCanvas, type MapLayerData } from './MapCanvas';
import { MapControls } from './MapControls';
import { HistoryControl } from './HistoryControl';
import { PositionReadout } from './PositionReadout';
import { LiveHud } from '@/components/session/LiveHud';
import { StartSessionPanel } from '@/components/session/StartSessionPanel';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useSessionController } from '@/hooks/useSessionController';
import { useSessionRecorder } from '@/hooks/useSessionRecorder';
import { useTrackHistory } from '@/hooks/useTrackHistory';
import { useWakeLock } from '@/hooks/useWakeLock';
import { buildPositionFeatures, EMPTY_FEATURES } from '@/lib/geo/position-feature';
import { buildLiveTrack } from '@/lib/geo/track-feature';
import type { SamplingSettings } from '@/lib/geo/sampling';
import type { BBox } from '@/lib/geo/types';
import type { PeriodId } from '@/lib/session/period';
import type { SessionSummary } from '@/lib/session/types';
import { FIELD_ZOOM } from './constants';
import type { BasemapId } from './basemaps';
import type { UnitSystem } from '@/lib/supabase/types';
import type { FeatureCollection } from 'geojson';

const EMPTY_MARKERS: FeatureCollection = { type: 'FeatureCollection', features: [] };

export type MapScreenProps = {
  basemapId: BasemapId;
  /** Vue d'ouverture : point d'accueil du profil, ou centre de la France. */
  initialCenter: [number, number];
  initialZoom: number;
  units: UnitSystem;
  /** Sortie déjà ouverte au chargement de la page, le cas échéant. */
  initialSession: SessionSummary | null;
  sampling: SamplingSettings;
  keepScreenAwake: boolean;
  /** Faux tant qu'aucun compte n'est connecté : rien ne peut être enregistré. */
  canRecord: boolean;
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
  initialSession,
  sampling,
  keepScreenAwake,
  canRecord,
  onSaveHomePoint,
}: MapScreenProps) {
  const mapRef = useRef<MapLibreMap | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const awaitingFirstFocusRef = useRef(initialSession?.status === 'active');

  const [mapReady, setMapReady] = useState(false);
  // Une sortie déjà en cours au chargement : la carte suit d'emblée.
  const [follow, setFollow] = useState(initialSession?.status === 'active');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [saveState, setSaveState] = useState<string | null>(null);
  const [viewport, setViewport] = useState<BBox | null>(null);
  const [historyPeriod, setHistoryPeriod] = useState<PeriodId | null>(null);

  const controller = useSessionController(initialSession);
  const recorder = useSessionRecorder({
    session: controller.session,
    settings: sampling,
    onSessionUpdate: controller.setSession,
  });
  const geo = useGeolocation({ onFix: recorder.handleFix });
  const { fix, status, start } = geo;

  const wakeLock = useWakeLock(keepScreenAwake && controller.session?.status === 'active');
  const history = useTrackHistory(viewport, historyPeriod);

  const handleReady = useCallback((map: MapLibreMap) => {
    mapRef.current = map;
    setMapReady(true);
  }, []);

  // Un déplacement manuel coupe le suivi : la carte ne doit jamais reprendre
  // la main pendant que l'utilisateur explore.
  const handleUserInteraction = useCallback(() => setFollow(false), []);

  // Point de retour affiché sur la carte pendant la sortie.
  const vehicleMarkers = useMemo<FeatureCollection>(() => {
    const session = controller.session;
    if (!session || session.vehicle_lat == null || session.vehicle_lon == null) {
      return EMPTY_MARKERS;
    }
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'vehicle',
          geometry: { type: 'Point', coordinates: [session.vehicle_lon, session.vehicle_lat] },
          properties: { kind: 'vehicle', label: session.vehicle_label },
        },
      ],
    };
  }, [controller.session]);

  const layerData = useMemo<MapLayerData>(
    () => ({
      position: fix ? buildPositionFeatures(fix) : EMPTY_FEATURES,
      liveTrack: buildLiveTrack(recorder.recorded),
      history: history.features,
      markers: vehicleMarkers,
    }),
    [fix, recorder.recorded, history.features, vehicleMarkers],
  );

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
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shell.requestFullscreen();
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

  const handleStart = useCallback(
    (saveVehicle: boolean) => {
      void controller.start({
        position: fix ? { lat: fix.lat, lon: fix.lon } : null,
        saveVehicle,
        title: null,
      });
      // Une sortie suit la position : le GPS démarre et la carte recentre.
      recenter();
    },
    [controller, fix, recenter],
  );

  const handleResume = useCallback(() => {
    void controller.resume();
    recenter();
  }, [controller, recenter]);

  const handleFinish = useCallback(() => {
    const id = controller.session?.id;
    // Les points en attente partent avant la clôture, sinon la fin du parcours
    // manquerait à la trace.
    void controller.finish(() => recorder.flushNow()).then(() => {
      if (id) recorder.reset(id);
    });
  }, [controller, recorder]);

  const session = controller.session;

  return (
    <div ref={shellRef} className="relative h-full w-full bg-surface-0">
      <MapCanvas
        basemapId={basemapId}
        layerData={layerData}
        initialCenter={initialCenter}
        initialZoom={initialZoom}
        onReady={handleReady}
        onUserInteraction={handleUserInteraction}
        onViewportChange={setViewport}
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

      {canRecord ? (
        <HistoryControl
          period={historyPeriod}
          loading={history.loading}
          error={history.error}
          trackCount={history.features.features.length}
          onChange={setHistoryPeriod}
        />
      ) : null}

      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 space-y-3">
        <div className="pointer-events-auto">
          {session ? (
            <LiveHud
              session={session}
              fix={fix}
              units={units}
              pendingCount={recorder.pendingCount}
              persisted={recorder.persisted}
              syncing={recorder.syncing}
              recorderError={recorder.lastError}
              wakeLockActive={!keepScreenAwake || wakeLock.active}
              gpsActive={status === 'tracking'}
              onEnableGps={recenter}
              busy={controller.busy}
              error={controller.error}
              onPause={() => void controller.pause()}
              onResume={handleResume}
              onFinish={handleFinish}
              onSaveVehicle={() =>
                void controller.saveVehicle(fix ? { lat: fix.lat, lon: fix.lon } : null, 'Voiture')
              }
            />
          ) : (
            <div className="space-y-3">
              <StartSessionPanel
                fix={fix}
                canRecord={canRecord}
                busy={controller.busy}
                error={controller.error}
                justFinished={controller.justFinished}
                units={units}
                onStart={handleStart}
                onDismissSummary={controller.dismissSummary}
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
          )}
        </div>
      </div>
    </div>
  );
}
