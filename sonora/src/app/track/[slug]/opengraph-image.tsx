import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { shortIdFromParam } from '@/lib/slug';
import { formatTime, formatBitrate, formatSampleRate } from '@/lib/format';
import { SITE_NAME } from '@/lib/site';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = `${SITE_NAME} — listen to this track`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/* The palette of the app, restated here: satori has no access to globals.css. */
const GROUND = '#0b0a09';
const PANEL = '#131110';
const LINE = 'rgba(245, 238, 226, 0.09)';
const TEXT = '#f3efe7';
const TEXT_2 = '#a69f94';
const TEXT_3 = '#6e6862';
const SIGNAL = '#e2a64b';

const MAX_COVER_BYTES = 4 * 1024 * 1024;

/**
 * Satori decodes PNG, JPEG and GIF and nothing else, so the format is read from
 * the first bytes rather than from the Content-Type header: storage does not
 * always label an object correctly, and a WebP announced as a PNG would take the
 * whole image down. A cover in a format that cannot be drawn — WebP, AVIF — is
 * treated as no cover at all, because a card that is always produced is worth
 * more than one that fails on a format.
 */
function drawableType(bytes: Uint8Array): string | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  return null;
}

async function loadCover(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500), cache: 'no-store' });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_COVER_BYTES) return null;
    const type = drawableType(bytes);
    if (!type) return null;
    return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
  } catch {
    return null;
  }
}

/** Peaks resampled to exactly `count` bars, taking the loudest of each slice. */
function resample(peaks: number[], count: number): number[] {
  if (peaks.length === 0) return [];
  const step = peaks.length / count;
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const from = Math.floor(i * step);
    const to = Math.max(from + 1, Math.floor((i + 1) * step));
    let peak = 0;
    for (let j = from; j < to && j < peaks.length; j += 1) {
      if (peaks[j] > peak) peak = peaks[j];
    }
    out.push(Math.min(1, peak));
  }
  return out;
}

/** Cuts on a word boundary so a long title ends in words rather than mid-syllable. */
function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Next marks a generated image immutable for a year, which would be a lie here:
 * the URL does not change when the artist renames a track, so a year-old card
 * would keep being served for a track that no longer has that name. A short
 * shared TTL with revalidation keeps edits visible without re-drawing the image
 * for every scrape.
 */
const CACHE_CONTROL = 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400';

function options(sans: Buffer, display: Buffer) {
  return {
    ...size,
    headers: { 'cache-control': CACHE_CONTROL },
    fonts: [
      { name: 'Plex', data: sans, weight: 400 as const, style: 'normal' as const },
      { name: 'PlexDisplay', data: display, weight: 600 as const, style: 'normal' as const },
    ],
  };
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shortId = shortIdFromParam(slug);

  // The same function the page uses, so the same rules apply: a private track
  // yields no row to a caller without the owner's session, and a crawler never
  // carries one. There is no second, looser lookup path for previews.
  let track: {
    title: string;
    artist: string;
    cover_url: string | null;
    duration: number | null;
    waveform: unknown;
    format: string | null;
    bitrate: number | null;
    sample_rate: number | null;
  } | null = null;

  if (shortId) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.rpc('track_by_short_id', { p_short_id: shortId });
    const row = Array.isArray(data) ? data[0] : data;
    if (row) track = row;
  }

  const [sans, display] = await Promise.all([
    readFile(join(process.cwd(), 'src/fonts/ibm-plex-sans-400.ttf')),
    readFile(join(process.cwd(), 'src/fonts/ibm-plex-sans-condensed-600.ttf')),
  ]);

  if (!track) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 18,
            background: GROUND,
            fontFamily: 'Plex',
          }}
        >
          <div style={{ fontSize: 26, letterSpacing: 8, color: SIGNAL, textTransform: 'uppercase' }}>
            {SITE_NAME}
          </div>
          <div style={{ fontSize: 52, fontFamily: 'PlexDisplay', color: TEXT }}>
            This track is not here
          </div>
        </div>
      ),
      options(sans, display),
    );
  }

  const peaks = Array.isArray(track.waveform) ? (track.waveform as number[]) : [];
  const cover = await loadCover(track.cover_url);
  const sleeveBars = resample(peaks, 32);
  const stripBars = resample(peaks, 104);

  const title = clamp(track.title, 58);
  const titleSize = title.length > 40 ? 54 : title.length > 26 ? 66 : 78;

  const meta = [
    track.duration ? formatTime(track.duration) : null,
    track.format ? track.format.toUpperCase() : null,
    track.bitrate ? formatBitrate(track.bitrate) : null,
    track.sample_rate ? formatSampleRate(track.sample_rate) : null,
  ].filter((v): v is string => Boolean(v));

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: GROUND,
          padding: '60px 68px 0',
          fontFamily: 'Plex',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 52 }}>
          {/* Sleeve: the artwork when there is one, the track's own peaks when
              there is not — the same rule the app follows everywhere else. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 336,
              height: 336,
              flexShrink: 0,
              borderRadius: 6,
              border: `1px solid ${LINE}`,
              background: PANEL,
              overflow: 'hidden',
            }}
          >
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt="" width={336} height={336} style={{ objectFit: 'cover' }} />
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  width: 336,
                  height: 336,
                }}
              >
                {sleeveBars.map((peak, i) => (
                  <div
                    key={i}
                    style={{
                      width: 4,
                      height: Math.max(4, Math.round(peak * 258)),
                      borderRadius: 2,
                      background: `rgba(243, 239, 231, ${(0.16 + peak * 0.34).toFixed(3)})`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                fontSize: 21,
                letterSpacing: 7,
                color: SIGNAL,
                textTransform: 'uppercase',
              }}
            >
              {/* The one lit element on the card: the play mark, in brass. */}
              <svg width="17" height="20" viewBox="0 0 17 20" fill={SIGNAL}>
                <path d="M1 1.6a1 1 0 0 1 1.52-.85l13 8.4a1 1 0 0 1 0 1.7l-13 8.4A1 1 0 0 1 1 18.4z" />
              </svg>
              {SITE_NAME}
            </div>

            <div
              style={{
                display: 'flex',
                marginTop: 20,
                fontFamily: 'PlexDisplay',
                fontSize: titleSize,
                lineHeight: 1.06,
                color: TEXT,
              }}
            >
              {title}
            </div>

            <div style={{ display: 'flex', marginTop: 16, fontSize: 34, color: TEXT_2 }}>
              {clamp(track.artist, 44)}
            </div>

            {meta.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 30 }}>
                {meta.map((item, i) => (
                  <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    {i > 0 && (
                      <div style={{ display: 'flex', width: 4, height: 4, borderRadius: 2, background: TEXT_3 }} />
                    )}
                    <div style={{ display: 'flex', fontSize: 23, color: TEXT_3 }}>{item}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* The waveform runs off both edges: the card is a window onto a track,
            not a poster with a picture of one. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 192,
            paddingBottom: 34,
            marginTop: 42,
            marginLeft: -68,
            marginRight: -68,
            paddingLeft: 68,
            paddingRight: 68,
          }}
        >
          {stripBars.map((peak, i) => (
            <div
              key={i}
              style={{
                width: 6,
                height: Math.max(5, Math.round(peak * 150)),
                borderRadius: 3,
                background: `rgba(243, 239, 231, ${(0.13 + peak * 0.27).toFixed(3)})`,
              }}
            />
          ))}
        </div>
      </div>
    ),
    options(sans, display),
  );
}
