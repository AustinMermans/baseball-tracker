/**
 * Generates public/data/calendar.json from the MLB Stats API schedule endpoint.
 * Range: season start (2026-03-26) → today + 14 days.
 *
 * Usage: npx tsx scripts/generate-calendar.ts
 *
 * One network call (no DB); safe to run independently of sync-and-build.
 */

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

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const today = new Date();
  const endDate = ymd(plusDays(today, 14));

  console.log(`Fetching schedule ${SEASON_START} → ${endDate}...`);
  const games = await fetchScheduleRange(SEASON_START, endDate);
  console.log(`Got ${games.length} games`);

  fs.writeFileSync(
    path.join(outDir, 'calendar.json'),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      seasonStart: SEASON_START,
      endDate,
      games,
    }, null, 2),
  );

  console.log(`Wrote ${path.join(outDir, 'calendar.json')}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
