'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

/**
 * Navigation limitée aux écrans réellement implémentés.
 * Les entrées des phases suivantes (Sorties, Découvertes, Parcelles, LiDAR…)
 * seront ajoutées au moment où elles fonctionneront, pas avant.
 */
const ITEMS: NavItem[] = [
  {
    href: '/carte',
    label: 'Carte',
    icon: (
      <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Zm0 0v13m6-10.5V20" />
    ),
  },
  {
    href: '/materiel',
    label: 'Matériel',
    icon: <path d="M12 3v9m0 0-3.5 3.5a5 5 0 1 0 7 0L12 12Z" />,
  },
  {
    href: '/parametres',
    label: 'Réglages',
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9l2.1 2.1m10 10 2.1 2.1m0-14.2-2.1 2.1m-10 10-2.1 2.1" />
      </>
    ),
  },
];

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function AppNav() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* Mobile : barre basse, atteignable au pouce. */}
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-1/95 backdrop-blur pb-safe md:hidden"
      >
        <ul className="grid grid-cols-3">
          {ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive(item.href) ? 'page' : undefined}
                className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-[11px]',
                  isActive(item.href) ? 'text-accent' : 'text-ink-2',
                )}
              >
                <Icon>{item.icon}</Icon>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Ordinateur : colonne latérale, socle de la future Mission Control. */}
      <nav
        aria-label="Navigation principale"
        className="hidden w-56 shrink-0 flex-col border-r border-line bg-surface-1 md:flex"
      >
        <div className="px-5 py-6">
          <p className="text-sm font-semibold tracking-[0.2em] text-accent">PROSPECT</p>
          <p className="mt-1 text-xs text-ink-2">Carnet de terrain</p>
        </div>
        <ul className="flex-1 space-y-1 px-3">
          {ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive(item.href) ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                  isActive(item.href)
                    ? 'bg-surface-3 text-ink-0'
                    : 'text-ink-2 hover:bg-surface-2 hover:text-ink-0',
                )}
              >
                <Icon>{item.icon}</Icon>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
