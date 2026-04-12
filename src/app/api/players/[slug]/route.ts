import { NextResponse } from 'next/server';
import { db } from '@/db';
import { players, teams, dailyStats } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { slugify } from '@/lib/utils';

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const allPlayers = await db.select().from(players).where(eq(players.isActive, 1));
    const sorted = [...allPlayers].sort((a, b) => a.name.localeCompare(b.name));
    const player = sorted.find(p => slugify(p.name) === params.slug);

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    const allTeams = await db.select().from(teams);
    const teamMap = new Map(allTeams.map(t => [t.id, t.name]));

    // Get all game rows for this player
    const games = await db.select()
      .from(dailyStats)
      .where(eq(dailyStats.playerId, player.id))
      .orderBy(dailyStats.gameDate);

    // Season totals
    const seasonTotals = {
      gamesPlayed: games.length,
      atBats: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0,
      totalBases: 0, stolenBases: 0, baseOnBalls: 0, hitByPitch: 0,
      runs: 0, rbi: 0, strikeouts: 0, plateAppearances: 0,
      sacBunts: 0, sacFlies: 0, groundIntoDoublePlay: 0, groundIntoTriplePlay: 0,
      leftOnBase: 0, groundOuts: 0, flyOuts: 0, lineOuts: 0,
      popOuts: 0, airOuts: 0, catchersInterference: 0,
      caughtStealing: 0, intentionalWalks: 0, pickoffs: 0,
      fantasyScore: 0,
    };

    for (const g of games) {
      seasonTotals.atBats += g.atBats ?? 0;
      seasonTotals.hits += g.hits ?? 0;
      seasonTotals.doubles += g.doubles ?? 0;
      seasonTotals.triples += g.triples ?? 0;
      seasonTotals.homeRuns += g.homeRuns ?? 0;
      seasonTotals.totalBases += g.totalBases ?? 0;
      seasonTotals.stolenBases += g.stolenBases ?? 0;
      seasonTotals.baseOnBalls += g.walks ?? 0;
      seasonTotals.hitByPitch += g.hbp ?? 0;
      seasonTotals.runs += g.runs ?? 0;
      seasonTotals.rbi += g.rbi ?? 0;
      seasonTotals.strikeouts += g.strikeouts ?? 0;
      seasonTotals.plateAppearances += g.plateAppearances ?? 0;
      seasonTotals.sacBunts += g.sacBunts ?? 0;
      seasonTotals.sacFlies += g.sacFlies ?? 0;
      seasonTotals.groundIntoDoublePlay += g.groundIntoDoublePlay ?? 0;
      seasonTotals.groundIntoTriplePlay += g.groundIntoTriplePlay ?? 0;
      seasonTotals.leftOnBase += g.leftOnBase ?? 0;
      seasonTotals.groundOuts += g.groundOuts ?? 0;
      seasonTotals.flyOuts += g.flyOuts ?? 0;
      seasonTotals.lineOuts += g.lineOuts ?? 0;
      seasonTotals.popOuts += g.popOuts ?? 0;
      seasonTotals.airOuts += g.airOuts ?? 0;
      seasonTotals.catchersInterference += g.catchersInterference ?? 0;
      seasonTotals.caughtStealing += g.caughtStealing ?? 0;
      seasonTotals.intentionalWalks += g.intentionalWalks ?? 0;
      seasonTotals.pickoffs += g.pickoffs ?? 0;
      seasonTotals.fantasyScore += g.fantasyScore ?? 0;
    }

    // Overall rank by fantasy score
    const rankings = await db.select({
      playerId: dailyStats.playerId,
      total: sql<number>`COALESCE(SUM(${dailyStats.fantasyScore}), 0)`,
    })
      .from(dailyStats)
      .groupBy(dailyStats.playerId)
      .orderBy(sql`COALESCE(SUM(${dailyStats.fantasyScore}), 0) DESC`);

    const overallRank = rankings.findIndex(r => r.playerId === player.id) + 1;

    // Prev/next navigation
    const idx = sorted.findIndex(p => p.id === player.id);
    const prev = idx > 0 ? sorted[idx - 1] : null;
    const next = idx < sorted.length - 1 ? sorted[idx + 1] : null;

    return NextResponse.json({
      player: {
        id: player.id,
        mlbId: player.mlbId,
        name: player.name,
        slug: slugify(player.name),
        mlbTeam: player.mlbTeam,
        position: player.position,
        teamId: player.teamId,
        fantasyTeam: teamMap.get(player.teamId ?? 0) ?? 'Unknown',
        draftRound: player.draftRound,
        overallRank: overallRank || sorted.length,
      },
      seasonTotals,
      games: games.map(g => ({
        gameDate: g.gameDate,
        gamePk: g.gamePk,
        atBats: g.atBats ?? 0,
        hits: g.hits ?? 0,
        doubles: g.doubles ?? 0,
        triples: g.triples ?? 0,
        homeRuns: g.homeRuns ?? 0,
        totalBases: g.totalBases ?? 0,
        stolenBases: g.stolenBases ?? 0,
        baseOnBalls: g.walks ?? 0,
        hitByPitch: g.hbp ?? 0,
        runs: g.runs ?? 0,
        rbi: g.rbi ?? 0,
        strikeouts: g.strikeouts ?? 0,
        plateAppearances: g.plateAppearances ?? 0,
        sacBunts: g.sacBunts ?? 0,
        sacFlies: g.sacFlies ?? 0,
        groundIntoDoublePlay: g.groundIntoDoublePlay ?? 0,
        groundIntoTriplePlay: g.groundIntoTriplePlay ?? 0,
        leftOnBase: g.leftOnBase ?? 0,
        groundOuts: g.groundOuts ?? 0,
        flyOuts: g.flyOuts ?? 0,
        lineOuts: g.lineOuts ?? 0,
        popOuts: g.popOuts ?? 0,
        airOuts: g.airOuts ?? 0,
        catchersInterference: g.catchersInterference ?? 0,
        caughtStealing: g.caughtStealing ?? 0,
        intentionalWalks: g.intentionalWalks ?? 0,
        pickoffs: g.pickoffs ?? 0,
        fantasyScore: g.fantasyScore ?? 0,
      })),
      navigation: {
        prevSlug: prev ? slugify(prev.name) : null,
        prevName: prev?.name ?? null,
        nextSlug: next ? slugify(next.name) : null,
        nextName: next?.name ?? null,
      },
    });
  } catch (error) {
    console.error('Player detail error:', error);
    return NextResponse.json({ error: 'Failed to fetch player' }, { status: 500 });
  }
}
