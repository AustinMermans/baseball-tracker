import { NextResponse } from 'next/server';
import { db } from '@/db';
import { teams, players, dailyStats } from '@/db/schema';
import { eq, lte, sql } from 'drizzle-orm';
import { computeBestBall, type PlayerPeriodScore } from '@/lib/scoring';

export async function GET() {
  try {
    const allTeams = await db.select().from(teams);
    // Get all distinct game dates
    const dates = await db.selectDistinct({ gameDate: dailyStats.gameDate })
      .from(dailyStats)
      .orderBy(dailyStats.gameDate);

    // Group dates into weeks (7-day buckets starting from first game)
    const allDates = dates.map(d => d.gameDate);
    if (allDates.length === 0) {
      return NextResponse.json({ teamRankings: [], playerRankings: [], weeks: [] });
    }

    const firstDate = new Date(allDates[0]);
    const weeks: { label: string; endDate: string }[] = [];
    const weekStart = new Date(firstDate);

    const fmtShort = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

    while (weekStart.toISOString().split('T')[0] <= allDates[allDates.length - 1]) {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const startStr = weekStart.toISOString().split('T')[0];
      const endStr = weekEnd.toISOString().split('T')[0];
      const actualEnd = endStr > allDates[allDates.length - 1] ? allDates[allDates.length - 1] : endStr;
      // Only include weeks that have at least one game date
      if (allDates.some(d => d >= startStr && d <= endStr)) {
        weeks.push({
          label: `Wk ${weeks.length + 1} (${fmtShort(weekStart)}–${fmtShort(new Date(actualEnd))})`,
          endDate: actualEnd,
        });
      }
      weekStart.setDate(weekStart.getDate() + 7);
    }

    // For each week end date, compute cumulative best-ball scores per team
    const teamRankings: Array<{
      teamId: number;
      teamName: string;
      weeks: Array<{ week: string; score: number; rank: number }>;
    }> = allTeams.map(t => ({ teamId: t.id, teamName: t.name, weeks: [] }));

    for (const week of weeks) {
      // Get cumulative stats per player up to this week's end date
      const stats = await db.select({
        playerId: dailyStats.playerId,
        playerName: players.name,
        teamId: players.teamId,
        totalScore: sql<number>`COALESCE(SUM(${dailyStats.fantasyScore}), 0)`,
        gamesPlayed: sql<number>`COUNT(${dailyStats.id})`,
        totalBases: sql<number>`COALESCE(SUM(${dailyStats.totalBases}), 0)`,
        stolenBases: sql<number>`COALESCE(SUM(${dailyStats.stolenBases}), 0)`,
        walks: sql<number>`COALESCE(SUM(${dailyStats.walks}), 0)`,
        hbp: sql<number>`COALESCE(SUM(${dailyStats.hbp}), 0)`,
      })
        .from(dailyStats)
        .innerJoin(players, eq(dailyStats.playerId, players.id))
        .where(lte(dailyStats.gameDate, week.endDate))
        .groupBy(dailyStats.playerId);

      const playersByTeam = new Map<number, PlayerPeriodScore[]>();
      for (const s of stats) {
        const tid = s.teamId ?? 0;
        if (!playersByTeam.has(tid)) playersByTeam.set(tid, []);
        playersByTeam.get(tid)!.push(s as PlayerPeriodScore);
      }

      // Compute best-ball score per team
      const teamScores = allTeams.map(t => ({
        teamId: t.id,
        score: computeBestBall(playersByTeam.get(t.id) || []).bestBallScore,
      })).sort((a, b) => b.score - a.score);

      // Assign ranks
      teamScores.forEach((ts, idx) => {
        const entry = teamRankings.find(tr => tr.teamId === ts.teamId)!;
        entry.weeks.push({ week: week.label, score: ts.score, rank: idx + 1 });
      });
    }

    // Dynamic top 10 players - track anyone who appears in top 10 any week
    // Players outside top 10 get rank 13 (off-chart) so lines curve in/out
    const OFF_CHART_RANK = 13;
    const weeklyTop10 = new Map<string, Array<{ playerId: number; playerName: string; totalScore: number; rank: number }>>();
    const everTop10 = new Set<number>();

    for (const week of weeks) {
      const stats = await db.select({
        playerId: dailyStats.playerId,
        playerName: players.name,
        totalScore: sql<number>`COALESCE(SUM(${dailyStats.fantasyScore}), 0)`,
      })
        .from(dailyStats)
        .innerJoin(players, eq(dailyStats.playerId, players.id))
        .where(lte(dailyStats.gameDate, week.endDate))
        .groupBy(dailyStats.playerId)
        .orderBy(sql`SUM(${dailyStats.fantasyScore}) DESC`);

      const ranked = stats.map((s, idx) => ({ ...s, rank: idx + 1 }));
      weeklyTop10.set(week.label, ranked);
      ranked.slice(0, 10).forEach(s => everTop10.add(s.playerId));
    }

    // Build rankings for all players who were ever in the top 10
    const playerRankings: Array<{
      playerId: number;
      playerName: string;
      weeks: Array<{ week: string; score: number; rank: number }>;
    }> = [];

    for (const pid of everTop10) {
      let playerName = '';
      const weekData: Array<{ week: string; score: number; rank: number }> = [];

      for (const week of weeks) {
        const ranked = weeklyTop10.get(week.label) || [];
        const entry = ranked.find(r => r.playerId === pid);
        if (entry) {
          playerName = entry.playerName;
          weekData.push({
            week: week.label,
            score: entry.totalScore,
            rank: entry.rank <= 10 ? entry.rank : OFF_CHART_RANK,
          });
        }
      }

      if (playerName) {
        playerRankings.push({ playerId: pid, playerName, weeks: weekData });
      }
    }

    // Sort by best rank achieved
    playerRankings.sort((a, b) => {
      const bestA = Math.min(...a.weeks.map(w => w.rank));
      const bestB = Math.min(...b.weeks.map(w => w.rank));
      return bestA - bestB;
    });

    return NextResponse.json({
      teamRankings,
      playerRankings,
      weeks: weeks.map(w => w.label),
    });
  } catch (error) {
    console.error('Rankings error:', error);
    return NextResponse.json({ error: 'Failed to fetch rankings' }, { status: 500 });
  }
}
