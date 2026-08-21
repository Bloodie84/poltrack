import { AppNav } from '@/components/layout/AppNav';
import { StatusBanner } from '@/components/layout/StatusBanner';
import { loadAppContext } from '@/lib/data/context';

/**
 * Tout l'espace connecté dépend de la session : il ne doit jamais être
 * prérendu ni mis en cache, y compris lorsque le build tourne sans variables
 * Supabase (l'application se comporterait alors comme un site statique).
 */
export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const context = await loadAppContext();

  return (
    <div className="flex h-full">
      <AppNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <StatusBanner
          configured={context.configured}
          signedIn={context.user !== null}
          warning={context.warning}
        />
        {/* pb-16 : réserve la place de la barre de navigation mobile. */}
        <main className="min-h-0 flex-1 pb-16 md:pb-0">{children}</main>
      </div>
    </div>
  );
}
