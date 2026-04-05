import { NextResponse } from 'next/server';
import { db } from '@/db';
import { players, dailyStats } from '@/db/schema';
import { eq, sql, asc } from 'drizzle-orm';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const teamId = parseInt(params.id);

    // Get daily totals per player for this team
    const daily = await db.select({
      gameDate: dailyStats.gameDate,
      playerId: dailyStats.playerId,
      playerName: players.name,
      fantasyScore: dailyStats.fantasyScore,
      totalBases: dailyStats.totalBases,
      stolenBases: dailyStats.stolenBases,
      walks: dailyStats.walks,
      hbp: dailyStats.hbp,
    })
      .from(dailyStats)
      .innerJoin(players, eq(dailyStats.playerId, players.id))
      .where(eq(players.teamId, teamId))
      .orderBy(asc(dailyStats.gameDate));

    // Also compute daily team totals (sum of all players per day)
    const teamDaily = await db.select({
      gameDate: dailyStats.gameDate,
      totalScore: sql<number>`SUM(${dailyStats.fantasyScore})`,
      totalTB: sql<number>`SUM(${dailyStats.totalBases})`,
      totalSB: sql<number>`SUM(${dailyStats.stolenBases})`,
      totalBB: sql<number>`SUM(${dailyStats.walks})`,
      totalHBP: sql<number>`SUM(${dailyStats.hbp})`,
      playersActive: sql<number>`COUNT(${dailyStats.id})`,
    })
      .from(dailyStats)
      .innerJoin(players, eq(dailyStats.playerId, players.id))
      .where(eq(players.teamId, teamId))
      .groupBy(dailyStats.gameDate)
      .orderBy(asc(dailyStats.gameDate));

    return NextResponse.json({ playerDaily: daily, teamDaily });
  } catch (error) {
    console.error('Daily stats error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
