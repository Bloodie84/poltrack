import type { Metadata } from 'next';
import { MapScreenLoader } from '@/components/map/MapScreenLoader';
import { FRANCE_CENTER, FRANCE_ZOOM } from '@/components/map/constants';
import { saveHomePoint } from './actions';
import { effectiveSettings, loadAppContext } from '@/lib/data/context';
import { getOpenSession } from '@/lib/data/sessions';
import { resolveBasemap } from '@/components/map/basemaps';

export const metadata: Metadata = { title: 'Carte' };

export default async function MapPage() {
  const context = await loadAppContext();
  const settings = effectiveSettings(context);
  const profile = context.profile;
  const openSession = context.user ? await getOpenSession() : null;

  const center: [number, number] =
    profile?.home_lon != null && profile?.home_lat != null
      ? [profile.home_lon, profile.home_lat]
      : FRANCE_CENTER;

  const zoom = profile?.home_lon != null ? profile.home_zoom : FRANCE_ZOOM;

  return (
    <div className="h-full w-full">
      <MapScreenLoader
        basemapId={resolveBasemap(settings.default_basemap).id}
        initialCenter={center}
        initialZoom={zoom}
        units={settings.units}
        initialSession={openSession}
        sampling={{
          minIntervalS: settings.gps_min_interval_s,
          minDistanceM: settings.gps_min_distance_m,
          maxAccuracyM: settings.gps_max_accuracy_m,
        }}
        keepScreenAwake={settings.keep_screen_awake}
        canRecord={context.user !== null}
        onSaveHomePoint={context.user ? saveHomePoint : null}
      />
    </div>
  );
}
