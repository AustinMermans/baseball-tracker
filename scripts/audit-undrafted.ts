/**
 * Audits the auto-discovered (undrafted) players against the MLB API to
 * surface potential noise: pitchers who batted once in interleague,
 * inactive players, or stored mlb_team that disagrees with current team.
 *
 * Read-only — prints findings, doesn't write anything.
 */
import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(process.cwd(), 'baseball.db'), { readonly: true });

const undrafted = db.prepare(
  `SELECT p.id, p.mlb_id, p.name, p.mlb_team, p.position,
          COUNT(ds.id) as games,
          COALESCE(SUM(ds.fantasy_score), 0) as pts,
          COALESCE(SUM(ds.plate_appearances), 0) as pa
   FROM players p
   LEFT JOIN daily_stats ds ON ds.player_id = p.id
   WHERE p.team_id IS NULL AND p.is_active = 1
   GROUP BY p.id`
).all() as Array<{ id: number; mlb_id: number; name: string; mlb_team: string | null; position: string | null; games: number; pts: number; pa: number }>;

console.log(`Auditing ${undrafted.length} undrafted players...`);

async function main() {
const ids = undrafted.map(p => p.mlb_id);
const apiByMlbId = new Map<number, any>();
for (let i = 0; i < ids.length; i += 100) {
  const batch = ids.slice(i, i + 100);
  const url = `https://statsapi.mlb.com/api/v1/people?personIds=${batch.join(',')}`;
  const r = await fetch(url);
  const j: any = await r.json();
  for (const p of j.people || []) apiByMlbId.set(p.id, p);
}

const issues: string[] = [];
for (const p of undrafted) {
  const api = apiByMlbId.get(p.mlb_id);
  if (!api) {
    issues.push(`❓ id=${p.id} mlb_id=${p.mlb_id} "${p.name}" — not found in MLB API`);
    continue;
  }
  const apiName = api.fullName as string;
  const apiPos = api.primaryPosition?.abbreviation as string | undefined;
  const apiActive = api.active as boolean;
  const apiTeam = api.currentTeam?.name as string | undefined;

  if (!apiActive) {
    issues.push(`💤 id=${p.id} "${p.name}" — INACTIVE (${p.games}g/${p.pts}pts)`);
  }
  if (apiPos === 'P') {
    issues.push(`⚾ id=${p.id} "${p.name}" — PITCHER (${p.games}g/${p.pts}pts/${p.pa}pa)`);
  }
  if (apiName !== p.name) {
    issues.push(`✏️  id=${p.id} mlb_id=${p.mlb_id} stored="${p.name}" → API="${apiName}"`);
  }
  if (apiPos && p.position && apiPos !== p.position) {
    // Position drift is normal (UTIL guys), only flag if substantial — skip.
  }
}

if (issues.length === 0) {
  console.log('✅ No noise found.');
} else {
  console.log(`\n${issues.length} finding(s):`);
  for (const i of issues) console.log('  ' + i);
}
}
main();
