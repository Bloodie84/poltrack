'use client';

import { useEffect, useRef } from 'react';
import { MusicIcon } from './icons';

interface Props {
  url: string | null;
  alt: string;
  /** Peak data of the track. Drawn as the sleeve when there is no artwork. */
  peaks?: number[] | null;
  size?: number | string;
  radius?: number;
  className?: string;
  priority?: boolean;
}

/**
 * A track without artwork gets a sleeve drawn from its own waveform: real data,
 * so every sleeve is different and none of them is invented decoration.
 */
function WaveSleeve({ peaks }: { peaks: number[] }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const box = canvas.getBoundingClientRect();
    const side = Math.max(64, Math.round(box.width || 160));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = side * dpr;
    canvas.height = side * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, side, side);

    // The ground brightens slightly with the track's own average level, so a
    // wall of sleeves varies the way a shelf of records does — from the audio,
    // not from a random seed.
    const energy = peaks.reduce((sum, v) => sum + v, 0) / peaks.length;
    const lift = Math.round(Math.min(1, Math.max(0, energy)) * 10);
    const ground = ctx.createLinearGradient(0, 0, side, side);
    ground.addColorStop(0, `rgb(${23 + lift}, ${21 + lift}, ${19 + lift})`);
    ground.addColorStop(1, `rgb(${16 + lift}, ${15 + lift}, ${14 + lift})`);
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, side, side);

    const pad = side * 0.09;
    const inner = side - pad * 2;
    const slot = Math.max(2, side / 56);
    const barWidth = Math.max(1, slot * 0.55);
    const count = Math.max(12, Math.floor(inner / slot));
    const step = peaks.length / count;
    const mid = side / 2;

    for (let i = 0; i < count; i += 1) {
      let peak = 0;
      const from = Math.floor(i * step);
      const to = Math.max(from + 1, Math.floor((i + 1) * step));
      for (let j = from; j < to && j < peaks.length; j += 1) {
        if (peaks[j] > peak) peak = peaks[j];
      }
      const h = Math.max(1.5, peak * inner * 0.94);
      const x = pad + i * (inner / count);
      // Louder passages sit brighter, so the sleeve carries the track's shape.
      ctx.fillStyle = `rgba(243, 239, 231, ${0.16 + peak * 0.34})`;
      ctx.fillRect(x, mid - h / 2, barWidth, h);
    }
  }, [peaks]);

  return <canvas ref={ref} aria-hidden="true" />;
}

/** Plain <img>: covers come from Supabase storage and are already sized. */
export default function CoverArt({ url, alt, peaks, size, radius, className, priority }: Props) {
  const style: React.CSSProperties = {};
  if (size !== undefined) style.width = typeof size === 'number' ? `${size}px` : size;
  if (radius !== undefined) style.borderRadius = `${radius}px`;

  return (
    <div className={`cover ${className ?? ''}`} style={style}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} loading={priority ? 'eager' : 'lazy'} decoding="async" />
      ) : peaks && peaks.length > 0 ? (
        <WaveSleeve peaks={peaks} />
      ) : (
        <div className="cover__fallback">
          <MusicIcon size={typeof size === 'number' ? Math.max(16, size * 0.28) : 22} />
        </div>
      )}
    </div>
  );
}
