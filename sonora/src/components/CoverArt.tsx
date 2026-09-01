import { MusicIcon } from './icons';

interface Props {
  url: string | null;
  alt: string;
  size?: number | string;
  radius?: number;
  className?: string;
  priority?: boolean;
}

/** Plain <img>: covers come from Supabase storage and are already sized. */
export default function CoverArt({ url, alt, size, radius, className, priority }: Props) {
  const style: React.CSSProperties = {};
  if (size !== undefined) {
    style.width = typeof size === 'number' ? `${size}px` : size;
  }
  if (radius !== undefined) style.borderRadius = `${radius}px`;

  return (
    <div className={`cover ${className ?? ''}`} style={style}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} loading={priority ? 'eager' : 'lazy'} decoding="async" />
      ) : (
        <div className="cover__fallback">
          <MusicIcon size={typeof size === 'number' ? Math.max(16, size * 0.28) : 22} />
        </div>
      )}
    </div>
  );
}
