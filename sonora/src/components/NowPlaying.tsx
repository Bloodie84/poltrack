'use client';

/** Four moving level bars — the same mark as the logo, at instrument scale. */
export default function NowPlaying({ paused = false }: { paused?: boolean }) {
  return (
    <span className={`levels ${paused ? 'levels--paused' : ''}`} aria-hidden="true">
      <i /><i /><i /><i />
    </span>
  );
}
