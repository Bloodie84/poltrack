'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  peaks: number[] | null;
  progress: number;               // 0 → 1
  buffered?: number;              // 0 → 1
  onSeek?: (ratio: number) => void;
  height?: number;
  barWidth?: number;
  gap?: number;
  className?: string;
  ariaLabel?: string;
}

const PLAYED = '#4fe0c1';
const UNPLAYED = 'rgba(255,255,255,0.17)';
const BUFFERED = 'rgba(255,255,255,0.28)';
const HOVER = 'rgba(255,255,255,0.42)';

/**
 * Canvas waveform. Interactive: click, drag or touch anywhere to seek.
 * When no peak data could be computed (codec the browser cannot decode) it
 * degrades to a thin progress bar rather than inventing a shape.
 */
export default function Waveform({
  peaks,
  progress,
  buffered = 0,
  onSeek,
  height = 64,
  barWidth = 2,
  gap = 1,
  className,
  ariaLabel = 'Seek',
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth(Math.round(w));
    });
    ro.observe(el);
    setWidth(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const supportsRound = typeof ctx.roundRect === 'function';
    const bar = (x: number, y: number, w: number, h: number, r: number, color: string) => {
      ctx.fillStyle = color;
      if (supportsRound) {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, w, h);
      }
    };

    if (!peaks || peaks.length === 0) {
      const barH = 4;
      const y = (height - barH) / 2;
      const r = barH / 2;
      const rect = (x: number, w: number, color: string) => {
        if (w <= 0) return;
        bar(x, y, Math.max(w, barH), barH, r, color);
      };
      rect(0, width, UNPLAYED);
      rect(0, width * Math.min(1, Math.max(0, buffered)), BUFFERED);
      rect(0, width * Math.min(1, Math.max(0, progress)), PLAYED);
      return;
    }

    const slot = barWidth + gap;
    const count = Math.max(8, Math.floor(width / slot));
    const step = peaks.length / count;
    const playedX = width * Math.min(1, Math.max(0, progress));
    const bufferedX = width * Math.min(1, Math.max(0, buffered));
    const hoverX = hover === null ? -1 : width * hover;
    const minH = 2;

    for (let i = 0; i < count; i += 1) {
      const from = Math.floor(i * step);
      const to = Math.max(from + 1, Math.floor((i + 1) * step));
      let peak = 0;
      for (let j = from; j < to && j < peaks.length; j += 1) {
        if (peaks[j] > peak) peak = peaks[j];
      }
      const h = Math.max(minH, peak * (height - 2));
      const x = i * slot;
      const y = (height - h) / 2;

      let color = UNPLAYED;
      if (x + barWidth <= playedX) color = PLAYED;
      else if (x + barWidth <= bufferedX) color = BUFFERED;
      if (hoverX > 0 && x + barWidth <= hoverX && color === UNPLAYED) color = HOVER;

      bar(x, y, barWidth, h, barWidth / 2, color);
    }
  }, [peaks, progress, buffered, width, height, barWidth, gap, hover]);

  const ratioFromEvent = useCallback((clientX: number) => {
    const el = wrapRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }, []);

  useEffect(() => {
    if (!onSeek) return;
    const move = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      e.preventDefault();
      const r = ratioFromEvent(e.clientX);
      setHover(r);
      onSeek(r);
    };
    const up = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setHover(null);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [onSeek, ratioFromEvent]);

  const interactive = Boolean(onSeek);

  return (
    <div
      ref={wrapRef}
      className={`waveform ${interactive ? 'waveform--interactive' : ''} ${className ?? ''}`}
      style={{ height }}
      role={interactive ? 'slider' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? ariaLabel : undefined}
      aria-valuemin={interactive ? 0 : undefined}
      aria-valuemax={interactive ? 100 : undefined}
      aria-valuenow={interactive ? Math.round(progress * 100) : undefined}
      onPointerDown={(e) => {
        if (!onSeek) return;
        draggingRef.current = true;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        const r = ratioFromEvent(e.clientX);
        setHover(r);
        onSeek(r);
      }}
      onPointerMove={(e) => {
        if (!onSeek || draggingRef.current) return;
        if (e.pointerType === 'mouse') setHover(ratioFromEvent(e.clientX));
      }}
      onPointerLeave={() => {
        if (!draggingRef.current) setHover(null);
      }}
      onKeyDown={(e) => {
        if (!onSeek) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); onSeek(Math.min(1, progress + 0.02)); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); onSeek(Math.max(0, progress - 0.02)); }
        if (e.key === 'Home') { e.preventDefault(); onSeek(0); }
        if (e.key === 'End') { e.preventDefault(); onSeek(0.99); }
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height }} />
      {interactive && hover !== null && (
        <span className="waveform__cursor" style={{ left: `${hover * 100}%` }} />
      )}
    </div>
  );
}
