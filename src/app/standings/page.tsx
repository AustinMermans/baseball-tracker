'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchData } from '@/lib/data';

interface Standing {
  team: { id: number; name: string };
  periods: Array<{ periodId: number; periodName: string; bestBallScore: number }>;
  cumulativeScore: number;
}

type StandingsData = {
  standings: Standing[];
  periods: Array<{ id: number; name: string; startDate: string; endDate: string }>;
};

export default function StandingsPage() {
  const [data, setData] = useState<StandingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'cumulative' | number>('cumulative');

  useEffect(() => {
    fetchData<StandingsData>('/api/standings').then(setData).finally(() => setLoading(false));
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

  const displayStandings = view === 'cumulative'
    ? standings
    : [...standings].sort((a, b) =>
        b.periods[view as number].bestBallScore - a.periods[view as number].bestBallScore
      );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Standings</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Period and cumulative rankings</p>
      </div>

      {/* View toggles */}
      <div className="flex gap-1">
        <button
          onClick={() => setView('cumulative')}
          className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
            view === 'cumulative'
              ? 'bg-accent text-accent-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Cumulative
        </button>
        {periods.map((p, i) => (
          <button
            key={p.id}
            onClick={() => setView(i)}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              view === i
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {p.name.replace(' Third', '')}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left text-[11px] font-medium text-muted-foreground px-4 py-2.5 w-10"></th>
              <th className="text-left text-[11px] font-medium text-muted-foreground px-4 py-2.5">Team</th>
              {view === 'cumulative' ? (
                <>
                  {periods.map(p => (
                    <th key={p.id} className="text-right text-[11px] font-medium text-muted-foreground px-4 py-2.5">
                      {p.name.replace(' Third', '')}
                    </th>
                  ))}
                  <th className="text-right text-[11px] font-medium text-muted-foreground px-4 py-2.5">Total</th>
                </>
              ) : (
                <th className="text-right text-[11px] font-medium text-muted-foreground px-4 py-2.5">Score</th>
              )}
            </tr>
          </thead>
          <tbody>
            {displayStandings.map((s, idx) => (
              <tr key={s.team.id} className={`border-b border-border/50 hover:bg-muted/30 ${idx === 0 ? 'bg-accent/20' : ''}`}>
                <td className="px-4 py-2.5">
                  <span className={`text-xs tabular-nums ${idx === 0 ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
                    {idx + 1}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <Link href={`/teams/${s.team.id}`} className="text-sm font-medium hover:text-primary">
                    {s.team.name}
                  </Link>
                </td>
                {view === 'cumulative' ? (
                  <>
                    {s.periods.map(p => (
                      <td key={p.periodId} className="px-4 py-2.5 text-right text-sm tabular-nums">
                        {p.bestBallScore || '—'}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums font-semibold">
                      {s.cumulativeScore}
                    </td>
                  </>
                ) : (
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums font-semibold">
                    {s.periods[view as number].bestBallScore}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
