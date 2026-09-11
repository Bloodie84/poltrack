'use client';

import { useEffect, useState } from 'react';
import { formatCount, plural } from '@/lib/format';

interface Stats {
  plays: number;
  uniqueListeners: number;
  downloads: number;
  daily: { date: string; count: number }[];
}

export default function StatsPanel({ trackId }: { trackId: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStats(null);
    setError(null);
    fetch(`/api/tracks/${trackId}/stats`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Could not load statistics.');
        return body as Stats;
      })
      .then((data) => !cancelled && setStats(data))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load statistics.'));
    return () => {
      cancelled = true;
    };
  }, [trackId]);

  if (error) return <div className="stats"><p className="hint">{error}</p></div>;

  if (!stats) {
    return (
      <div className="stats">
        <div className="skeleton" style={{ height: 68 }} />
      </div>
    );
  }

  const max = Math.max(1, ...stats.daily.map((d) => d.count));
  const hasHistory = stats.daily.some((d) => d.count > 0);

  return (
    <div className="stats">
      <div className="stats__figures">
        <div>
          <span className="stats__value">{formatCount(stats.plays)}</span>
          <span className="stats__label">Plays</span>
        </div>
        <div>
          <span className="stats__value">{formatCount(stats.uniqueListeners)}</span>
          <span className="stats__label">Unique listeners</span>
        </div>
        <div>
          <span className="stats__value">{formatCount(stats.downloads)}</span>
          <span className="stats__label">Downloads</span>
        </div>
      </div>

      {hasHistory ? (
        <>
          <div className="stats__chart" aria-label="Plays over the last 30 days">
            {stats.daily.map((d) => (
              <span
                key={d.date}
                className={`stats__bar ${d.count === 0 ? 'stats__bar--empty' : ''}`}
                style={{ height: `${Math.max(2, (d.count / max) * 100)}%` }}
                title={`${d.date}: ${d.count} ${plural(d.count, 'play')}`}
              />
            ))}
          </div>
          <p className="stats__caption">Last 30 days</p>
        </>
      ) : (
        <p className="hint" style={{ marginTop: 10 }}>No plays in the last 30 days yet.</p>
      )}
    </div>
  );
}
