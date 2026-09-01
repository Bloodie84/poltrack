'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  label: string;
  onClose: () => void;
  width?: number;
  children: React.ReactNode;
}

/**
 * Dialogs render into <body>. An ancestor that is mid-animation (or keeps a
 * filled transform afterwards) becomes the containing block for `position:
 * fixed`, which would pin the sheet to that element instead of the viewport.
 */
export default function Modal({ label, onClose, width, children }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={width ? { maxWidth: width } : undefined}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
