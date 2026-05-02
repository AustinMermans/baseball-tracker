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

// --- Slugify (mirrors src/lib/utils.ts) ---

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// --- Helpers ---

interface PlayerPeriodScore {
  playerId: number;
  playerName: string;
  slug: string;
  totalScore: number;
  gamesPlayed: number;
  totalBases: number;
  stolenBases: number;
  walks: number;
  hbp: number;
  atBats: number;
  hits: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  runs: number;
  rbi: number;
  strikeouts: number;
  plateAppearances: number;
  sacFlies: number;
  sacBunts: number;
  caughtStealing: number;
  intentionalWalks: number;
  groundIntoDoublePlay: number;
  leftOnBase: number;
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

// --- Slug uniqueness map ---
//
// Rostered players (team_id NOT NULL) keep their bare-name slug — these are the
// URLs already in production and we don't want to break links. Non-rostered
// players append -{mlbId} to disambiguate (with ~500 active MLB hitters, name
// collisions are real). Rostered players collide only theoretically; if it ever
// happens we'd need a richer disambiguation (mlb-team suffix), but for now the
// 104 rostered names are unique by construction.
const slugByPlayerId = new Map<number, string>();
const rosteredSlugs = new Set<string>();
for (const p of players) {
  if (p.team_id != null) {
    const s = slugify(p.name);
    rosteredSlugs.add(s);
    slugByPlayerId.set(p.id, s);
  }
}
for (const p of players) {
  if (p.team_id != null) continue;
  const bare = slugify(p.name);
  const slug = rosteredSlugs.has(bare) ? `${bare}-${p.mlb_id}` : bare;
  // If two non-rostered players share a name, the second one will see the
  // first's slug already taken — fall back to mlb-id suffix.
  const finalSlug = [...slugByPlayerId.values()].includes(slug) ? `${bare}-${p.mlb_id}` : slug;
  slugByPlayerId.set(p.id, finalSlug);
}

function playerSlug(player: any): string {
  return slugByPlayerId.get(player.id) ?? slugByPlayerId.get(player.playerId) ?? slugify(player.name ?? player.playerName ?? '');
}

// Normalize a snake_case players-table row to the camelCase shape that the
// /api/* routes return via Drizzle. Keeping a single canonical shape across
// dev (API route) and static (JSON file) modes prevents UI bugs where a
// component reads p.mlbTeam in one mode and gets undefined in the other.
function normalizePlayerRow(p: any): {
  id: number;
  mlbId: number;
  name: string;
  mlbTeam: string | null;
  position: string | null;
  teamId: number | null;
  draftRound: number | null;
  isActive: number;
} {
  return {
    id: p.id,
    mlbId: p.mlb_id,
    name: p.name,
    mlbTeam: p.mlb_team ?? null,
    position: p.position ?? null,
    teamId: p.team_id ?? null,
    draftRound: p.draft_round ?? null,
    isActive: p.is_active ?? 1,
  };
}

// --- Expanded stats query fragment ---

const EXPANDED_STATS_SELECT = `
  ds.player_id as playerId,
  p.name as playerName,
  p.team_id as teamId,
  COALESCE(SUM(ds.fantasy_score), 0) as totalScore,
  COUNT(ds.id) as gamesPlayed,
  COALESCE(SUM(ds.total_bases), 0) as totalBases,
  COALESCE(SUM(ds.stolen_bases), 0) as stolenBases,
  COALESCE(SUM(ds.walks), 0) as walks,
  COALESCE(SUM(ds.hbp), 0) as hbp,
  COALESCE(SUM(ds.at_bats), 0) as atBats,
  COALESCE(SUM(ds.hits), 0) as hits,
  COALESCE(SUM(ds.doubles), 0) as doubles,
  COALESCE(SUM(ds.triples), 0) as triples,
  COALESCE(SUM(ds.home_runs), 0) as homeRuns,
  COALESCE(SUM(ds.runs), 0) as runs,
  COALESCE(SUM(ds.rbi), 0) as rbi,
  COALESCE(SUM(ds.strikeouts), 0) as strikeouts,
  COALESCE(SUM(ds.plate_appearances), 0) as plateAppearances,
  COALESCE(SUM(ds.sac_flies), 0) as sacFlies,
  COALESCE(SUM(ds.sac_bunts), 0) as sacBunts,
  COALESCE(SUM(ds.caught_stealing), 0) as caughtStealing,
  COALESCE(SUM(ds.intentional_walks), 0) as intentionalWalks,
  COALESCE(SUM(ds.ground_into_double_play), 0) as groundIntoDoublePlay,
  COALESCE(SUM(ds.left_on_base), 0) as leftOnBase
`;

// --- Generate standings.json ---

console.log('Generating standings.json...');

const statsByPeriod = new Map<number, Map<number, PlayerPeriodScore>>();

for (const period of periods) {
  const rows = sqlite.prepare(`
    SELECT ${EXPANDED_STATS_SELECT}
    FROM daily_stats ds
    JOIN players p ON ds.player_id = p.id
    WHERE p.is_active = 1
      AND ds.game_date >= ?
      AND ds.game_date <= ?
    GROUP BY ds.player_id
  `).all(period.start_date, period.end_date) as any[];

  const map = new Map<number, PlayerPeriodScore>();
  for (const r of rows) {
    map.set(r.playerId, { ...r, slug: slugByPlayerId.get(r.playerId) ?? slugify(r.playerName) });
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
        slug: playerSlug(player),
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
        sacBunts: s?.sacBunts ?? 0,
        caughtStealing: s?.caughtStealing ?? 0,
        intentionalWalks: s?.intentionalWalks ?? 0,
        groundIntoDoublePlay: s?.groundIntoDoublePlay ?? 0,
        leftOnBase: s?.leftOnBase ?? 0,
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
  roster: players
    .filter(p => p.team_id === team.id)
    .sort((a: any, b: any) => a.draft_round - b.draft_round)
    .map((p: any) => ({ ...normalizePlayerRow(p), slug: playerSlug(p) })),
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
        slug: playerSlug(player),
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
        sacBunts: s?.sacBunts ?? 0,
        caughtStealing: s?.caughtStealing ?? 0,
        intentionalWalks: s?.intentionalWalks ?? 0,
        groundIntoDoublePlay: s?.groundIntoDoublePlay ?? 0,
        leftOnBase: s?.leftOnBase ?? 0,
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
      roster: roster
        .sort((a: any, b: any) => a.draft_round - b.draft_round)
        .map((p: any) => ({ ...normalizePlayerRow(p), slug: playerSlug(p) })),
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
    ${EXPANDED_STATS_SELECT.replace(/ds\.player_id as playerId,\n\s+p\.name as playerName,\n\s+p\.team_id as teamId,/, '')}
  FROM players p
  LEFT JOIN daily_stats ds ON ds.player_id = p.id
  WHERE p.is_active = 1
  GROUP BY p.id
  ORDER BY totalScore DESC
`).all() as any[];

const playersOut = playerRows.map(p => ({
  ...p,
  slug: playerSlug(p),
  fantasyTeam: p.teamId != null ? (teamMap.get(p.teamId) ?? '') : '',
}));

fs.writeFileSync(path.join(outDir, 'players.json'), JSON.stringify(playersOut, null, 2));

// --- Generate player-{slug}.json for each player ---

console.log('Generating player detail files...');

// Get all game rows
const allGameRows = sqlite.prepare(`
  SELECT
    ds.player_id as playerId,
    ds.game_date as gameDate,
    ds.game_pk as gamePk,
    ds.at_bats as atBats, ds.hits, ds.doubles, ds.triples,
    ds.home_runs as homeRuns, ds.total_bases as totalBases,
    ds.stolen_bases as stolenBases, ds.walks as baseOnBalls,
    ds.hbp as hitByPitch, ds.runs, ds.rbi,
    ds.strikeouts, ds.plate_appearances as plateAppearances,
    ds.sac_bunts as sacBunts, ds.sac_flies as sacFlies,
    ds.ground_into_double_play as groundIntoDoublePlay,
    ds.ground_into_triple_play as groundIntoTriplePlay,
    ds.left_on_base as leftOnBase, ds.ground_outs as groundOuts,
    ds.fly_outs as flyOuts, ds.line_outs as lineOuts,
    ds.pop_outs as popOuts, ds.air_outs as airOuts,
    ds.catchers_interference as catchersInterference,
    ds.caught_stealing as caughtStealing,
    ds.intentional_walks as intentionalWalks,
    ds.pickoffs, ds.fantasy_score as fantasyScore
  FROM daily_stats ds
  ORDER BY ds.player_id, ds.game_date
`).all() as any[];

// Group games by player
const gamesByPlayer = new Map<number, any[]>();
for (const g of allGameRows) {
  if (!gamesByPlayer.has(g.playerId)) gamesByPlayer.set(g.playerId, []);
  gamesByPlayer.get(g.playerId)!.push(g);
}

// Sort players alphabetically for prev/next nav
const sortedPlayers = [...players].sort((a: any, b: any) => a.name.localeCompare(b.name));

// Compute overall rankings by total fantasy score
const playerRankByScore = playersOut.map((p, idx) => ({ id: p.id, rank: idx + 1 }));
const rankMap = new Map(playerRankByScore.map(r => [r.id, r.rank]));

for (let i = 0; i < sortedPlayers.length; i++) {
  const player = sortedPlayers[i];
  const slug = playerSlug(player);
  const games = gamesByPlayer.get(player.id) || [];

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
    for (const key of Object.keys(seasonTotals) as (keyof typeof seasonTotals)[]) {
      if (key === 'gamesPlayed') continue;
      (seasonTotals as any)[key] += g[key] ?? 0;
    }
  }

  const prev = i > 0 ? sortedPlayers[i - 1] : null;
  const next = i < sortedPlayers.length - 1 ? sortedPlayers[i + 1] : null;

  const detail = {
    player: {
      id: player.id,
      mlbId: player.mlb_id,
      name: player.name,
      slug,
      mlbTeam: player.mlb_team,
      position: player.position,
      teamId: player.team_id,
      fantasyTeam: teamMap.get(player.team_id) ?? 'Unknown',
      draftRound: player.draft_round,
      overallRank: rankMap.get(player.id) ?? sortedPlayers.length,
    },
    seasonTotals,
    games: games.map(g => {
      const { playerId, ...rest } = g;
      return rest;
    }),
    navigation: {
      prevSlug: prev ? playerSlug(prev) : null,
      prevName: prev?.name ?? null,
      nextSlug: next ? playerSlug(next) : null,
      nextName: next?.name ?? null,
    },
  };

  fs.writeFileSync(path.join(outDir, `player-${slug}.json`), JSON.stringify(detail, null, 2));
}

console.log(`Generated ${sortedPlayers.length} player detail files`);

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

  fs.writeFileSync(
    path.join(outDir, 'rankings.json'),
    JSON.stringify({ teamRankings, weeks: weeks.map(w => w.label) }, null, 2)
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
