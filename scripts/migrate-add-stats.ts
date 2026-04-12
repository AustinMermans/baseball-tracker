/**
 * Adds expanded batting stat columns to the daily_stats table.
 * Idempotent — safe to run multiple times.
 * Usage: npx tsx scripts/migrate-add-stats.ts
 */

import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'baseball.db');
const sqlite = new Database(dbPath);

const newColumns = [
  'at_bats', 'hits', 'doubles', 'triples', 'home_runs', 'plate_appearances',
  'runs', 'rbi', 'strikeouts', 'sac_bunts', 'sac_flies',
  'ground_into_double_play', 'ground_into_triple_play', 'left_on_base',
  'ground_outs', 'fly_outs', 'line_outs', 'pop_outs', 'air_outs',
  'catchers_interference', 'caught_stealing', 'intentional_walks', 'pickoffs',
];

const existing = sqlite.prepare('PRAGMA table_info(daily_stats)').all() as { name: string }[];
const existingNames = new Set(existing.map(c => c.name));

let added = 0;
for (const col of newColumns) {
  if (!existingNames.has(col)) {
    sqlite.exec(`ALTER TABLE daily_stats ADD COLUMN ${col} INTEGER DEFAULT 0`);
    console.log(`  Added column: ${col}`);
    added++;
  }
}

console.log(`Migration complete: ${added} columns added (${newColumns.length - added} already existed)`);
sqlite.close();
