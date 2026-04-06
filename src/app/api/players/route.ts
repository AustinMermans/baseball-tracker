import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

export async function GET() {
  try {
    const dbPath = path.join(process.cwd(), 'baseball.db');
    const sqlite = new Database(dbPath, { readonly: true });

    const result = sqlite.prepare(`
      SELECT
        p.id, p.mlb_id as mlbId, p.name, p.mlb_team as mlbTeam,
        p.position, p.team_id as teamId, p.draft_round as draftRound,
        p.is_active as isActive,
        COALESCE((SELECT SUM(fantasy_score) FROM daily_stats WHERE player_id = p.id), 0) as totalScore,
        COALESCE((SELECT COUNT(*) FROM daily_stats WHERE player_id = p.id), 0) as gamesPlayed,
        COALESCE((SELECT SUM(total_bases) FROM daily_stats WHERE player_id = p.id), 0) as totalBases,
        COALESCE((SELECT SUM(stolen_bases) FROM daily_stats WHERE player_id = p.id), 0) as stolenBases,
        COALESCE((SELECT SUM(walks) FROM daily_stats WHERE player_id = p.id), 0) as walks,
        COALESCE((SELECT SUM(hbp) FROM daily_stats WHERE player_id = p.id), 0) as hbp,
        COALESCE((SELECT SUM(fantasy_score) FROM (SELECT fantasy_score FROM daily_stats WHERE player_id = p.id ORDER BY game_date DESC LIMIT 3)), 0) as last3Score,
        COALESCE((SELECT COUNT(*) FROM (SELECT id FROM daily_stats WHERE player_id = p.id ORDER BY game_date DESC LIMIT 3)), 0) as last3Games
      FROM players p
      WHERE p.is_active = 1
      ORDER BY totalScore DESC
    `).all();

    const teams = sqlite.prepare('SELECT id, name FROM teams').all() as any[];
    const teamMap = new Map(teams.map((t: any) => [t.id, t.name]));

    const out = result.map((p: any) => ({
      ...p,
      fantasyTeam: teamMap.get(p.teamId) ?? 'Unknown',
    }));

    sqlite.close();
    return NextResponse.json(out);
  } catch (error) {
    console.error('Players error:', error);
    return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 });
  }
}
