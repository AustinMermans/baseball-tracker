import { NextResponse } from 'next/server';
import { db } from '@/db';
import { teams, players, dailyStats, seasonPeriods } from '@/db/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { computeBestBall, type PlayerPeriodScore } from '@/lib/scoring';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const teamId = parseInt(params.id);
    const team = await db.select().from(teams).where(eq(teams.id, teamId));
    if (team.length === 0) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    const roster = await db.select().from(players).where(eq(players.teamId, teamId));
    const allPeriods = await db.select().from(seasonPeriods);

    const periodResults = [];
    for (const period of allPeriods) {
      const stats = await db.select({
        playerId: dailyStats.playerId,
        totalScore: sql<number>`COALESCE(SUM(${dailyStats.fantasyScore}), 0)`,
        gamesPlayed: sql<number>`COUNT(${dailyStats.id})`,
        totalBases: sql<number>`COALESCE(SUM(${dailyStats.totalBases}), 0)`,
        stolenBases: sql<number>`COALESCE(SUM(${dailyStats.stolenBases}), 0)`,
        walks: sql<number>`COALESCE(SUM(${dailyStats.walks}), 0)`,
        hbp: sql<number>`COALESCE(SUM(${dailyStats.hbp}), 0)`,
      })
        .from(dailyStats)
        .where(and(
          sql`${dailyStats.playerId} IN (SELECT id FROM players WHERE team_id = ${teamId})`,
          gte(dailyStats.gameDate, period.startDate),
          lte(dailyStats.gameDate, period.endDate),
        ))
        .groupBy(dailyStats.playerId);

      const statsMap = new Map(stats.map(s => [s.playerId, s]));
      const playerScores: PlayerPeriodScore[] = roster.map(player => {
        const s = statsMap.get(player.id);
        return {
          playerId: player.id, playerName: player.name,
          totalScore: s?.totalScore ?? 0, gamesPlayed: s?.gamesPlayed ?? 0,
          totalBases: s?.totalBases ?? 0, stolenBases: s?.stolenBases ?? 0,
          walks: s?.walks ?? 0, hbp: s?.hbp ?? 0,
        };
      });

      const bestBall = computeBestBall(playerScores);
      periodResults.push({
        period, bestBallScore: bestBall.bestBallScore,
        playerScores: playerScores.sort((a, b) => b.totalScore - a.totalScore),
        countingPlayerIds: bestBall.countingPlayerIds,
        benchPlayerIds: bestBall.benchPlayerIds,
      });
    }

    return NextResponse.json({
      team: team[0],
      roster: roster.sort((a, b) => (a.draftRound ?? 99) - (b.draftRound ?? 99)),
      periods: periodResults,
    });
  } catch (error) {
    console.error('Team detail error:', error);
    return NextResponse.json({ error: 'Failed to fetch team' }, { status: 500 });
  }
}
