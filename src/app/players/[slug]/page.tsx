'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { fetchData } from '@/lib/data';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  avg, obp, slg, singles, fmtRate,
  cumulativeAvg, rollingAvg, gameByGameAvg,
  type GameLine,
} from '@/lib/stats';

interface GameData {
  gameDate: string;
  gamePk: number | null;
  atBats: number;
  hits: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  totalBases: number;
  stolenBases: number;
  baseOnBalls: number;
  hitByPitch: number;
  runs: number;
  rbi: number;
  strikeouts: number;
  plateAppearances: number;
  sacBunts: number;
  sacFlies: number;
  groundIntoDoublePlay: number;
  groundIntoTriplePlay: number;
  leftOnBase: number;
  groundOuts: number;
  flyOuts: number;
  lineOuts: number;
  popOuts: number;
  airOuts: number;
  catchersInterference: number;
  caughtStealing: number;
  intentionalWalks: number;
  pickoffs: number;
  fantasyScore: number;
}

interface PlayerDetail {
  player: {
    id: number;
    mlbId: number;
    name: string;
    slug: string;
    mlbTeam: string | null;
    position: string | null;
    teamId: number | null;
    fantasyTeam: string;
    draftRound: number | null;
    overallRank: number;
  };
  seasonTotals: {
    gamesPlayed: number;
    atBats: number; hits: number; doubles: number; triples: number;
    homeRuns: number; totalBases: number; stolenBases: number;
    baseOnBalls: number; hitByPitch: number; runs: number; rbi: number;
    strikeouts: number; plateAppearances: number; sacBunts: number;
    sacFlies: number; groundIntoDoublePlay: number; groundIntoTriplePlay: number;
    leftOnBase: number; groundOuts: number; flyOuts: number; lineOuts: number;
    popOuts: number; airOuts: number; catchersInterference: number;
    caughtStealing: number; intentionalWalks: number; pickoffs: number;
    fantasyScore: number;
  };
  games: GameData[];
  navigation: {
    prevSlug: string | null;
    prevName: string | null;
    nextSlug: string | null;
    nextName: string | null;
  };
}

type LineKey = 'cumulative' | '1w' | '2w' | '1m' | '2m' | 'game';

const LINE_CONFIG: { key: LineKey; label: string; days?: number; color: string; dash?: string }[] = [
  { key: 'cumulative', label: 'Cumulative', color: 'hsl(var(--primary))' },
  { key: '1w', label: '1W', days: 7, color: 'hsl(var(--chart-2))', dash: '6 3' },
  { key: '2w', label: '2W', days: 14, color: 'hsl(var(--chart-3))', dash: '6 3' },
  { key: '1m', label: '1M', days: 30, color: 'hsl(var(--chart-4))', dash: '6 3' },
  { key: '2m', label: '2M', days: 60, color: 'hsl(var(--chart-5))', dash: '6 3' },
  { key: 'game', label: 'Game', color: 'hsl(var(--muted-foreground))', dash: '2 2' },
];

