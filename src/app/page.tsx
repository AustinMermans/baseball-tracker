'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { fetchData } from '@/lib/data';
import { Badge } from '@/components/ui/badge';
import { Trophy, TrendingUp, Calendar, Users } from 'lucide-react';

interface Standing {
  team: { id: number; name: string };
  periods: Array<{
    periodId: number;
    periodName: string;
    bestBallScore: number;
  }>;
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
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Loading league data...</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-card animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const standings = data?.standings || [];
  const periods = data?.periods || [];
  const leader = standings[0];

  const today = new Date().toISOString().split('T')[0];
  const currentPeriod = periods.find(p => p.startDate <= today && p.endDate >= today);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          {currentPeriod ? currentPeriod.name : 'Preseason'} &middot; 2026 Season
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 bg-card border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Season Leader</p>
              <p className="text-2xl font-bold mt-1">{leader?.team.name || '---'}</p>
              <p className="text-xs text-primary mt-1">{leader?.cumulativeScore || 0} pts</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-yellow-500" />
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-card border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Current Period</p>
              <p className="text-2xl font-bold mt-1">{currentPeriod?.name.replace(' Third', '') || 'Pre'}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {currentPeriod ? `${currentPeriod.startDate} to ${currentPeriod.endDate}` : 'Season not started'}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-500" />
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-card border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Teams</p>
              <p className="text-2xl font-bold mt-1">8</p>
              <p className="text-xs text-muted-foreground mt-1">104 total players</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-card border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Scoring</p>
              <p className="text-lg font-bold mt-1">Best Ball</p>
              <p className="text-xs text-muted-foreground mt-1">TB + SB + BB + HBP</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-purple-500" />
            </div>
          </div>
        </Card>
      </div>

      {/* Standings Table */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">League Standings</h2>
          <Link href="/standings" className="text-xs text-primary hover:underline">
            View detailed standings
          </Link>
        </div>

        <Card className="bg-card border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left text-xs font-medium text-muted-foreground p-4 w-12">#</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-4">Team</th>
                  {periods.map(p => (
                    <th key={p.id} className="text-right text-xs font-medium text-muted-foreground p-4">
                      {p.name.replace(' Third', '')}
                    </th>
                  ))}
                  <th className="text-right text-xs font-medium text-muted-foreground p-4">Total</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s, idx) => (
                  <tr key={s.team.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <td className="p-4">
                      <span className={`text-sm font-bold ${
                        idx === 0 ? 'text-yellow-500' :
                        idx === 1 ? 'text-gray-400' :
                        idx === 2 ? 'text-amber-600' :
                        'text-muted-foreground'
                      }`}>
                        {idx + 1}
                      </span>
                    </td>
                    <td className="p-4">
                      <Link href={`/teams/${s.team.id}`} className="font-medium text-sm hover:text-primary transition-colors">
                        {s.team.name}
                      </Link>
                    </td>
                    {s.periods.map(p => (
                      <td key={p.periodId} className="p-4 text-right">
                        <span className="text-sm font-mono">{p.bestBallScore}</span>
                      </td>
                    ))}
                    <td className="p-4 text-right">
                      <span className="text-sm font-bold font-mono text-primary">{s.cumulativeScore}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Team Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {standings.map((s, idx) => (
          <Link key={s.team.id} href={`/teams/${s.team.id}`}>
            <Card className="p-4 bg-card border-border hover:border-primary/30 transition-all cursor-pointer group">
              <div className="flex items-center justify-between mb-2">
                <Badge variant={idx < 3 ? 'default' : 'secondary'} className="text-[10px]">
                  #{idx + 1}
                </Badge>
                <span className="text-xs text-muted-foreground font-mono">{s.cumulativeScore}</span>
              </div>
              <p className="font-semibold text-sm group-hover:text-primary transition-colors">{s.team.name}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
