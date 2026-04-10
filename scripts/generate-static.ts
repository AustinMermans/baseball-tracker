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
    COALESCE(SUM(ds.hbp), 0) as hbp
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

// --- Generate rankings.json (week-by-week bump chart data) ---

console.log('Generating rankings.json...');

const allDates = sqlite.prepare('SELECT DISTINCT game_date FROM daily_stats ORDER BY game_date').all() as any[];
const gameDates = allDates.map((d: any) => d.game_date);

if (gameDates.length > 0) {
  const firstDate = new Date(gameDates[0]);
  const weeks: { label: string; endDate: string }[] = [];
  const weekStart = new Date(firstDate);

  const fmtShort = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

  while (weekStart.toISOString().split('T')[0] <= gameDates[gameDates.length - 1]) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const startStr = weekStart.toISOString().split('T')[0];
    const endStr = weekEnd.toISOString().split('T')[0];
    const actualEnd = endStr > gameDates[gameDates.length - 1] ? gameDates[gameDates.length - 1] : endStr;
    if (gameDates.some((d: string) => d >= startStr && d <= endStr)) {
      weeks.push({
        label: `Wk ${weeks.length + 1} (${fmtShort(weekStart)}–${fmtShort(new Date(actualEnd))})`,
        endDate: actualEnd,
      });
    }
    weekStart.setDate(weekStart.getDate() + 7);
  }

  // Team rankings per week
  const teamRankings = teams.map(t => ({ teamId: t.id, teamName: t.name, weeks: [] as any[] }));

  for (const week of weeks) {
    const stats = sqlite.prepare(`
      SELECT ds.player_id as playerId, p.name as playerName, p.team_id as teamId,
        COALESCE(SUM(ds.fantasy_score), 0) as totalScore,
        COUNT(ds.id) as gamesPlayed,
        COALESCE(SUM(ds.total_bases), 0) as totalBases,
        COALESCE(SUM(ds.stolen_bases), 0) as stolenBases,
        COALESCE(SUM(ds.walks), 0) as walks,
        COALESCE(SUM(ds.hbp), 0) as hbp
      FROM daily_stats ds
      JOIN players p ON ds.player_id = p.id
      WHERE p.is_active = 1 AND ds.game_date <= ?
      GROUP BY ds.player_id
    `).all(week.endDate) as PlayerPeriodScore[];

    const playersByTeam = new Map<number, PlayerPeriodScore[]>();
    for (const s of stats) {
      const tid = (s as any).teamId ?? 0;
      if (!playersByTeam.has(tid)) playersByTeam.set(tid, []);
      playersByTeam.get(tid)!.push(s);
    }

    const teamScores = teams.map(t => ({
      teamId: t.id,
      score: computeBestBall(playersByTeam.get(t.id) || []).bestBallScore,
    })).sort((a, b) => b.score - a.score);

    teamScores.forEach((ts, idx) => {
      const entry = teamRankings.find(tr => tr.teamId === ts.teamId)!;
      entry.weeks.push({ week: week.label, score: ts.score, rank: idx + 1 });
    });
  }

  // Dynamic top 10 players - track anyone who appears in top 10 any week
  const OFF_CHART_RANK = 13;
  const weeklyTop10 = new Map<string, any[]>();
  const everTop10 = new Set<number>();

  for (const week of weeks) {
    const stats = sqlite.prepare(`
      SELECT ds.player_id as playerId, p.name as playerName,
        COALESCE(SUM(ds.fantasy_score), 0) as totalScore
      FROM daily_stats ds
      JOIN players p ON ds.player_id = p.id
      WHERE p.is_active = 1 AND ds.game_date <= ?
      GROUP BY ds.player_id
      ORDER BY totalScore DESC
    `).all(week.endDate) as any[];

    const ranked = stats.map((s: any, idx: number) => ({ ...s, rank: idx + 1 }));
    weeklyTop10.set(week.label, ranked);
    ranked.slice(0, 10).forEach((s: any) => everTop10.add(s.playerId));
  }

  const playerRankings: any[] = [];

  for (const pid of everTop10) {
    let playerName = '';
    const weekData: any[] = [];

    for (const week of weeks) {
      const ranked = weeklyTop10.get(week.label) || [];
      const entry = ranked.find((r: any) => r.playerId === pid);
      if (entry) {
        playerName = entry.playerName;
        weekData.push({
          week: week.label,
          score: entry.totalScore,
          rank: entry.rank <= 10 ? entry.rank : OFF_CHART_RANK,
        });
      }
    }

    if (playerName) {
      playerRankings.push({ playerId: pid, playerName, weeks: weekData });
    }
  }

  playerRankings.sort((a: any, b: any) => {
    const bestA = Math.min(...a.weeks.map((w: any) => w.rank));
    const bestB = Math.min(...b.weeks.map((w: any) => w.rank));
    return bestA - bestB;
  });

  fs.writeFileSync(
    path.join(outDir, 'rankings.json'),
    JSON.stringify({ teamRankings, playerRankings, weeks: weeks.map(w => w.label) }, null, 2)
  );
}

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
