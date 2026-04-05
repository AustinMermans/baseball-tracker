'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { fetchData } from '@/lib/data';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

interface PlayerScore {
  playerId: number;
  playerName: string;
  totalScore: number;
  gamesPlayed: number;
  totalBases: number;
  stolenBases: number;
  walks: number;
  hbp: number;
}

interface PeriodResult {
  period: { id: number; name: string; startDate: string; endDate: string };
  bestBallScore: number;
  playerScores: PlayerScore[];
  countingPlayerIds: number[];
  benchPlayerIds: number[];
}

interface TeamDetail {
  team: { id: number; name: string };
  roster: Array<{ id: number; name: string; draftRound: number }>;
  periods: PeriodResult[];
}

interface DailyData {
  teamDaily: Array<{
    gameDate: string;
    totalScore: number;
    totalTB: number;
    totalSB: number;
    totalBB: number;
    totalHBP: number;
    playersActive: number;
  }>;
}

const teamNames = ['Cole', 'Markus', 'J Mill', 'Ryan', 'Joey', 'Jack', 'Austin', 'Bobby'];

export default function TeamDetailPage() {
  const params = useParams();
  const teamId = params.teamId as string;
  const [data, setData] = useState<TeamDetail | null>(null);
  const [daily, setDaily] = useState<DailyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePeriod, setActivePeriod] = useState(0);

  useEffect(() => {
    Promise.all([
      fetchData<TeamDetail>(`/api/teams/${teamId}`),
      fetch(`/api/teams/${teamId}/daily`).then(r => r.json()).catch(() => null),
    ]).then(([teamData, dailyData]) => {
      setData(teamData);
      setDaily(dailyData);
    }).finally(() => setLoading(false));
  }, [teamId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-48 bg-muted rounded animate-pulse" />
        <div className="h-64 bg-muted/50 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!data?.team) return <p className="text-muted-foreground text-sm">Team not found</p>;

  const id = parseInt(teamId);
  const pr = data.periods[activePeriod];
  const cumulativeScore = data.periods.reduce((sum, p) => sum + p.bestBallScore, 0);

  // Build cumulative chart data
  const chartData = daily?.teamDaily?.map(d => ({
    date: d.gameDate.slice(5), // MM-DD
    score: d.totalScore,
    tb: d.totalTB,
    sb: d.totalSB,
    bb: d.totalBB,
  })) || [];

  // Build running total
  let runningTotal = 0;
  const cumulativeChart = chartData.map(d => {
    runningTotal += d.score;
    return { ...d, cumulative: runningTotal };
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <Link href="/standings" className="hover:text-foreground">Standings</Link>
          <span>/</span>
        </div>
        <h1 className="text-lg font-semibold">{data.team.name}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {cumulativeScore} total points &middot; 13 rostered, best 10 count
        </p>
        <div className="flex flex-wrap gap-1 mt-3">
          {teamNames.map((name, i) => (
            <Link
              key={i}
              href={`/teams/${i + 1}`}
              className={`px-2 py-1 text-[11px] rounded transition-colors ${
                i + 1 === id
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {name}
            </Link>
          ))}
        </div>
      </div>

      {/* Score summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {data.periods.map((p, i) => (
          <button
            key={p.period.id}
            onClick={() => setActivePeriod(i)}
            className={`flex-1 p-3 rounded-lg border text-left transition-colors ${
              i === activePeriod
                ? 'border-primary/30 bg-accent/20'
                : 'border-border hover:bg-muted/50'
            }`}
          >
            <span className="text-[11px] text-muted-foreground">{p.period.name}</span>
            <p className={`text-xl tabular-nums font-semibold mt-0.5 ${
              i === activePeriod ? 'text-primary' : ''
            }`}>
              {p.bestBallScore}
            </p>
          </button>
        ))}
        <div className="flex-1 p-3 rounded-lg border border-border bg-muted/30">
          <span className="text-[11px] text-muted-foreground">Cumulative</span>
          <p className="text-xl tabular-nums font-semibold mt-0.5">{cumulativeScore}</p>
        </div>
      </div>

      {/* Trend Chart */}
      {cumulativeChart.length > 0 && (
        <div>
          <h2 className="text-sm font-medium mb-3">Scoring Trend</h2>
          <div className="border border-border rounded-lg p-4">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={cumulativeChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  width={35}
                />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                  name="Cumulative"
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={1.5}
                  dot={false}
                  name="Daily"
                  strokeDasharray="4 2"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Roster Table */}
      <div>
        <h2 className="text-sm font-medium mb-3">
          Roster &middot; {pr?.period.name}
        </h2>
        <div className="border border-border rounded-lg overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left text-[11px] font-medium text-muted-foreground px-4 py-2 w-6"></th>
                <th className="text-left text-[11px] font-medium text-muted-foreground px-4 py-2">Player</th>
                <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">GP</th>
                <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">TB</th>
                <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">SB</th>
                <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">BB</th>
                <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">HBP</th>
                <th className="text-right text-[11px] font-medium text-muted-foreground px-4 py-2">PTS</th>
              </tr>
            </thead>
            <tbody>
              {pr?.playerScores.map((ps, idx) => {
                const counting = pr.countingPlayerIds.includes(ps.playerId);
                return (
                  <tr
                    key={ps.playerId}
                    className={`border-b border-border/50 ${counting ? '' : 'text-muted-foreground'}`}
                  >
                    <td className="px-4 py-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        counting ? 'bg-primary' : 'bg-border'
                      }`} />
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-sm">{ps.playerName}</span>
                      {idx === 0 && counting && (
                        <span className="ml-1.5 text-[10px] text-primary">MVP</span>
                      )}
                      {!counting && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground/60">bench</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                      {ps.gamesPlayed}
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">{ps.totalBases}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">{ps.stolenBases}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">{ps.walks}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">{ps.hbp}</td>
                    <td className="px-4 py-2 text-right text-xs tabular-nums font-semibold">
                      {ps.totalScore}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30">
                <td colSpan={7} className="px-4 py-2 text-xs font-medium">Best Ball Total</td>
                <td className="px-4 py-2 text-right text-xs tabular-nums font-semibold text-primary">
                  {pr?.bestBallScore}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Draft Order */}
      <div>
        <h2 className="text-sm font-medium mb-3">Draft Order</h2>
        <div className="grid grid-cols-13 gap-0 border border-border rounded-lg overflow-hidden">
          {data.roster.map((p, i) => (
            <div key={p.id} className="px-3 py-2 border-b border-border/50 flex items-center justify-between">
              <span className="text-xs text-muted-foreground tabular-nums w-5">{i + 1}.</span>
              <span className="text-xs flex-1">{p.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
