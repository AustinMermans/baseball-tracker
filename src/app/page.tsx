'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchData } from '@/lib/data';

interface Standing {
  team: { id: number; name: string };
  periods: Array<{ periodId: number; periodName: string; bestBallScore: number }>;
  cumulativeScore: number;
}

interface StandingsResponse {
  standings: Standing[];
  periods: Array<{ id: number; name: string; startDate: string; endDate: string }>;
}

export default function Dashboard() {
  const [data, setData] = useState<StandingsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData<StandingsResponse>('/api/standings')
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-48 bg-muted rounded animate-pulse" />
        <div className="h-64 bg-muted/50 rounded-lg animate-pulse" />
      </div>
    );
  }

  const standings = data?.standings || [];
  const periods = data?.periods || [];
  const today = new Date().toISOString().split('T')[0];
  const currentPeriod = periods.find(p => p.startDate <= today && p.endDate >= today);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold">League Overview</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {currentPeriod?.name || 'Preseason'} &middot; Best ball, top 10 of 13 &middot; TB + SB + BB + HBP
        </p>
      </div>

      {/* Standings */}
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left text-[11px] font-medium text-muted-foreground px-4 py-2.5 w-10"></th>
              <th className="text-left text-[11px] font-medium text-muted-foreground px-4 py-2.5">Team</th>
              {periods.map(p => (
                <th key={p.id} className="text-right text-[11px] font-medium text-muted-foreground px-4 py-2.5">
                  {p.name.replace(' Third', '')}
                </th>
              ))}
              <th className="text-right text-[11px] font-medium text-muted-foreground px-4 py-2.5">Total</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, idx) => (
              <tr
                key={s.team.id}
                className={`border-b border-border/60 hover:bg-muted/30 transition-colors ${
                  idx === 0 ? 'bg-accent/30' : ''
                }`}
              >
                <td className="px-4 py-2.5">
                  <span className={`text-xs tabular-nums ${
                    idx === 0 ? 'font-semibold text-primary' : 'text-muted-foreground'
                  }`}>
                    {idx + 1}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <Link
                    href={`/teams/${s.team.id}`}
                    className="text-sm font-medium hover:text-primary transition-colors"
                  >
                    {s.team.name}
                    {idx === 0 && <span className="ml-1.5 text-[10px] text-primary font-normal">leader</span>}
                  </Link>
                </td>
                {s.periods.map(p => (
                  <td key={p.periodId} className="px-4 py-2.5 text-right">
                    <span className="text-sm tabular-nums">{p.bestBallScore || '—'}</span>
                  </td>
                ))}
                <td className="px-4 py-2.5 text-right">
                  <span className={`text-sm tabular-nums font-semibold ${idx === 0 ? 'text-primary' : ''}`}>
                    {s.cumulativeScore}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Period info */}
      <div className="grid grid-cols-3 gap-4">
        {periods.map((p, i) => {
          const isCurrent = p.startDate <= today && p.endDate >= today;
          const leader = [...standings].sort(
            (a, b) => (b.periods[i]?.bestBallScore ?? 0) - (a.periods[i]?.bestBallScore ?? 0)
          )[0];
          return (
            <div
              key={p.id}
              className={`p-4 rounded-lg border ${
                isCurrent ? 'border-primary/30 bg-accent/20' : 'border-border'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium">{p.name}</span>
                {isCurrent && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                    active
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {p.startDate?.slice(5)} to {p.endDate?.slice(5)}
              </p>
              {leader && leader.periods[i]?.bestBallScore > 0 && (
                <p className="text-xs mt-2">
                  <span className="text-muted-foreground">Lead: </span>
                  <span className="font-medium">{leader.team.name}</span>
                  <span className="text-muted-foreground ml-1">({leader.periods[i].bestBallScore})</span>
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
