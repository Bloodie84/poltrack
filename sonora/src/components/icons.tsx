import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const PlayIcon = (p: P) => (
  <svg width={p.size ?? 18} height={p.size ?? 18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M8 5.14v13.72a.6.6 0 0 0 .92.5l10.6-6.86a.6.6 0 0 0 0-1L8.92 4.64a.6.6 0 0 0-.92.5Z" />
  </svg>
);

export const PauseIcon = (p: P) => (
  <svg width={p.size ?? 18} height={p.size ?? 18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <rect x="6.5" y="5" width="3.6" height="14" rx="1.2" />
    <rect x="13.9" y="5" width="3.6" height="14" rx="1.2" />
  </svg>
);

export const UploadIcon = (p: P) => (
  <Svg {...p}><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" /><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" /></Svg>
);

export const DownloadIcon = (p: P) => (
  <Svg {...p}><path d="M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5" /><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" /></Svg>
);

export const ShareIcon = (p: P) => (
  <Svg {...p}><path d="M12 15V4m0 0L8 8m4-4 4 4" /><path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" /></Svg>
);

export const LinkIcon = (p: P) => (
  <Svg {...p}><path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.54 3.54 0 0 0-5-5L11.6 7.4" /><path d="M13.5 10.5a3.5 3.5 0 0 0-5 0L6 13a3.54 3.54 0 0 0 5 5l1.4-1.4" /></Svg>
);

export const CheckIcon = (p: P) => <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>;
export const CloseIcon = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>;
export const EditIcon = (p: P) => (
  <Svg {...p}><path d="M4 20h4l10-10a2.83 2.83 0 0 0-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></Svg>
);
export const TrashIcon = (p: P) => (
  <Svg {...p}><path d="M4 7h16M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" /><path d="M6.5 7l.8 12.1A1.5 1.5 0 0 0 8.8 20.5h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" /></Svg>
);
export const MusicIcon = (p: P) => (
  <Svg {...p}><path d="M9 18V6l10-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></Svg>
);
export const VolumeIcon = (p: P) => (
  <Svg {...p}><path d="M11 5.5 6.5 9H4v6h2.5L11 18.5V5.5Z" /><path d="M14.5 9.5a3.5 3.5 0 0 1 0 5" /><path d="M17 7a7 7 0 0 1 0 10" /></Svg>
);
export const MuteIcon = (p: P) => (
  <Svg {...p}><path d="M11 5.5 6.5 9H4v6h2.5L11 18.5V5.5Z" /><path d="m15.5 10 4 4m0-4-4 4" /></Svg>
);
export const RepeatIcon = (p: P) => (
  <Svg {...p}><path d="M4 12V9.5A2.5 2.5 0 0 1 6.5 7H18m0 0-3-3m3 3-3 3" /><path d="M20 12v2.5a2.5 2.5 0 0 1-2.5 2.5H6m0 0 3 3m-3-3 3-3" /></Svg>
);
export const EyeIcon = (p: P) => (
  <Svg {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></Svg>
);
export const EyeOffIcon = (p: P) => (
  <Svg {...p}><path d="M4 4l16 16" /><path d="M9.9 5.9A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.2 4M6.4 7.9A16.7 16.7 0 0 0 2.5 12S6 18.5 12 18.5a9.7 9.7 0 0 0 3.6-.7" /><path d="M9.9 10.2a3 3 0 0 0 4 4.2" /></Svg>
);
export const LockIcon = (p: P) => (
  <Svg {...p}><rect x="4.5" y="10" width="15" height="10" rx="2" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" /></Svg>
);
export const ChartIcon = (p: P) => (
  <Svg {...p}><path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 15.5v-3M12 15.5v-7M16 15.5v-5" /></Svg>
);
export const ChevronRightIcon = (p: P) => <Svg {...p}><path d="m9.5 5.5 6.5 6.5-6.5 6.5" /></Svg>;
export const ChevronLeftIcon = (p: P) => <Svg {...p}><path d="M14.5 5.5 8 12l6.5 6.5" /></Svg>;
export const MoreIcon = (p: P) => (
  <svg width={p.size ?? 18} height={p.size ?? 18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <circle cx="6" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18" cy="12" r="1.6" />
  </svg>
);
export const MailIcon = (p: P) => (
  <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7.5 7.1 5a1.6 1.6 0 0 0 1.8 0l7.1-5" /></Svg>
);
export const AlertIcon = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 8v4.5M12 15.6v.1" /></Svg>
);
export const FileIcon = (p: P) => (
  <Svg {...p}><path d="M13.5 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5l-5-5Z" /><path d="M13.5 3.5v5h5" /></Svg>
);
export const ImageIcon = (p: P) => (
  <Svg {...p}><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="m5 17 4.2-4.2a1.5 1.5 0 0 1 2.1 0L15 16.5m0 0 1.7-1.7a1.5 1.5 0 0 1 2.1 0L20.5 16" /></Svg>
);
export const UsersIcon = (p: P) => (
  <Svg {...p}><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" /><path d="M16 5.6a3.2 3.2 0 0 1 0 6.1M17.5 14.6a5.5 5.5 0 0 1 3 4.9" /></Svg>
);
export const LogoutIcon = (p: P) => (
  <Svg {...p}><path d="M15 8V5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20h8a1.5 1.5 0 0 0 1.5-1.5V16" /><path d="M9.5 12H20m0 0-3-3m3 3-3 3" /></Svg>
);
export const SettingsIcon = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1.1Z" /></Svg>
);
