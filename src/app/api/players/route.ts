import { NextResponse } from 'next/server';
import { db } from '@/db';
import { players, teams, dailyStats } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { slugify } from '@/lib/utils';

export async function GET() {
  try {
    const allPlayers = await db.select().from(players).where(eq(players.isActive, 1));
    const allTeams = await db.select().from(teams);
    const teamMap = new Map(allTeams.map(t => [t.id, t.name]));

    // Aggregate stats with a JOIN query
    const stats = await db.select({
      playerId: dailyStats.playerId,
      totalScore: sql<number>`COALESCE(SUM(${dailyStats.fantasyScore}), 0)`,
      gamesPlayed: sql<number>`COUNT(${dailyStats.id})`,
      totalBases: sql<number>`COALESCE(SUM(${dailyStats.totalBases}), 0)`,
      stolenBases: sql<number>`COALESCE(SUM(${dailyStats.stolenBases}), 0)`,
      walks: sql<number>`COALESCE(SUM(${dailyStats.walks}), 0)`,
      hbp: sql<number>`COALESCE(SUM(${dailyStats.hbp}), 0)`,
      atBats: sql<number>`COALESCE(SUM(${dailyStats.atBats}), 0)`,
      hits: sql<number>`COALESCE(SUM(${dailyStats.hits}), 0)`,
      doubles: sql<number>`COALESCE(SUM(${dailyStats.doubles}), 0)`,
      triples: sql<number>`COALESCE(SUM(${dailyStats.triples}), 0)`,
      homeRuns: sql<number>`COALESCE(SUM(${dailyStats.homeRuns}), 0)`,
      runs: sql<number>`COALESCE(SUM(${dailyStats.runs}), 0)`,
      rbi: sql<number>`COALESCE(SUM(${dailyStats.rbi}), 0)`,
      strikeouts: sql<number>`COALESCE(SUM(${dailyStats.strikeouts}), 0)`,
      plateAppearances: sql<number>`COALESCE(SUM(${dailyStats.plateAppearances}), 0)`,
      sacFlies: sql<number>`COALESCE(SUM(${dailyStats.sacFlies}), 0)`,
      caughtStealing: sql<number>`COALESCE(SUM(${dailyStats.caughtStealing}), 0)`,
      intentionalWalks: sql<number>`COALESCE(SUM(${dailyStats.intentionalWalks}), 0)`,
    }).from(dailyStats).groupBy(dailyStats.playerId);

    const statsMap = new Map(stats.map(s => [s.playerId, s]));

    const result = allPlayers.map(p => {
      const s = statsMap.get(p.id);
      return {
        id: p.id,
        mlbId: p.mlbId,
        name: p.name,
        slug: slugify(p.name),
        mlbTeam: p.mlbTeam,
        position: p.position,
        teamId: p.teamId,
        draftRound: p.draftRound,
        fantasyTeam: teamMap.get(p.teamId ?? 0) ?? 'Unknown',
        totalScore: s?.totalScore ?? 0,
        gamesPlayed: s?.gamesPlayed ?? 0,
        totalBases: s?.totalBases ?? 0,
        stolenBases: s?.stolenBases ?? 0,
        walks: s?.walks ?? 0,
        hbp: s?.hbp ?? 0,
        atBats: s?.atBats ?? 0,
        hits: s?.hits ?? 0,
        doubles: s?.doubles ?? 0,
        triples: s?.triples ?? 0,
        homeRuns: s?.homeRuns ?? 0,
        runs: s?.runs ?? 0,
        rbi: s?.rbi ?? 0,
        strikeouts: s?.strikeouts ?? 0,
        plateAppearances: s?.plateAppearances ?? 0,
        sacFlies: s?.sacFlies ?? 0,
        caughtStealing: s?.caughtStealing ?? 0,
        intentionalWalks: s?.intentionalWalks ?? 0,
      };
    });

    result.sort((a, b) => b.totalScore - a.totalScore);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Players error:', error);
    return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 });
  }
}