export default function PlayerDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [data, setData] = useState<PlayerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeLines, setActiveLines] = useState<Set<LineKey>>(new Set(['cumulative']));
  const [statView, setStatView] = useState<'key' | 'all'>('key');
  const [logView, setLogView] = useState<'key' | 'all'>('key');

  useEffect(() => {
    setLoading(true);
    fetchData<PlayerDetail>(`/api/players/${slug}`)
      .then(setData)
      .finally(() => setLoading(false));
  }, [slug]);

  const toggleLine = (key: LineKey) => {
    setActiveLines(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const chartData = useMemo(() => {
    if (!data?.games.length) return [];
    const games: GameLine[] = data.games.map(g => ({
      gameDate: g.gameDate,
      hits: g.hits,
      atBats: g.atBats,
    }));

    const series: Record<LineKey, { date: string; value: number }[]> = {
      cumulative: cumulativeAvg(games),
      '1w': rollingAvg(games, 7),
      '2w': rollingAvg(games, 14),
      '1m': rollingAvg(games, 30),
      '2m': rollingAvg(games, 60),
      game: gameByGameAvg(games),
    };

    // Merge into single array keyed by date
    return games.map((g, i) => {
      const point: Record<string, string | number> = { date: g.gameDate.slice(5) };
      for (const key of Object.keys(series) as LineKey[]) {
        point[key] = series[key][i]?.value ?? 0;
      }
      return point;
    });
  }, [data?.games]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-48 bg-muted rounded animate-pulse" />
        <div className="h-64 bg-muted/50 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!data?.player) return <p className="text-muted-foreground text-sm">Player not found</p>;

  const { player, seasonTotals: st, navigation: nav } = data;

  const keyStats = [
    { label: 'G', value: st.gamesPlayed },
    { label: 'PA', value: st.plateAppearances },
    { label: 'AB', value: st.atBats },
    { label: 'H', value: st.hits },
    { label: '1B', value: singles(st.hits, st.doubles, st.triples, st.homeRuns) },
    { label: '2B', value: st.doubles },
    { label: '3B', value: st.triples },
    { label: 'HR', value: st.homeRuns },
    { label: 'SB', value: st.stolenBases },
    { label: 'BB', value: st.baseOnBalls },
    { label: 'HBP', value: st.hitByPitch },
    { label: 'SO', value: st.strikeouts },
    { label: 'AVG', value: fmtRate(avg(st.hits, st.atBats)) },
    { label: 'OBP', value: fmtRate(obp(st.hits, st.baseOnBalls, st.hitByPitch, st.atBats, st.sacFlies)) },
    { label: 'SLG', value: fmtRate(slg(st.totalBases, st.atBats)) },
    { label: 'PTS', value: st.fantasyScore },
  ];

  const allStats = [
    ...keyStats.slice(0, -1), // everything except PTS
    { label: 'R', value: st.runs },
    { label: 'RBI', value: st.rbi },
    { label: 'IBB', value: st.intentionalWalks },
    { label: 'CS', value: st.caughtStealing },
    { label: 'SF', value: st.sacFlies },
    { label: 'SAC', value: st.sacBunts },
    { label: 'GIDP', value: st.groundIntoDoublePlay },
    { label: 'LOB', value: st.leftOnBase },
    { label: 'TB', value: st.totalBases },
    { label: 'PTS', value: st.fantasyScore },
  ];

  const displayStats = statView === 'key' ? keyStats : allStats;
  const reversedGames = [...data.games].reverse();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <Link href="/players" className="inline-flex items-center min-h-[32px] -my-1 hover:text-foreground">Players</Link>
          <span>/</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">{player.name}</h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
              <span className="text-xs text-muted-foreground">
                {[player.position, player.mlbTeam].filter(Boolean).join(' · ') || '—'}
              </span>
              {player.teamId != null ? (
                <>
                  <span className="text-xs text-muted-foreground">&middot;</span>
                  <Link href={`/teams/${player.teamId}`} className="inline-flex items-center min-h-[32px] -my-1 text-xs text-muted-foreground hover:text-primary">
                    {player.fantasyTeam}
                  </Link>
                  {player.draftRound != null && (
                    <span className="text-xs text-muted-foreground">(Rd {player.draftRound})</span>
                  )}
                </>
              ) : (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                  Undrafted
                </span>
              )}
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
                #{player.overallRank} overall
              </span>
            </div>
          </div>
        </div>
        {/* Prev / Next */}
        <div className="flex gap-3 mt-3 text-xs">
          {nav.prevSlug ? (
            <Link href={`/players/${nav.prevSlug}`} className="inline-flex items-center min-h-[36px] text-muted-foreground hover:text-foreground">
              &larr; {nav.prevName}
            </Link>
          ) : <span />}
          {nav.nextSlug && (
            <Link href={`/players/${nav.nextSlug}`} className="inline-flex items-center min-h-[36px] text-muted-foreground hover:text-foreground">
              {nav.nextName} &rarr;
            </Link>
          )}
        </div>
      </div>

      {/* BA Trend Chart */}
      {chartData.length > 1 && (
        <div>
          <h2 className="text-sm font-medium mb-3">Batting Average</h2>
          <div className="flex flex-wrap gap-1 mb-3">
            {LINE_CONFIG.map(lc => (
              <button
                key={lc.key}
                onClick={() => toggleLine(lc.key)}
                className={`px-3 min-h-[32px] inline-flex items-center text-[11px] rounded-md transition-colors ${
                  activeLines.has(lc.key)
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {lc.label}
              </button>
            ))}
          </div>
          <div className="border border-border rounded-lg p-4">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  tickFormatter={(v: number) => v.toFixed(3).slice(1)}
                  domain={[0, 'auto']}
                />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                  formatter={(value, name) => [
                    fmtRate(Number(value) || 0),
                    LINE_CONFIG.find(l => l.key === name)?.label ?? String(name),
                  ]}
                />
                {LINE_CONFIG.map(lc =>
                  activeLines.has(lc.key) ? (
                    <Line
                      key={lc.key}
                      type="monotone"
                      dataKey={lc.key}
                      stroke={lc.color}
                      strokeWidth={lc.key === 'cumulative' ? 2 : 1.5}
                      strokeDasharray={lc.dash}
                      dot={lc.key === 'game' ? { r: 2, fill: lc.color } : false}
                      name={lc.key}
                      connectNulls
                    />
                  ) : null
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Season Stat Line */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-sm font-medium">Season Stats</h2>
          <div className="flex gap-1">
            <button
              onClick={() => setStatView('key')}
              className={`px-3 min-h-[32px] inline-flex items-center justify-center text-[11px] rounded transition-colors ${
                statView === 'key' ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
              }`}
            >Key</button>
            <button
              onClick={() => setStatView('all')}
              className={`px-3 min-h-[32px] inline-flex items-center justify-center text-[11px] rounded transition-colors ${
                statView === 'all' ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
              }`}
            >All</button>
          </div>
        </div>
        <div className="border border-border rounded-lg overflow-x-auto">
          <div className="flex min-w-max">
            {displayStats.map(s => (
              <div key={s.label} className="px-3 py-2.5 text-center min-w-[48px]">
                <div className="text-[10px] text-muted-foreground font-medium">{s.label}</div>
                <div className="text-sm tabular-nums font-medium mt-0.5">{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Game Log */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-sm font-medium">Game Log</h2>
          <div className="flex gap-1">
            <button
              onClick={() => setLogView('key')}
              className={`px-3 min-h-[32px] inline-flex items-center justify-center text-[11px] rounded transition-colors ${
                logView === 'key' ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
              }`}
            >Key</button>
            <button
              onClick={() => setLogView('all')}
              className={`px-3 min-h-[32px] inline-flex items-center justify-center text-[11px] rounded transition-colors ${
                logView === 'all' ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
              }`}
            >All</button>
          </div>
        </div>
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px]">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2">Date</th>
                  {logView === 'key' ? (
                    <>
                      <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">AB</th>
                      <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">H</th>
                      <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">HR</th>
                      <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">BB</th>
                      <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">SB</th>
                      <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">AVG</th>
                      <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">PTS</th>
                    </>
                  ) : (
                    <>
                      <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">PA</th>
                      <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">AB</th>
                      <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">H</th>
                      <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">2B</th>
                      <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">3B</th>
                      <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">HR</th>
                      <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">R</th>
                      <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">RBI</th>
                      <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">BB</th>
                      <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">IBB</th>
                      <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">SO</th>
                      <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">SB</th>
                      <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">CS</th>
                      <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">HBP</th>
                      <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">SF</th>
                      <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">AVG</th>
                      <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">PTS</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {reversedGames.map(g => (
                  <tr key={g.gameDate} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-3 py-2 text-xs tabular-nums">{g.gameDate.slice(5)}</td>
                    {logView === 'key' ? (
                      <>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{g.atBats}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{g.hits}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{g.homeRuns}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{g.baseOnBalls}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{g.stolenBases}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                          {fmtRate(avg(g.hits, g.atBats))}
                        </td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums font-semibold">{g.fantasyScore}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{g.plateAppearances}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{g.atBats}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{g.hits}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{g.doubles}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{g.triples}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{g.homeRuns}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{g.runs}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{g.rbi}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{g.baseOnBalls}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{g.intentionalWalks}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{g.strikeouts}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{g.stolenBases}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{g.caughtStealing}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{g.hitByPitch}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{g.sacFlies}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                          {fmtRate(avg(g.hits, g.atBats))}
                        </td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums font-semibold">{g.fantasyScore}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
