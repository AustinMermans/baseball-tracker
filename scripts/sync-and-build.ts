/**
 * Full pipeline: sync all stats from MLB API, then generate static JSON.
 * Usage: npx tsx scripts/sync-and-build.ts
 */

import Database from 'better-sqlite3';
import path from 'path';

const BASE_URL = 'https://statsapi.mlb.com';
const dbPath = path.join(process.cwd(), 'baseball.db');
const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

interface BattingLine {
  totalBases: number;
  stolenBases: number;
  baseOnBalls: number;
  hitByPitch: number;
  atBats: number;
}

async function getSchedule(date: string) {
  const res = await fetch(`${BASE_URL}/api/v1/schedule?sportId=1&date=${date}&hydrate=team`);
  if (!res.ok) throw new Error(`Schedule failed: ${res.status}`);
  const data = await res.json();
  const games: any[] = [];
  for (const d of data.dates || []) {
    for (const g of d.games || []) games.push(g);
  }
  return games;
}

async function getBoxscore(gamePk: number): Promise<Map<number, BattingLine>> {
  const res = await fetch(`${BASE_URL}/api/v1.1/game/${gamePk}/feed/live`);
  if (!res.ok) throw new Error(`Boxscore failed: ${res.status}`);
  const data = await res.json();
  const result = new Map<number, BattingLine>();
  const boxscore = data.liveData?.boxscore;
  if (!boxscore) return result;

  for (const side of ['away', 'home']) {
    const teamPlayers = boxscore.teams[side]?.players || {};
    for (const [, pd] of Object.entries(teamPlayers)) {
      const p = pd as any;
      const b = p.stats?.batting;
      if (b && (b.atBats > 0 || b.baseOnBalls > 0 || b.hitByPitch > 0)) {
        result.set(p.person.id, {
          totalBases: b.totalBases || 0,
          stolenBases: b.stolenBases || 0,
          baseOnBalls: b.baseOnBalls || 0,
          hitByPitch: b.hitByPitch || 0,
          atBats: b.atBats || 0,
        });
      }
    }
  }
  return result;
}

async function syncDate(date: string, mlbIdToPlayerId: Map<number, number>) {
  const games = await getSchedule(date);
  const completed = games.filter((g: any) => g.status.statusCode === 'F');
  if (completed.length === 0) return 0;

  const dayStats = new Map<number, BattingLine>();

  for (const game of completed) {
    const box = await getBoxscore(game.gamePk);
    for (const [mlbId, stats] of box) {
      if (!mlbIdToPlayerId.has(mlbId)) continue;
      const existing = dayStats.get(mlbId);
      if (existing) {
        existing.totalBases += stats.totalBases;
        existing.stolenBases += stats.stolenBases;
        existing.baseOnBalls += stats.baseOnBalls;
        existing.hitByPitch += stats.hitByPitch;
      } else {
        dayStats.set(mlbId, { ...stats });
      }
    }
  }

  const upsert = sqlite.prepare(`
    INSERT INTO daily_stats (player_id, game_date, total_bases, stolen_bases, walks, hbp, fantasy_score)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(player_id, game_date) DO UPDATE SET
      total_bases = excluded.total_bases,
      stolen_bases = excluded.stolen_bases,
      walks = excluded.walks,
      hbp = excluded.hbp,
      fantasy_score = excluded.fantasy_score
  `);

  let count = 0;
  for (const [mlbId, stats] of dayStats) {
    const playerId = mlbIdToPlayerId.get(mlbId)!;
    const score = stats.totalBases + stats.stolenBases + stats.baseOnBalls + stats.hitByPitch;
    upsert.run(playerId, date, stats.totalBases, stats.stolenBases, stats.baseOnBalls, stats.hitByPitch, score);
    count++;
  }

  return count;
}

async function main() {
  // Get rostered players
  const players = sqlite.prepare('SELECT id, mlb_id FROM players WHERE is_active = 1').all() as any[];
  const mlbIdToPlayerId = new Map<number, number>();
  for (const p of players) mlbIdToPlayerId.set(p.mlb_id, p.id);

  // Determine date range: last synced date (or season start) to yesterday
  const lastRow = sqlite.prepare('SELECT MAX(game_date) as d FROM daily_stats').get() as any;
  const seasonStart = '2026-03-26';
  const startDate = lastRow?.d
    ? new Date(new Date(lastRow.d).getTime() + 86400000).toISOString().split('T')[0]
    : seasonStart;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const endDate = yesterday.toISOString().split('T')[0];

  if (startDate > endDate) {
    console.log('Already up to date!');
  } else {
    console.log(`Syncing ${startDate} to ${endDate}...`);
    let totalSynced = 0;

    for (let d = new Date(startDate); d <= new Date(endDate); d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      process.stdout.write(`  ${dateStr}... `);
      try {
        const count = await syncDate(dateStr, mlbIdToPlayerId);
        console.log(`${count} players`);
        totalSynced += count;
      } catch (e) {
        console.log(`ERROR: ${e}`);
      }
    }

    console.log(`Sync complete: ${totalSynced} player-days`);
  }

  sqlite.close();

  // Now generate static JSON
  console.log('\nGenerating static data...');
  const { execSync } = await import('child_process');
  execSync('npx tsx scripts/generate-static.ts', { stdio: 'inherit' });
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
