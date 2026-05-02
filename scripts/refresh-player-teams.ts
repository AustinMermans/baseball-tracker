/**
 * Refreshes mlb_team and position for every player by hitting the MLB
 * people-by-sport endpoint once. Fast (one API call) and idempotent.
 *
 * Use case: rostered players were seeded without mlb_team; later trades
 * may also stale-out previously-stored team data. Run this any time you
 * want the players table to match the live MLB roster picture.
 */

import Database from 'better-sqlite3';
import path from 'path';

const BASE_URL = 'https://statsapi.mlb.com';
const dbPath = path.join(process.cwd(), 'baseball.db');

async function main() {
  const sqlite = new Database(dbPath);

  console.log('Fetching team abbreviations...');
  const teamsRes = await fetch(`${BASE_URL}/api/v1/teams?sportId=1`);
  const teamsData = await teamsRes.json();
  const teamAbbrev = new Map<number, string>();
  for (const t of teamsData.teams || []) {
    if (t.id && t.abbreviation) teamAbbrev.set(t.id, t.abbreviation);
  }

  console.log('Fetching all active MLB players...');
  const peopleRes = await fetch(`${BASE_URL}/api/v1/sports/1/players?season=2026`);
  const peopleData = await peopleRes.json();
  const byMlbId = new Map<number, { team: string | null; position: string | null }>();
  for (const p of peopleData.people || []) {
    const teamId = p.currentTeam?.id;
    byMlbId.set(p.id, {
      team: teamId ? (teamAbbrev.get(teamId) ?? null) : null,
      position: p.primaryPosition?.abbreviation ?? null,
    });
  }
  console.log(`Got ${byMlbId.size} active players from MLB API`);

  // Update only mlb_team and position. Leave name, team_id, draft_round,
  // is_active alone — those are league-managed.
  const update = sqlite.prepare(`
    UPDATE players SET mlb_team = ?, position = ? WHERE mlb_id = ?
  `);

  const players = sqlite.prepare('SELECT id, mlb_id, name, mlb_team FROM players').all() as any[];
  let updated = 0;
  let unchanged = 0;
  let missing = 0;

  for (const p of players) {
    const fresh = byMlbId.get(p.mlb_id);
    if (!fresh) {
      missing++;
      continue;
    }
    if (fresh.team === p.mlb_team) {
      unchanged++;
      continue;
    }
    update.run(fresh.team, fresh.position, p.mlb_id);
    updated++;
  }

  console.log(`Updated: ${updated}, unchanged: ${unchanged}, no MLB record: ${missing}`);
  sqlite.close();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
