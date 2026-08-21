import type { Metadata } from 'next';
import Link from 'next/link';
import { SettingsForms } from './SettingsForms';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { effectiveSettings, loadAppContext } from '@/lib/data/context';
import { formatDecimal } from '@/lib/geo/format';

export const metadata: Metadata = { title: 'Réglages' };

export default async function SettingsPage() {
  const context = await loadAppContext();
  const settings = effectiveSettings(context);

  if (!context.user) {
    return (
      <div className="mx-auto w-full max-w-2xl p-5">
        <Card
          title="Connexion requise"
          description="Les réglages sont enregistrés sur votre compte."
        >
          <Link href="/connexion">
            <Button variant="primary">Se connecter</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const home =
    context.profile?.home_lat != null && context.profile?.home_lon != null
      ? formatDecimal({ lat: context.profile.home_lat, lon: context.profile.home_lon })
      : null;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 p-5">
      <header>
        <h1 className="text-xl font-semibold">Réglages</h1>
        <p className="mt-1 text-sm text-ink-2">
          Ces valeurs sont stockées sur votre compte et s’appliquent à tous vos appareils.
        </p>
      </header>

      <SettingsForms
        email={context.user.email ?? ''}
        displayName={context.profile?.display_name ?? ''}
        settings={settings}
        homePointLabel={home}
      />
    </div>
  );
}
