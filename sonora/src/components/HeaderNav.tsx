'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { LogoutIcon, SettingsIcon, UploadIcon } from './icons';

interface Props {
  user: { email: string | null; displayName: string } | null;
}

export default function HeaderNav({ user }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const signOut = async () => {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    setOpen(false);
    router.push('/');
    router.refresh();
    setBusy(false);
  };

  if (!user) {
    return (
      <nav className="nav">
        <Link href="/login" className="nav__link">Log in</Link>
        <Link href="/register" className="btn btn--primary btn--sm">Create account</Link>
      </nav>
    );
  }

  const initial = (user.displayName || user.email || '?').trim().charAt(0).toUpperCase();

  return (
    <nav className="nav">
      <Link
        href="/library"
        className={`nav__link ${pathname.startsWith('/library') ? 'nav__link--active' : ''}`}
      >
        My tracks
      </Link>
      <Link href="/upload" className="btn btn--primary btn--sm" style={{ marginLeft: 4 }}>
        <UploadIcon size={15} /> Upload
      </Link>

      <div className="menu" ref={menuRef}>
        <button
          type="button"
          className="avatar"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Account menu"
        >
          {initial}
        </button>

        {open && (
          <div className="menu__panel" role="menu">
            <div className="menu__head">
              <div className="truncate" style={{ fontWeight: 520 }}>{user.displayName}</div>
              <div className="truncate hint">{user.email}</div>
            </div>
            <hr className="divider" />
            <Link href="/settings" className="menu__item" role="menuitem">
              <SettingsIcon size={15} /> Settings
            </Link>
            <button type="button" className="menu__item" onClick={signOut} disabled={busy} role="menuitem">
              <LogoutIcon size={15} /> {busy ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
