'use client';

import { useEffect, useState } from 'react';
import { copyText } from '@/lib/clipboard';
import { useToast } from './Toast';
import Modal from './Modal';
import { CheckIcon, CloseIcon, LinkIcon, MailIcon, ShareIcon } from './icons';

interface Props {
  url: string;
  title: string;
  artist: string;
  onClose: () => void;
}

const MESSENGER_APP_ID = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;

function isMobile() {
  return typeof navigator !== 'undefined' && /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function ShareSheet({ url, title, artist, onClose }: Props) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const shareText = `${title} — ${artist}`;

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  const copy = async () => {
    const ok = await copyText(url);
    if (ok) {
      setCopied(true);
      toast('Link copied');
      setTimeout(() => setCopied(false), 1800);
    } else {
      toast('Could not copy — select the link manually');
    }
  };

  const open = (href: string) => {
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  const targets = [
    {
      key: 'whatsapp',
      label: 'WhatsApp',
      color: '#25D366',
      icon: (
        <path d="M12 2a9.9 9.9 0 0 0-8.5 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm5.6 14.1c-.2.7-1.2 1.3-1.9 1.4-.5.1-1.2.1-1.9-.1a13 13 0 0 1-6.7-5.8c-.5-.9-.8-1.9-.4-2.9.2-.5.6-1 1-1.2.2-.1.6-.1.8 0l.9 2c.1.2 0 .5-.1.6l-.5.6c-.1.2-.2.4 0 .7a9 9 0 0 0 3.6 3.1c.3.1.5 0 .7-.2l.6-.7c.2-.2.4-.2.6-.1l1.9 1c.2.1.3.3.3.5 0 .3 0 .8-.1 1.1Z" />
      ),
      onClick: () => open(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}`),
    },
    {
      key: 'messenger',
      label: 'Messenger',
      color: '#0084FF',
      icon: (
        <path d="M12 2C6.3 2 2 6.2 2 11.8c0 3 1.3 5.6 3.5 7.4v3.3l3.2-1.8c.9.3 1.8.4 2.8.4 5.7 0 10-4.2 10-9.8S17.7 2 12 2Zm1 12.4-2.6-2.7-4.9 2.7L10.9 9l2.6 2.7L18.4 9l-5.4 5.4Z" />
      ),
      onClick: () => {
        if (isMobile()) {
          window.location.href = `fb-messenger://share/?link=${encodeURIComponent(url)}`;
          return;
        }
        if (MESSENGER_APP_ID) {
          open(
            `https://www.facebook.com/dialog/send?app_id=${MESSENGER_APP_ID}&link=${encodeURIComponent(
              url
            )}&redirect_uri=${encodeURIComponent(url)}`
          );
          return;
        }
        void copy();
        toast('Messenger needs its app — link copied instead');
      },
    },
    {
      key: 'x',
      label: 'X',
      color: '#e7e9ea',
      icon: (
        <path d="M17.6 3h3l-6.6 7.6L21.8 21h-6l-4.7-6.1L5.6 21h-3l7.1-8.1L2.5 3h6.2l4.3 5.6L17.6 3Zm-1.1 16.2h1.7L7.6 4.7H5.8l10.7 14.5Z" />
      ),
      onClick: () =>
        open(
          `https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`
        ),
    },
    {
      key: 'facebook',
      label: 'Facebook',
      color: '#1877F2',
      icon: (
        <path d="M22 12a10 10 0 1 0-11.6 9.9v-7h-2.5V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.4h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12Z" />
      ),
      onClick: () => open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`),
    },
  ];

  return (
    <Modal label="Share track" onClose={onClose}>
      <div className="row row--between" style={{ marginBottom: 4 }}>
        <h2 style={{ fontSize: 17 }}>Share</h2>
        <button type="button" className="btn btn--ghost btn--icon btn--sm" onClick={onClose} aria-label="Close">
          <CloseIcon size={16} />
        </button>
      </div>

      <p className="hint truncate" style={{ marginBottom: 16 }}>{shareText}</p>

      <div className="share-link">
        <span className="truncate">{url}</span>
        <button type="button" className="btn btn--sm btn--primary" onClick={copy}>
          {copied ? <CheckIcon size={14} /> : <LinkIcon size={14} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="share-grid">
        {targets.map((t) => (
          <button key={t.key} type="button" className="share-target" onClick={t.onClick}>
            <span className="share-target__icon" style={{ color: t.color }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                {t.icon}
              </svg>
            </span>
            {t.label}
          </button>
        ))}

        <button
          type="button"
          className="share-target"
          onClick={() =>
            open(`mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(`${shareText}\n${url}`)}`)
          }
        >
          <span className="share-target__icon"><MailIcon size={20} /></span>
          Email
        </button>

        {canNativeShare && (
          <button
            type="button"
            className="share-target"
            onClick={async () => {
              try {
                await navigator.share({ title, text: shareText, url });
              } catch {
                /* the user dismissed the sheet */
              }
            }}
          >
            <span className="share-target__icon"><ShareIcon size={20} /></span>
            More…
          </button>
        )}
      </div>
    </Modal>
  );
}
