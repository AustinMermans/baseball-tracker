/**
 * Generates public/data/calendar.json from the MLB Stats API schedule endpoint
 * plus a small rosteredByTeam map pulled from baseball.db so the calendar
 * page can show "your players are playing today" without loading players.json.
 *
 * Range: season start (2026-03-26) → today + 14 days.
 *
 * Usage: npx tsx scripts/generate-calendar.ts
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'https://statsapi.mlb.com';
const outDir = path.join(process.cwd(), 'public', 'data');
const SEASON_START = '2026-03-26';

interface CalendarTeam {
  id: number;
  abbr: string | null;
  name: string;
}

interface CalendarGame {
  date: string;
  gamePk: number;
  away: CalendarTeam;
  home: CalendarTeam;
  awayScore: number | null;
  homeScore: number | null;
  status: string;          // e.g. "F" (final), "S" (scheduled), "I" (in progress), "P" (preview)
  detailedState: string;   // human-readable, e.g. "Final", "In Progress", "Scheduled"
  gameTimeISO: string | null;
  doubleHeader: string | null;
}

function plusDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function ymd(d: Date): string {
  return d.toISOString().split('T')[0];
}

async function fetchAbbrevMap(): Promise<Map<number, string>> {
  const res = await fetch(`${BASE_URL}/api/v1/teams?sportId=1`);
  if (!res.ok) throw new Error(`Teams failed: ${res.status}`);
  const data = await res.json();
  const map = new Map<number, string>();
  for (const t of data.teams || []) {
    if (t.id && t.abbreviation) map.set(t.id, t.abbreviation);
  }
  return map;
}

async function fetchScheduleRange(start: string, end: string): Promise<CalendarGame[]> {
  const url = `${BASE_URL}/api/v1/schedule?sportId=1&startDate=${start}&endDate=${end}&hydrate=team,linescore`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Schedule failed: ${res.status}`);
  const data = await res.json();
  const out: CalendarGame[] = [];
  const abbrevs = await fetchAbbrevMap();

  for (const day of data.dates || []) {
    for (const g of day.games || []) {
      const date: string = g.gameDate ? g.gameDate.split('T')[0] : day.date;
      const home = g.teams?.home?.team ?? {};
      const away = g.teams?.away?.team ?? {};
      out.push({
        date,
        gamePk: g.gamePk,
        away: {
          id: away.id,
          abbr: abbrevs.get(away.id) ?? null,
          name: away.teamName ?? away.name ?? '',
        },
        home: {
          id: home.id,
          abbr: abbrevs.get(home.id) ?? null,
          name: home.teamName ?? home.name ?? '',
        },
        awayScore: g.teams?.away?.score ?? null,
        homeScore: g.teams?.home?.score ?? null,
        status: g.status?.statusCode ?? 'S',
        detailedState: g.status?.detailedState ?? 'Scheduled',
        gameTimeISO: g.gameDate ?? null,
        doubleHeader: g.doubleHeader && g.doubleHeader !== 'N' ? g.doubleHeader : null,
      });
    }
  }

  return out;
}

interface RosterEntry {
  name: string;
  slug: string;
  fantasyTeam: string;
  fantasyTeamId: number;
}

function buildRosterMap(): Record<string, RosterEntry[]> {
  // Slugify mirrors src/lib/utils.ts and the matching helper in
  // generate-static.ts. The bare-name slug is correct for rostered players
  // (the slug-collision logic in generate-static appends -mlbId only for
  // non-rostered players, so we'll never collide here).
  const slugify = (name: string) =>
    name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const dbPath = path.join(process.cwd(), 'baseball.db');
  if (!fs.existsSync(dbPath)) return {};

  const sqlite = new Database(dbPath, { readonly: true });
  const rows = sqlite.prepare(`
    SELECT p.name, p.mlb_team as mlbTeam, p.team_id as teamId, t.name as fantasyTeam
    FROM players p
    JOIN teams t ON t.id = p.team_id
    WHERE p.is_active = 1 AND p.team_id IS NOT NULL AND p.mlb_team IS NOT NULL
  `).all() as Array<{ name: string; mlbTeam: string; teamId: number; fantasyTeam: string }>;
  sqlite.close();

  const map: Record<string, RosterEntry[]> = {};
  for (const r of rows) {
    if (!map[r.mlbTeam]) map[r.mlbTeam] = [];
    map[r.mlbTeam].push({
      name: r.name,
      slug: slugify(r.name),
      fantasyTeam: r.fantasyTeam,
      fantasyTeamId: r.teamId,
    });
  }
  // Stable order within each team — by fantasy-team owner then name.
  for (const team of Object.values(map)) {
    team.sort((a, b) =>
      a.fantasyTeam.localeCompare(b.fantasyTeam) || a.name.localeCompare(b.name)
    );
  }
  return map;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const today = new Date();
  const endDate = ymd(plusDays(today, 14));

  console.log(`Fetching schedule ${SEASON_START} → ${endDate}...`);
  const games = await fetchScheduleRange(SEASON_START, endDate);
  console.log(`Got ${games.length} games`);

  console.log('Building roster map...');
  const rosteredByTeam = buildRosterMap();
  const rosterTotal = Object.values(rosteredByTeam).reduce((s, arr) => s + arr.length, 0);
  console.log(`Mapped ${rosterTotal} drafted players across ${Object.keys(rosteredByTeam).length} MLB teams`);

  fs.writeFileSync(
    path.join(outDir, 'calendar.json'),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      seasonStart: SEASON_START,
      endDate,
      games,
      rosteredByTeam,
    }, null, 2),
  );

  console.log(`Wrote ${path.join(outDir, 'calendar.json')}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
