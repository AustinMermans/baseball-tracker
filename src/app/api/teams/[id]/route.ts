import { NextResponse } from 'next/server';
import { db } from '@/db';
import { teams, players, dailyStats, seasonPeriods } from '@/db/schema';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';
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

    const roster = await db.select().from(players)
      .where(eq(players.teamId, teamId));

    const allPeriods = await db.select().from(seasonPeriods);
    const periodResults = [];

    for (const period of allPeriods) {
      const playerScores: PlayerPeriodScore[] = [];

      for (const player of roster) {
        const stats = await db.select({
          totalScore: sql<number>`COALESCE(SUM(${dailyStats.fantasyScore}), 0)`,
          gamesPlayed: sql<number>`COUNT(${dailyStats.id})`,
          totalBases: sql<number>`COALESCE(SUM(${dailyStats.totalBases}), 0)`,
          stolenBases: sql<number>`COALESCE(SUM(${dailyStats.stolenBases}), 0)`,
          walks: sql<number>`COALESCE(SUM(${dailyStats.walks}), 0)`,
          hbp: sql<number>`COALESCE(SUM(${dailyStats.hbp}), 0)`,
        }).from(dailyStats).where(
          and(
            eq(dailyStats.playerId, player.id),
            gte(dailyStats.gameDate, period.startDate),
            lte(dailyStats.gameDate, period.endDate),
          )
        );

        playerScores.push({
          playerId: player.id,
          playerName: player.name,
          totalScore: stats[0]?.totalScore ?? 0,
          gamesPlayed: stats[0]?.gamesPlayed ?? 0,
          totalBases: stats[0]?.totalBases ?? 0,
          stolenBases: stats[0]?.stolenBases ?? 0,
          walks: stats[0]?.walks ?? 0,
          hbp: stats[0]?.hbp ?? 0,
        });
      }

      const bestBall = computeBestBall(playerScores);
      periodResults.push({
        period,
        bestBallScore: bestBall.bestBallScore,
        playerScores: playerScores.sort((a, b) => b.totalScore - a.totalScore),
        countingPlayerIds: bestBall.countingPlayerIds,
        benchPlayerIds: bestBall.benchPlayerIds,
      });
    }

    // Recent daily stats (last 7 days of activity)
    const recentStats = await db.select({
      gameDate: dailyStats.gameDate,
      playerId: dailyStats.playerId,
      fantasyScore: dailyStats.fantasyScore,
      totalBases: dailyStats.totalBases,
      stolenBases: dailyStats.stolenBases,
      walks: dailyStats.walks,
      hbp: dailyStats.hbp,
    }).from(dailyStats)
      .where(sql`${dailyStats.playerId} IN (SELECT id FROM players WHERE team_id = ${teamId})`)
      .orderBy(desc(dailyStats.gameDate))
      .limit(200);

    return NextResponse.json({
      team: team[0],
      roster: roster.sort((a, b) => (a.draftRound ?? 99) - (b.draftRound ?? 99)),
      periods: periodResults,
      recentStats,
    });
  } catch (error) {
    console.error('Team detail error:', error);
    return NextResponse.json({ error: 'Failed to fetch team' }, { status: 500 });
  }
}
