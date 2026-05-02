'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { fetchData } from '@/lib/data';
import { avg, obp, slg, fmtRate, cumulativeAvg, type GameLine } from '@/lib/stats';

interface GameRow {
  gameDate: string;
  atBats: number;
  hits: number;
}

interface PlayerDetail {
  player: {
    id: number;
    name: string;
    slug: string;
    mlbTeam: string | null;
    fantasyTeam: string;
    teamId: number;
  };
  seasonTotals: {
    gamesPlayed: number;
    atBats: number; hits: number; doubles: number; triples: number;
    homeRuns: number; totalBases: number; stolenBases: number;
    baseOnBalls: number; hitByPitch: number; runs: number; rbi: number;
    strikeouts: number; plateAppearances: number; sacFlies: number;
    fantasyScore: number;
  };
  games: GameRow[];
}

const SERIES_COLORS = [
  'hsl(var(--chart-1, 220 70% 50%))',
  'hsl(var(--chart-3, 30 80% 55%))',
  'hsl(var(--chart-4, 280 65% 60%))',
];

const MAX_PLAYERS = 3;

export default function ComparePage() {
  return (
    <Suspense fallback={
      <div className="space-y-4">
        <div className="h-5 w-48 bg-muted rounded animate-pulse" />
        <div className="h-72 bg-muted/50 rounded-lg animate-pulse" />
      </div>
    }>
      <CompareInner />
    </Suspense>
  );
}

function CompareInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const slugsParam = searchParams.get('players') ?? '';
  const slugs = useMemo(
    () => slugsParam.split(',').map(s => s.trim()).filter(Boolean).slice(0, MAX_PLAYERS),
    [slugsParam]
  );

  const [details, setDetails] = useState<Record<string, PlayerDetail>>({});
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (slugs.length === 0) {
      setDetails({});
      return;
    }
    setLoading(true);
    setErrors([]);
    Promise.all(
      slugs.map(slug =>
        fetchData<PlayerDetail>(`/api/players/${slug}`)
          .then(d => ({ slug, ok: true as const, data: d }))
          .catch((e: Error) => ({ slug, ok: false as const, error: e.message }))
      )
    ).then(results => {
      const map: Record<string, PlayerDetail> = {};
      const errs: string[] = [];
      for (const r of results) {
        if (r.ok) map[r.slug] = r.data;
        else errs.push(`${r.slug}: ${r.error}`);
      }
      setDetails(map);
      setErrors(errs);
    }).finally(() => setLoading(false));
  }, [slugs]);

  const removeSlug = (slug: string) => {
    const next = slugs.filter(s => s !== slug);
    router.replace(next.length ? `/compare?players=${next.join(',')}` : '/compare');
  };

  // Build chart data: one row per distinct date, with each player's
  // cumulative AVG as a column keyed by that player's slug.
  const chartData = useMemo(() => {
    const playerSeries: Record<string, Map<string, number>> = {};
    const allDates = new Set<string>();
    for (const slug of slugs) {
      const d = details[slug];
      if (!d) continue;
      const games: GameLine[] = d.games.map(g => ({
        gameDate: g.gameDate, hits: g.hits, atBats: g.atBats,
      }));
      const series = cumulativeAvg(games);
      const map = new Map<string, number>();
      for (const point of series) {
        map.set(point.date, point.value);
        allDates.add(point.date);
      }
      playerSeries[slug] = map;
    }
    const sortedDates = Array.from(allDates).sort();
    return sortedDates.map(date => {
      const point: Record<string, string | number> = { date: date.slice(5) };
      for (const slug of slugs) {
        // Forward-fill missing dates with the last known value so lines
        // don't disappear on rest days.
        const series = playerSeries[slug];
        if (!series) { point[slug] = 0; continue; }
        const dates = Array.from(series.keys()).sort();
        let last = 0;
        for (const d of dates) {
          if (d > date) break;
          last = series.get(d) ?? last;
        }
        point[slug] = last;
      }
      return point;
    });
  }, [slugs, details]);

  // Stats rows to display side-by-side.
  const STAT_ROWS: { label: string; fn: (t: PlayerDetail['seasonTotals']) => string }[] = [
    { label: 'GP', fn: t => String(t.gamesPlayed) },
    { label: 'PA', fn: t => String(t.plateAppearances) },
    { label: 'AB', fn: t => String(t.atBats) },
    { label: 'H', fn: t => String(t.hits) },
    { label: 'HR', fn: t => String(t.homeRuns) },
    { label: 'R', fn: t => String(t.runs) },
    { label: 'RBI', fn: t => String(t.rbi) },
    { label: 'BB', fn: t => String(t.baseOnBalls) },
    { label: 'SO', fn: t => String(t.strikeouts) },
    { label: 'SB', fn: t => String(t.stolenBases) },
    { label: 'AVG', fn: t => fmtRate(avg(t.hits, t.atBats)) },
    { label: 'OBP', fn: t => fmtRate(obp(t.hits, t.baseOnBalls, t.hitByPitch, t.atBats, t.sacFlies)) },
    { label: 'SLG', fn: t => fmtRate(slg(t.totalBases, t.atBats)) },
    { label: 'PTS', fn: t => String(t.fantasyScore) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Compare Players</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Up to {MAX_PLAYERS} side-by-side. URL: <code className="text-[10px]">/compare?players=slug1,slug2</code>
        </p>
      </div>

      {slugs.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground mb-3">
            No players selected. Append <code className="text-[10px]">?players=trout,judge</code> to the URL,
            or pick from the leaderboard:
          </p>
          <Link
            href="/players"
            className="inline-block px-3.5 py-2 text-xs rounded-md border border-border hover:bg-muted transition-colors"
          >
            Go to Players →
          </Link>
        </div>
      ) : loading ? (
        <div className="h-72 bg-muted/50 rounded-lg animate-pulse" />
      ) : (
        <>
          {errors.length > 0 && (
            <div className="border border-amber-500/40 bg-amber-500/10 text-xs px-3 py-2 rounded-md">
              <strong>Couldn&apos;t load:</strong> {errors.join(', ')}
            </div>
          )}

          {/* Player header row */}
          <div className="grid gap-2" style={{ gridTemplateColumns: `auto repeat(${slugs.length}, minmax(0, 1fr))` }}>
            <div /> {/* spacer for stat-label column */}
            {slugs.map((slug, i) => {
              const d = details[slug];
              return (
                <div key={slug} className="flex items-start justify-between gap-2 px-3 py-2 border border-border rounded-lg" style={{ borderColor: d ? `${SERIES_COLORS[i]}` : undefined }}>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {d ? (
                        <Link href={`/players/${slug}`} className="hover:text-primary transition-colors">
                          {d.player.name}
                        </Link>
                      ) : slug}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                      {d?.player.mlbTeam ?? '???'}
                      {d?.player.fantasyTeam && d.player.teamId != null && (
                        <>
                          {' · '}
                          <Link href={`/teams/${d.player.teamId}`} className="hover:text-primary transition-colors">
                            {d.player.fantasyTeam}
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => removeSlug(slug)}
                    aria-label={`Remove ${d?.player.name ?? slug}`}
                    className="text-muted-foreground hover:text-foreground text-base leading-none w-6 h-6 rounded hover:bg-muted shrink-0 flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          {/* AVG chart */}
          {chartData.length > 0 && (
            <div className="border border-border rounded-lg p-3 sm:p-4">
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="text-sm font-medium">Cumulative Batting Average</h2>
                <span className="text-[10px] text-muted-foreground">forward-filled across rest days</span>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                  <YAxis
                    tickFormatter={v => fmtRate(v)}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 12 }}
                    formatter={(value, name) => {
                      const v = typeof value === 'number' ? value : Number(value);
                      const slug = String(name);
                      return [fmtRate(Number.isFinite(v) ? v : 0), details[slug]?.player.name ?? slug];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value) => {
                    const slug = String(value);
                    return details[slug]?.player.name ?? slug;
                  }} />
                  {slugs.map((slug, i) => (
                    <Line
                      key={slug}
                      type="monotone"
                      dataKey={slug}
                      stroke={SERIES_COLORS[i]}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Side-by-side season totals */}
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/40">
                <tr className="border-b border-border">
                  <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2 w-16">Stat</th>
                  {slugs.map((slug, i) => (
                    <th key={slug} className="text-right text-[11px] font-medium px-3 py-2" style={{ color: SERIES_COLORS[i] }}>
                      {details[slug]?.player.name?.split(' ').slice(-1)[0] ?? slug}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {STAT_ROWS.map(row => {
                  // Highlight the leader for this stat (parsed numerically, rate stats included).
                  const values: number[] = slugs.map(s => {
                    const t = details[s]?.seasonTotals;
                    if (!t) return -Infinity;
                    const v = row.fn(t);
                    return parseFloat(v.startsWith('.') ? `0${v}` : v);
                  });
                  const maxVal = Math.max(...values.filter(n => Number.isFinite(n)));
                  return (
                    <tr key={row.label} className="border-b border-border/40 last:border-b-0">
                      <td className="px-3 py-1.5 text-[11px] text-muted-foreground tabular-nums">{row.label}</td>
                      {slugs.map((slug, i) => {
                        const t = details[slug]?.seasonTotals;
                        const display = t ? row.fn(t) : '—';
                        const isLeader = t && values[i] === maxVal && Number.isFinite(maxVal);
                        return (
                          <td
                            key={slug}
                            className={`px-3 py-1.5 text-right text-xs tabular-nums ${isLeader ? 'font-semibold' : ''}`}
                            style={isLeader ? { color: SERIES_COLORS[i] } : undefined}
                          >
                            {display}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
