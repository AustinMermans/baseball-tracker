import { NextResponse } from 'next/server';
import { db } from '@/db';
import { players, teams } from '@/db/schema';
import { sql } from 'drizzle-orm';

export async function GET() {
  try {
    const allPlayers = await db.select({
      id: players.id,
      mlbId: players.mlbId,
      name: players.name,
      mlbTeam: players.mlbTeam,
      position: players.position,
      teamId: players.teamId,
      draftRound: players.draftRound,
      isActive: players.isActive,
      totalScore: sql<number>`COALESCE((SELECT SUM(fantasy_score) FROM daily_stats WHERE player_id = ${players.id}), 0)`,
      gamesPlayed: sql<number>`COALESCE((SELECT COUNT(*) FROM daily_stats WHERE player_id = ${players.id}), 0)`,
      totalBases: sql<number>`COALESCE((SELECT SUM(total_bases) FROM daily_stats WHERE player_id = ${players.id}), 0)`,
      stolenBases: sql<number>`COALESCE((SELECT SUM(stolen_bases) FROM daily_stats WHERE player_id = ${players.id}), 0)`,
      walks: sql<number>`COALESCE((SELECT SUM(walks) FROM daily_stats WHERE player_id = ${players.id}), 0)`,
      hbp: sql<number>`COALESCE((SELECT SUM(hbp) FROM daily_stats WHERE player_id = ${players.id}), 0)`,
    }).from(players);

    // Get team names
    const allTeams = await db.select().from(teams);
    const teamMap = new Map(allTeams.map(t => [t.id, t.name]));

    const result = allPlayers.map(p => ({
      ...p,
      fantasyTeam: teamMap.get(p.teamId ?? 0) ?? 'Unknown',
    }));

    result.sort((a, b) => b.totalScore - a.totalScore);

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 });
  }
}
