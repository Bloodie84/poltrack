import localFont from 'next/font/local';

/**
 * IBM Plex, self-hosted (OFL 1.1 — see src/fonts/OFL.txt). Three voices from
 * one superfamily: condensed for display, sans for the interface, mono for
 * anything an audio engineer would read off a device.
 */

export const sans = localFont({
  variable: '--font-sans',
  display: 'swap',
  src: [
    { path: '../fonts/ibm-plex-sans-400-latin.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/ibm-plex-sans-500-latin.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/ibm-plex-sans-600-latin.woff2', weight: '600', style: 'normal' },
  ],
  fallback: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
});

export const display = localFont({
  variable: '--font-display',
  display: 'swap',
  src: [
    { path: '../fonts/ibm-plex-sans-condensed-500-latin.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/ibm-plex-sans-condensed-600-latin.woff2', weight: '600', style: 'normal' },
  ],
  fallback: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
});

export const mono = localFont({
  variable: '--font-mono',
  display: 'swap',
  src: [
    { path: '../fonts/ibm-plex-mono-400-latin.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/ibm-plex-mono-500-latin.woff2', weight: '500', style: 'normal' },
  ],
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
});
