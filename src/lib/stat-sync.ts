import { db } from '@/db';
import { players, dailyStats } from '@/db/schema';
import { getSchedule, getBoxscoreBatting, type BattingStats } from './mlb-api';
import { calcFantasyScore } from './scoring';
import { eq } from 'drizzle-orm';

export async function syncDate(date: string): Promise<{ synced: number; games: number }> {
  const rosteredPlayers = await db.select({
    id: players.id,
    mlbId: players.mlbId,
  }).from(players).where(eq(players.isActive, 1));

  const mlbIdToPlayerId = new Map<number, number>();
  for (const p of rosteredPlayers) {
    mlbIdToPlayerId.set(p.mlbId, p.id);
  }

  const games = await getSchedule(date);
  const completedGames = games.filter(g => g.status.statusCode === 'F');
  if (completedGames.length === 0) return { synced: 0, games: 0 };

  const playerDayStats = new Map<number, BattingStats>();

  for (const game of completedGames) {
    const boxscore = await getBoxscoreBatting(game.gamePk);
    for (const [mlbId, stats] of boxscore) {
      if (!mlbIdToPlayerId.has(mlbId)) continue;
      const existing = playerDayStats.get(mlbId);
      if (existing) {
        existing.totalBases += stats.totalBases;
        existing.stolenBases += stats.stolenBases;
        existing.baseOnBalls += stats.baseOnBalls;
        existing.hitByPitch += stats.hitByPitch;
        existing.atBats += stats.atBats;
        existing.hits += stats.hits;
        existing.homeRuns += stats.homeRuns;
        existing.runs += stats.runs;
        existing.rbi += stats.rbi;
      } else {
        playerDayStats.set(mlbId, { ...stats });
      }
    }
  }

  let synced = 0;
  for (const [mlbId, stats] of playerDayStats) {
    const playerId = mlbIdToPlayerId.get(mlbId)!;
    const fantasyScore = calcFantasyScore(
      stats.totalBases, stats.stolenBases, stats.baseOnBalls, stats.hitByPitch
    );

    await db.insert(dailyStats).values({
      playerId,
      gameDate: date,
      totalBases: stats.totalBases,
      stolenBases: stats.stolenBases,
      walks: stats.baseOnBalls,
      hbp: stats.hitByPitch,
      fantasyScore,
    }).onConflictDoUpdate({
      target: [dailyStats.playerId, dailyStats.gameDate],
      set: {
        totalBases: stats.totalBases,
        stolenBases: stats.stolenBases,
        walks: stats.baseOnBalls,
        hbp: stats.hitByPitch,
        fantasyScore,
      },
    });
    synced++;
  }

  return { synced, games: completedGames.length };
}

export async function syncDateRange(startDate: string, endDate: string): Promise<{
  totalSynced: number;
  totalGames: number;
  dates: number;
}> {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let totalSynced = 0;
  let totalGames = 0;
  let dates = 0;

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const result = await syncDate(dateStr);
    totalSynced += result.synced;
    totalGames += result.games;
    dates++;
  }

  return { totalSynced, totalGames, dates };
}
