/**
 * Verifies every drafted player's stored mlb_id resolves to the correct name
 * via the MLB Stats API. Flags any mismatches.
 *
 * Triggered by an incident where Cole's "James Wood" was actually mapped to
 * Evan Carter's mlb_id (694497) — meaning a season's worth of stats were
 * silently attributed to the wrong player.
 *
 * Usage: npx tsx scripts/audit-rosters.ts
 */

import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'baseball.db');
const sqlite = new Database(dbPath, { readonly: true });

interface DraftedRow {
  id: number;
  mlb_id: number;
  name: string;
  mlb_team: string | null;
  position: string | null;
  team_name: string;
  draft_round: number | null;
  pts: number;
}

const rows = sqlite.prepare(`
  SELECT p.id, p.mlb_id, p.name, p.mlb_team, p.position,
         t.name AS team_name, p.draft_round,
         COALESCE((SELECT SUM(fantasy_score) FROM daily_stats WHERE player_id = p.id), 0) AS pts
  FROM players p
  JOIN teams t ON t.id = p.team_id
  ORDER BY t.name, p.draft_round, p.name
`).all() as DraftedRow[];

function normalize(name: string): string {
  return name.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function lookup(id: number): Promise<{ name: string; team: string | null; position: string | null } | null> {
  const res = await fetch(`https://statsapi.mlb.com/api/v1/people/${id}`);
  if (!res.ok) return null;
  const data = await res.json();
  const p = data.people?.[0];
  if (!p) return null;
  return {
    name: p.fullName,
    team: p.currentTeam?.abbreviation ?? null,
    position: p.primaryPosition?.abbreviation ?? null,
  };
}

async function main() {
  console.log(`Auditing ${rows.length} drafted players...`);
  const mismatches: { row: DraftedRow; api: { name: string; team: string | null; position: string | null } | null }[] = [];

  // Concurrent fetch in small batches to be polite to the API.
  const BATCH = 8;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(r => lookup(r.mlb_id)));
    for (let j = 0; j < batch.length; j++) {
      const row = batch[j];
      const api = results[j];
      if (!api) {
        mismatches.push({ row, api });
        console.log(`  ⚠️  ${row.name} (mlb_id ${row.mlb_id}) — API lookup FAILED`);
        continue;
      }
      if (normalize(row.name) !== normalize(api.name)) {
        mismatches.push({ row, api });
        console.log(`  ❌ ${row.team_name}'s "${row.name}" (mlb_id ${row.mlb_id}) — API says "${api.name}" (${api.team ?? '?'} ${api.position ?? '?'})`);
        console.log(`     Currently has ${row.pts} fantasy points attributed to it.`);
      }
    }
    process.stdout.write(`  [${Math.min(i + BATCH, rows.length)}/${rows.length}]\r`);
  }
  console.log('');

  if (mismatches.length === 0) {
    console.log(`✅ All ${rows.length} drafted players verified.`);
    return;
  }

  console.log(`\n${mismatches.length} mismatch(es) found.`);
  console.log(`\nSuggested fixes:`);
  for (const m of mismatches) {
    if (!m.api) continue;
    console.log(`  - ${m.row.team_name}'s "${m.row.name}" → look up the correct mlb_id (current ${m.row.mlb_id} = "${m.api.name}")`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
