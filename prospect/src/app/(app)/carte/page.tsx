import type { Metadata } from 'next';
import { MapScreenLoader } from '@/components/map/MapScreenLoader';
import { FRANCE_CENTER, FRANCE_ZOOM } from '@/components/map/constants';
import { saveHomePoint } from './actions';
import { effectiveSettings, loadAppContext } from '@/lib/data/context';
import { resolveBasemap } from '@/components/map/basemaps';

export const metadata: Metadata = { title: 'Carte' };

export default async function MapPage() {
  const context = await loadAppContext();
  const settings = effectiveSettings(context);
  const profile = context.profile;

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
        onSaveHomePoint={context.user ? saveHomePoint : null}
      />
    </div>
  );
}
