'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, ArrowRight } from 'lucide-react';

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
  roster: Array<{ id: number; name: string; mlbId: number; draftRound: number; mlbTeam: string; position: string }>;
  periods: PeriodResult[];
}

export default function TeamDetailPage() {
  const params = useParams();
  const teamId = params.teamId as string;
  const [data, setData] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/teams/${teamId}`).then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, [teamId]);

  if (loading) return <div className="text-muted-foreground">Loading team...</div>;
  if (!data?.team) return <div className="text-muted-foreground">Team not found</div>;

  const id = parseInt(teamId);

  return (
    <div className="space-y-6">
      {/* Header with nav */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/standings" className="text-xs text-muted-foreground hover:text-foreground">Standings</Link>
            <span className="text-xs text-muted-foreground">/</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{data.team.name}</h1>
          <p className="text-muted-foreground text-sm">13 players &middot; Best 10 count</p>
        </div>
        <div className="flex gap-2">
          {id > 1 && (
            <Link href={`/teams/${id - 1}`} className="p-2 rounded-lg border border-border hover:bg-accent">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          )}
          {id < 8 && (
            <Link href={`/teams/${id + 1}`} className="p-2 rounded-lg border border-border hover:bg-accent">
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>

      {/* Period Score Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {data.periods.map(pr => (
          <Card key={pr.period.id} className="p-4 bg-card border-border">
            <p className="text-xs text-muted-foreground font-medium">{pr.period.name}</p>
            <p className="text-3xl font-bold font-mono mt-1 text-primary">{pr.bestBallScore}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {pr.period.startDate} to {pr.period.endDate}
            </p>
          </Card>
        ))}
      </div>

      {/* Roster by Period */}
      <Tabs defaultValue="period-0">
        <TabsList className="bg-muted/50">
          {data.periods.map((pr, i) => (
            <TabsTrigger key={pr.period.id} value={`period-${i}`}>
              {pr.period.name.replace(' Third', '')}
            </TabsTrigger>
          ))}
        </TabsList>

        {data.periods.map((pr, i) => (
          <TabsContent key={pr.period.id} value={`period-${i}`}>
            <Card className="bg-card border-border overflow-hidden mt-4">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left text-xs font-medium text-muted-foreground p-4 w-8"></th>
                    <th className="text-left text-xs font-medium text-muted-foreground p-4">Player</th>
                    <th className="text-right text-xs font-medium text-muted-foreground p-4">GP</th>
                    <th className="text-right text-xs font-medium text-muted-foreground p-4">TB</th>
                    <th className="text-right text-xs font-medium text-muted-foreground p-4">SB</th>
                    <th className="text-right text-xs font-medium text-muted-foreground p-4">BB</th>
                    <th className="text-right text-xs font-medium text-muted-foreground p-4">HBP</th>
                    <th className="text-right text-xs font-medium text-muted-foreground p-4">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {pr.playerScores.map((ps, idx) => {
                    const isCounting = pr.countingPlayerIds.includes(ps.playerId);
                    return (
                      <tr key={ps.playerId} className={`border-b border-border/50 transition-colors ${
                        isCounting ? 'hover:bg-accent/30' : 'opacity-40'
                      }`}>
                        <td className="p-4">
                          <div className={`w-2.5 h-2.5 rounded-full ${
                            isCounting ? 'bg-primary' : 'bg-muted-foreground/30'
                          }`} />
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{ps.playerName}</span>
                            {idx === 0 && isCounting && (
                              <Badge variant="default" className="text-[9px] px-1.5">MVP</Badge>
                            )}
                            {!isCounting && (
                              <Badge variant="secondary" className="text-[9px] px-1.5">Bench</Badge>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-right text-sm font-mono text-muted-foreground">{ps.gamesPlayed}</td>
                        <td className="p-4 text-right text-sm font-mono">{ps.totalBases}</td>
                        <td className="p-4 text-right text-sm font-mono">{ps.stolenBases}</td>
                        <td className="p-4 text-right text-sm font-mono">{ps.walks}</td>
                        <td className="p-4 text-right text-sm font-mono">{ps.hbp}</td>
                        <td className="p-4 text-right text-sm font-bold font-mono text-primary">{ps.totalScore}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/20">
                    <td colSpan={7} className="p-4 text-sm font-semibold">Best Ball Total (Top 10)</td>
                    <td className="p-4 text-right text-sm font-bold font-mono text-primary">{pr.bestBallScore}</td>
                  </tr>
                </tfoot>
              </table>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Draft Order */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Draft Order</h2>
        <Card className="bg-card border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-xs font-medium text-muted-foreground p-4 w-16">Round</th>
                <th className="text-left text-xs font-medium text-muted-foreground p-4">Player</th>
              </tr>
            </thead>
            <tbody>
              {data.roster.map(p => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                  <td className="p-4 text-sm font-mono text-muted-foreground">{p.draftRound}</td>
                  <td className="p-4 text-sm font-medium">{p.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
