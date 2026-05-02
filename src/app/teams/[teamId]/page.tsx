'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { fetchData } from '@/lib/data';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { avg, obp, slg, fmtRate } from '@/lib/stats';

interface PlayerScore {
  playerId: number;
  playerName: string;
  slug: string;
  totalScore: number;
  gamesPlayed: number;
  totalBases: number;
  stolenBases: number;
  walks: number;
  hbp: number;
  atBats: number;
  hits: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  runs: number;
  rbi: number;
  strikeouts: number;
  plateAppearances: number;
  sacFlies: number;
  sacBunts: number;
  caughtStealing: number;
  intentionalWalks: number;
  groundIntoDoublePlay: number;
  leftOnBase: number;
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
  roster: Array<{
    id: number;
    name: string;
    slug: string;
    mlbTeam: string | null;
    position: string | null;
    draftRound: number | null;
  }>;
  periods: PeriodResult[];
}

interface CalendarGame {
  date: string;
  gamePk: number;
  away: { abbr: string | null };
  home: { abbr: string | null };
  status: string;
}
interface CalendarShape { games: CalendarGame[] }

const teamNames = ['Cole', 'Markus', 'J Mill', 'Ryan', 'Joey', 'Jack', 'Austin', 'Bobby'];

export default function TeamDetailPage() {
  const params = useParams();
  const teamId = params.teamId as string;
  const [data, setData] = useState<TeamDetail | null>(null);
  const [calendar, setCalendar] = useState<CalendarShape | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePeriod, setActivePeriod] = useState(0);
  const [statsView, setStatsView] = useState<'key' | 'all'>('key');

  useEffect(() => {
    Promise.all([
      fetchData<TeamDetail>(`/api/teams/${teamId}`),
      fetchData<CalendarShape>(`/api/calendar`).catch(() => ({ games: [] })),
    ]).then(([detail, cal]) => {
      setData(detail);
      setCalendar(cal);
    }).finally(() => setLoading(false));
  }, [teamId]);

  // Count remaining (today onward) games per MLB team within the next 7 days.
  // Used for the games-this-week badge on each rostered player.
  const gamesNext7ByMlbTeam = (() => {
    const map = new Map<string, number>();
    if (!calendar) return map;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + 7);
    const todayYmd = today.toISOString().split('T')[0];
    const endYmd = end.toISOString().split('T')[0];
    for (const g of calendar.games) {
      if (g.date < todayYmd || g.date >= endYmd) continue;
      // Don't count games that already finished today.
      if (g.date === todayYmd && g.status === 'F') continue;
      for (const abbr of [g.away.abbr, g.home.abbr]) {
        if (!abbr) continue;
        map.set(abbr, (map.get(abbr) ?? 0) + 1);
      }
    }
    return map;
  })();

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

      {/* Roster Tabs */}
      <Tabs defaultValue="fantasy">
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-sm font-medium">
            Roster &middot; {pr?.period.name}
          </h2>
          <TabsList className="h-7">
            <TabsTrigger value="fantasy" className="text-[11px] px-2.5 py-1 h-auto">Fantasy Scoring</TabsTrigger>
            <TabsTrigger value="stats" className="text-[11px] px-2.5 py-1 h-auto">Player Stats</TabsTrigger>
          </TabsList>
        </div>

        {/* Fantasy Scoring Tab */}
        <TabsContent value="fantasy">
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
                        <Link href={`/players/${ps.slug}`} className="text-sm hover:text-primary transition-colors">
                          {ps.playerName}
                        </Link>
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
        </TabsContent>

        {/* Player Stats Tab */}
        <TabsContent value="stats">
          <div className="flex gap-1 mb-3">
            <button
              onClick={() => setStatsView('key')}
              className={`px-2 py-1 text-[11px] rounded transition-colors ${
                statsView === 'key' ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
              }`}
            >Key</button>
            <button
              onClick={() => setStatsView('all')}
              className={`px-2 py-1 text-[11px] rounded transition-colors ${
                statsView === 'all' ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
              }`}
            >All</button>
          </div>
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px]">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left text-[11px] font-medium text-muted-foreground px-4 py-2">Player</th>
                    {statsView === 'key' ? (
                      <>
                        <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">AB</th>
                        <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">H</th>
                        <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">HR</th>
                        <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">SB</th>
                        <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">BB</th>
                        <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">AVG</th>
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
                        <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">OBP</th>
                        <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2">SLG</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {pr?.playerScores.map(ps => (
                    <tr key={ps.playerId} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-4 py-2">
                        <Link href={`/players/${ps.slug}`} className="text-sm hover:text-primary transition-colors">
                          {ps.playerName}
                        </Link>
                      </td>
                      {statsView === 'key' ? (
                        <>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">{ps.atBats}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">{ps.hits}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">{ps.homeRuns}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">{ps.stolenBases}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">{ps.walks}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                            {fmtRate(avg(ps.hits, ps.atBats))}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">{ps.plateAppearances}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">{ps.atBats}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">{ps.hits}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">{ps.doubles}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">{ps.triples}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">{ps.homeRuns}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">{ps.runs}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">{ps.rbi}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">{ps.walks}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">{ps.intentionalWalks}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">{ps.strikeouts}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">{ps.stolenBases}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">{ps.caughtStealing}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">{ps.hbp}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums">{ps.sacFlies}</td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                            {fmtRate(avg(ps.hits, ps.atBats))}
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                            {fmtRate(obp(ps.hits, ps.walks, ps.hbp, ps.atBats, ps.sacFlies))}
                          </td>
                          <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                            {fmtRate(slg(ps.totalBases, ps.atBats))}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Draft Order */}
      <div>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-medium">Draft Order</h2>
          <span className="text-[10px] text-muted-foreground">games next 7d</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-0 border border-border rounded-lg overflow-hidden">
          {data.roster.map((p, i) => {
            const games7 = p.mlbTeam ? (gamesNext7ByMlbTeam.get(p.mlbTeam) ?? 0) : null;
            return (
              <div key={p.id} className="px-3 py-2 border-b border-border/50 flex items-center gap-2">
                <span className="text-xs text-muted-foreground tabular-nums w-5 shrink-0">{i + 1}.</span>
                <Link href={`/players/${p.slug}`} className="text-xs flex-1 hover:text-primary transition-colors truncate">
                  {p.name}
                </Link>
                {p.mlbTeam && (
                  <span className="text-[9px] text-muted-foreground tabular-nums shrink-0">{p.mlbTeam}</span>
                )}
                {games7 != null && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded tabular-nums shrink-0 ${
                      games7 >= 6 ? 'bg-primary/15 text-primary font-medium'
                        : games7 >= 4 ? 'bg-muted text-foreground'
                        : games7 === 0 ? 'bg-muted/40 text-muted-foreground/60'
                        : 'bg-muted/60 text-muted-foreground'
                    }`}
                    title={`${games7} games in the next 7 days`}
                  >
                    {games7}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
