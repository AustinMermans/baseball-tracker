'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { fetchData } from '@/lib/data';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Standing {
  team: { id: number; name: string };
  periods: Array<{
    periodId: number;
    periodName: string;
    bestBallScore: number;
  }>;
  cumulativeScore: number;
}

export default function StandingsPage() {
  const [data, setData] = useState<{ standings: Standing[]; periods: Array<{ id: number; name: string; startDate: string; endDate: string }> } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData<typeof data>('/api/standings').then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-muted-foreground">Loading standings...</div>;

  const standings = data?.standings || [];
  const periods = data?.periods || [];

  const getPeriodStandings = (periodIdx: number) => {
    return [...standings].sort((a, b) =>
      b.periods[periodIdx].bestBallScore - a.periods[periodIdx].bestBallScore
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Standings</h1>
        <p className="text-muted-foreground text-sm">Period and cumulative standings</p>
      </div>

      <Tabs defaultValue="cumulative">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="cumulative">Cumulative</TabsTrigger>
          {periods.map((p, i) => (
            <TabsTrigger key={p.id} value={`period-${i}`}>
              {p.name.replace(' Third', '')}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="cumulative">
          <Card className="bg-card border-border overflow-hidden mt-4">
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
                        idx === 0 ? 'text-yellow-500' : idx === 1 ? 'text-gray-400' : idx === 2 ? 'text-amber-600' : 'text-muted-foreground'
                      }`}>{idx + 1}</span>
                    </td>
                    <td className="p-4">
                      <Link href={`/teams/${s.team.id}`} className="font-medium text-sm hover:text-primary">{s.team.name}</Link>
                    </td>
                    {s.periods.map(p => (
                      <td key={p.periodId} className="p-4 text-right text-sm font-mono">{p.bestBallScore}</td>
                    ))}
                    <td className="p-4 text-right text-sm font-bold font-mono text-primary">{s.cumulativeScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        {periods.map((period, periodIdx) => (
          <TabsContent key={period.id} value={`period-${periodIdx}`}>
            <Card className="bg-card border-border overflow-hidden mt-4">
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-sm">{period.name}</h3>
                <p className="text-xs text-muted-foreground">{period.startDate} to {period.endDate}</p>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left text-xs font-medium text-muted-foreground p-4 w-12">#</th>
                    <th className="text-left text-xs font-medium text-muted-foreground p-4">Team</th>
                    <th className="text-right text-xs font-medium text-muted-foreground p-4">Best Ball Score</th>
                  </tr>
                </thead>
                <tbody>
                  {getPeriodStandings(periodIdx).map((s, idx) => (
                    <tr key={s.team.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                      <td className="p-4">
                        <span className={`text-sm font-bold ${
                          idx === 0 ? 'text-yellow-500' : idx === 1 ? 'text-gray-400' : idx === 2 ? 'text-amber-600' : 'text-muted-foreground'
                        }`}>{idx + 1}</span>
                      </td>
                      <td className="p-4">
                        <Link href={`/teams/${s.team.id}`} className="font-medium text-sm hover:text-primary">{s.team.name}</Link>
                      </td>
                      <td className="p-4 text-right text-sm font-bold font-mono text-primary">
                        {s.periods[periodIdx].bestBallScore}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
