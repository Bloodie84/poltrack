import type { Metadata, Viewport } from 'next';
import './globals.css';
import { display, mono, sans } from './fonts';
import Header from '@/components/Header';
import MiniPlayer from '@/components/MiniPlayer';
import { PlayerProvider } from '@/components/PlayerProvider';
import { ToastProvider } from '@/components/Toast';
import { SITE_NAME, SITE_TAGLINE, getOrigin } from '@/lib/site';

export async function generateMetadata(): Promise<Metadata> {
  const origin = await getOrigin();
  return {
    metadataBase: new URL(origin),
    title: { default: `${SITE_NAME} — ${SITE_TAGLINE}`, template: `%s · ${SITE_NAME}` },
    description:
      'A fast, quiet place to upload audio, get a link, and let anyone listen — no account needed to play.',
    openGraph: { siteName: SITE_NAME, type: 'website' },
    icons: {
      icon: [
        {
          url:
            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230b0a09'/%3E%3Cg fill='%23e2a64b'%3E%3Crect x='8' y='13' width='2.6' height='6' rx='1.3'/%3E%3Crect x='13' y='8' width='2.6' height='16' rx='1.3'/%3E%3Crect x='18' y='11' width='2.6' height='10' rx='1.3'/%3E%3C/g%3E%3C/svg%3E",
        },
      ],
    },
  };
}

export const viewport: Viewport = {
  themeColor: '#0b0a09',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body>
        <ToastProvider>
          <PlayerProvider>
            <div className="shell">
              <Header />
              <main className="main">{children}</main>
            </div>
            <MiniPlayer />
          </PlayerProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
