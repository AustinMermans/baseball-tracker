/**
 * Generates static JSON data files from the SQLite database.
 * Run after syncing stats: npx tsx scripts/generate-static.ts
 * Output goes to public/data/ for static site deployment.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'baseball.db');
const outDir = path.join(process.cwd(), 'public', 'data');

if (!fs.existsSync(dbPath)) {
  console.error('baseball.db not found. Run seed first: npx tsx src/db/seed.ts');
  process.exit(1);
}

const sqlite = new Database(dbPath, { readonly: true });
fs.mkdirSync(outDir, { recursive: true });

// --- Helpers ---

interface PlayerPeriodScore {
  playerId: number;
  playerName: string;
  totalScore: number;
  gamesPlayed: number;
  totalBases: number;
  stolenBases: number;
  walks: number;
  hbp: number;
}

function computeBestBall(playerScores: PlayerPeriodScore[]) {
  const sorted = [...playerScores].sort((a, b) => b.totalScore - a.totalScore);
  const counting = sorted.slice(0, 10);
  const bench = sorted.slice(10);
  return {
    bestBallScore: counting.reduce((sum, p) => sum + p.totalScore, 0),
    countingPlayerIds: counting.map(p => p.playerId),
    benchPlayerIds: bench.map(p => p.playerId),
  };
}

// --- Load base data ---

const teams = sqlite.prepare('SELECT * FROM teams').all() as any[];
const periods = sqlite.prepare('SELECT * FROM season_periods').all() as any[];
const players = sqlite.prepare('SELECT * FROM players WHERE is_active = 1').all() as any[];

// --- Generate standings.json ---

console.log('Generating standings.json...');

const statsByPeriod = new Map<number, Map<number, PlayerPeriodScore>>();

for (const period of periods) {
  const rows = sqlite.prepare(`
    SELECT
      ds.player_id as playerId,
      p.name as playerName,
      p.team_id as teamId,
      COALESCE(SUM(ds.fantasy_score), 0) as totalScore,
      COUNT(ds.id) as gamesPlayed,
      COALESCE(SUM(ds.total_bases), 0) as totalBases,
      COALESCE(SUM(ds.stolen_bases), 0) as stolenBases,
      COALESCE(SUM(ds.walks), 0) as walks,
      COALESCE(SUM(ds.hbp), 0) as hbp
    FROM daily_stats ds
    JOIN players p ON ds.player_id = p.id
    WHERE p.is_active = 1
      AND ds.game_date >= ?
      AND ds.game_date <= ?
    GROUP BY ds.player_id
  `).all(period.start_date, period.end_date) as any[];

  const map = new Map<number, PlayerPeriodScore>();
  for (const r of rows) {
    map.set(r.playerId, r);
  }
  statsByPeriod.set(period.id, map);
}

const standings = teams.map(team => {
  const teamPlayers = players.filter(p => p.team_id === team.id);
  let cumulativeScore = 0;

  const periodResults = periods.map(period => {
    const periodStats = statsByPeriod.get(period.id) || new Map();
    const playerScores: PlayerPeriodScore[] = teamPlayers.map(player => {
      const s = periodStats.get(player.id);
      return {
        playerId: player.id,
        playerName: player.name,
        totalScore: s?.totalScore ?? 0,
        gamesPlayed: s?.gamesPlayed ?? 0,
        totalBases: s?.totalBases ?? 0,
        stolenBases: s?.stolenBases ?? 0,
        walks: s?.walks ?? 0,
        hbp: s?.hbp ?? 0,
      };
    });

    const bestBall = computeBestBall(playerScores);
    cumulativeScore += bestBall.bestBallScore;

    return {
      periodId: period.id,
      periodName: period.name,
      bestBallScore: bestBall.bestBallScore,
      countingPlayerIds: bestBall.countingPlayerIds,
      benchPlayerIds: bestBall.benchPlayerIds,
    };
  });

  return {
    team: { id: team.id, name: team.name },
    periods: periodResults,
    cumulativeScore,
  };
}).sort((a, b) => b.cumulativeScore - a.cumulativeScore);

fs.writeFileSync(
  path.join(outDir, 'standings.json'),
  JSON.stringify({ standings, periods }, null, 2)
);

// --- Generate teams.json (list) ---

console.log('Generating teams.json...');

const teamsData = teams.map(team => ({
  ...team,
  roster: players.filter(p => p.team_id === team.id).sort((a: any, b: any) => a.draft_round - b.draft_round),
}));
fs.writeFileSync(path.join(outDir, 'teams.json'), JSON.stringify(teamsData, null, 2));

// --- Generate team-{id}.json for each team ---

console.log('Generating team detail files...');

for (const team of teams) {
  const roster = players.filter(p => p.team_id === team.id);

  const periodResults = periods.map(period => {
    const periodStats = statsByPeriod.get(period.id) || new Map();
    const playerScores: PlayerPeriodScore[] = roster.map(player => {
      const s = periodStats.get(player.id);
      return {
        playerId: player.id,
        playerName: player.name,
        totalScore: s?.totalScore ?? 0,
        gamesPlayed: s?.gamesPlayed ?? 0,
        totalBases: s?.totalBases ?? 0,
        stolenBases: s?.stolenBases ?? 0,
        walks: s?.walks ?? 0,
        hbp: s?.hbp ?? 0,
      };
    });

    const bestBall = computeBestBall(playerScores);
    return {
      period,
      bestBallScore: bestBall.bestBallScore,
      playerScores: playerScores.sort((a, b) => b.totalScore - a.totalScore),
      countingPlayerIds: bestBall.countingPlayerIds,
      benchPlayerIds: bestBall.benchPlayerIds,
    };
  });

  fs.writeFileSync(
    path.join(outDir, `team-${team.id}.json`),
    JSON.stringify({
      team,
      roster: roster.sort((a: any, b: any) => a.draft_round - b.draft_round),
      periods: periodResults,
    }, null, 2)
  );
}

// --- Generate players.json ---

console.log('Generating players.json...');

const teamMap = new Map(teams.map(t => [t.id, t.name]));
const playerRows = sqlite.prepare(`
  SELECT
    p.id, p.mlb_id as mlbId, p.name, p.mlb_team as mlbTeam,
    p.position, p.team_id as teamId, p.draft_round as draftRound,
    COALESCE(SUM(ds.fantasy_score), 0) as totalScore,
    COUNT(ds.id) as gamesPlayed,
    COALESCE(SUM(ds.total_bases), 0) as totalBases,
    COALESCE(SUM(ds.stolen_bases), 0) as stolenBases,
    COALESCE(SUM(ds.walks), 0) as walks,
    COALESCE(SUM(ds.hbp), 0) as hbp,
    COALESCE((SELECT SUM(fantasy_score) FROM (SELECT fantasy_score FROM daily_stats WHERE player_id = p.id ORDER BY game_date DESC LIMIT 3)), 0) as last3Score,
    COALESCE((SELECT COUNT(*) FROM (SELECT id FROM daily_stats WHERE player_id = p.id ORDER BY game_date DESC LIMIT 3)), 0) as last3Games
  FROM players p
  LEFT JOIN daily_stats ds ON ds.player_id = p.id
  WHERE p.is_active = 1
  GROUP BY p.id
  ORDER BY totalScore DESC
`).all() as any[];

const playersOut = playerRows.map(p => ({
  ...p,
  fantasyTeam: teamMap.get(p.teamId) ?? 'Unknown',
}));

fs.writeFileSync(path.join(outDir, 'players.json'), JSON.stringify(playersOut, null, 2));

// --- Generate meta.json (last updated timestamp) ---

const lastStat = sqlite.prepare('SELECT MAX(game_date) as lastDate FROM daily_stats').get() as any;
fs.writeFileSync(
  path.join(outDir, 'meta.json'),
  JSON.stringify({
    lastUpdated: new Date().toISOString(),
    lastGameDate: lastStat?.lastDate || null,
    totalPlayers: players.length,
    totalTeams: teams.length,
  }, null, 2)
);

console.log('Static data generated successfully!');
sqlite.close();
