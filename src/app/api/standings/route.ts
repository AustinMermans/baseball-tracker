import { NextResponse } from 'next/server';
import { db } from '@/db';
import { teams, players, dailyStats, seasonPeriods } from '@/db/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { computeBestBall, type PlayerPeriodScore } from '@/lib/scoring';

export async function GET() {
  try {
    const allTeams = await db.select().from(teams);
    const allPeriods = await db.select().from(seasonPeriods);

    const standings = [];

    for (const team of allTeams) {
      const teamPlayers = await db.select().from(players)
        .where(and(eq(players.teamId, team.id), eq(players.isActive, 1)));

      const periodResults = [];
      let cumulativeScore = 0;

      for (const period of allPeriods) {
        const playerScores: PlayerPeriodScore[] = [];

        for (const player of teamPlayers) {
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
          periodId: period.id,
          periodName: period.name,
          bestBallScore: bestBall.bestBallScore,
          countingPlayerIds: bestBall.countingPlayerIds,
          benchPlayerIds: bestBall.benchPlayerIds,
        });

        cumulativeScore += bestBall.bestBallScore;
      }

      standings.push({
        team: { id: team.id, name: team.name },
        periods: periodResults,
        cumulativeScore,
      });
    }

    // Sort by cumulative score descending
    standings.sort((a, b) => b.cumulativeScore - a.cumulativeScore);

    return NextResponse.json({ standings, periods: allPeriods });
  } catch (error) {
    console.error('Standings error:', error);
    return NextResponse.json({ error: 'Failed to fetch standings' }, { status: 500 });
  }
}
