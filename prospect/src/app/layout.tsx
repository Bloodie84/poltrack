import type { Metadata, Viewport } from 'next';
import { ServiceWorker } from '@/components/layout/ServiceWorker';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Prospect — Carnet de terrain',
    template: '%s · Prospect',
  },
  description:
    'Carnet de terrain géographique pour la détection de métaux : traces GPS, zones prospectées et découvertes.',
  applicationName: 'Prospect',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Prospect',
    statusBarStyle: 'black-translucent',
  },
  // Un carnet de terrain personnel n'a rien à faire dans un index public.
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#070b12',
  colorScheme: 'dark',
  // `viewport-fit=cover` : indispensable pour les zones sûres iOS en plein écran.
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
  // Le zoom reste autorisé : le bloquer nuit à l'accessibilité.
  maximumScale: 5,
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="h-full">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
