/**
 * Generates public/data/pitchers.json — pitcher metadata + Statcast pitch
 * arsenal for every pitcher who appeared as a probable starter in calendar.json.
 *
 * Two MLB Stats API calls per pitcher:
 *   /api/v1/people/{id}                                    — bio + pitchHand
 *   /api/v1/people/{id}/stats?stats=pitchArsenal&group=pitching&season=2026
 *
 * Pitchers without arsenal data (e.g. just called up) are still emitted with
 * an empty pitches array so the UI can still render a placeholder.
 *
 * Usage: npx tsx scripts/generate-pitchers.ts
 *   (depends on public/data/calendar.json existing — run generate-calendar first)
 */

import path from 'path';
import fs from 'fs';

const BASE_URL = 'https://statsapi.mlb.com';
const SEASON = 2026;
const outDir = path.join(process.cwd(), 'public', 'data');

interface Pitch {
  code: string;          // FF, SL, ST, CH, CU, SI, FC, KC, FS, SV, etc.
  description: string;
  pitchCount: number;
  totalPitches: number;
  percentage: number;    // 0..1
  averageSpeed: number | null;
}

interface SeasonStats {
  gamesStarted: number | null;
  inningsPitched: string | null;  // MLB API returns IP as a string like "27.1"
  era: string | null;
  whip: string | null;
  strikeoutsPer9Inn: string | null;
  walksPer9Inn: string | null;
  strikeOuts: number | null;
  baseOnBalls: number | null;
  wins: number | null;
  losses: number | null;
}

interface Pitcher {
  id: number;
  name: string;
  slug: string;
  mlbTeam: string | null;
  mlbTeamId: number | null;
  pitchHand: 'L' | 'R' | null;
  age: number | null;
  totalPitches: number;
  pitches: Pitch[];
  season: SeasonStats | null;
}

function slugify(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function fetchTeamAbbrevs(): Promise<Map<number, string>> {
  const res = await fetch(`${BASE_URL}/api/v1/teams?sportId=1`);
  const data = await res.json();
  const map = new Map<number, string>();
  for (const t of data.teams || []) {
    if (t.id && t.abbreviation) map.set(t.id, t.abbreviation);
  }
  return map;
}

async function fetchPerson(id: number): Promise<{
  name: string; pitchHand: 'L' | 'R' | null; mlbTeamId: number | null; age: number | null;
} | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/people/${id}`);
    if (!res.ok) return null;
    const data = await res.json();
    const p = (data.people || [])[0];
    if (!p) return null;
    return {
      name: p.fullName ?? '',
      pitchHand: p.pitchHand?.code === 'L' || p.pitchHand?.code === 'R' ? p.pitchHand.code : null,
      mlbTeamId: p.currentTeam?.id ?? null,
      age: p.currentAge ?? null,
    };
  } catch {
    return null;
  }
}

async function fetchSeason(id: number): Promise<SeasonStats | null> {
  try {
    const res = await fetch(
      `${BASE_URL}/api/v1/people/${id}/stats?stats=season&group=pitching&season=${SEASON}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const split = data.stats?.[0]?.splits?.[0];
    if (!split) return null;
    const s = split.stat ?? {};
    return {
      gamesStarted: s.gamesStarted ?? null,
      inningsPitched: s.inningsPitched ?? null,
      era: s.era ?? null,
      whip: s.whip ?? null,
      strikeoutsPer9Inn: s.strikeoutsPer9Inn ?? null,
      walksPer9Inn: s.walksPer9Inn ?? null,
      strikeOuts: s.strikeOuts ?? null,
      baseOnBalls: s.baseOnBalls ?? null,
      wins: s.wins ?? null,
      losses: s.losses ?? null,
    };
  } catch {
    return null;
  }
}

async function fetchArsenal(id: number): Promise<{ pitches: Pitch[]; totalPitches: number }> {
  try {
    const res = await fetch(
      `${BASE_URL}/api/v1/people/${id}/stats?stats=pitchArsenal&group=pitching&season=${SEASON}`
    );
    if (!res.ok) return { pitches: [], totalPitches: 0 };
    const data = await res.json();
    const splits = data.stats?.[0]?.splits ?? [];
    const pitches: Pitch[] = splits.map((s: { stat: { type?: { code?: string; description?: string }; count?: number; totalPitches?: number; percentage?: number; averageSpeed?: number } }) => ({
      code: s.stat?.type?.code ?? '?',
      description: s.stat?.type?.description ?? 'Unknown',
      pitchCount: s.stat?.count ?? 0,
      totalPitches: s.stat?.totalPitches ?? 0,
      percentage: s.stat?.percentage ?? 0,
      averageSpeed: typeof s.stat?.averageSpeed === 'number' ? s.stat.averageSpeed : null,
    }));
    pitches.sort((a, b) => b.percentage - a.percentage);
    const totalPitches = pitches[0]?.totalPitches ?? 0;
    return { pitches, totalPitches };
  } catch {
    return { pitches: [], totalPitches: 0 };
  }
}

function rateLimit<T>(items: T[], chunk: number, ms: number, work: (t: T) => Promise<void>): Promise<void> {
  return (async () => {
    for (let i = 0; i < items.length; i += chunk) {
      const slice = items.slice(i, i + chunk);
      await Promise.all(slice.map(work));
      if (i + chunk < items.length && ms > 0) await new Promise(r => setTimeout(r, ms));
    }
  })();
}

async function main() {
  const calendarPath = path.join(outDir, 'calendar.json');
  if (!fs.existsSync(calendarPath)) {
    console.error('calendar.json not found — run generate-calendar.ts first');
    process.exit(1);
  }
  const calendar = JSON.parse(fs.readFileSync(calendarPath, 'utf-8'));

  // Collect unique probable pitchers, and capture each pitcher's MLB team from
  // the calendar (the /people/{id} API often returns currentTeam=null even for
  // active starters, so we use the calendar as the authoritative source).
  const seen = new Map<number, string>();
  const teamFromCalendar = new Map<number, { id: number; abbr: string }>();
  for (const g of calendar.games) {
    if (g.awayPitcher?.id) {
      seen.set(g.awayPitcher.id, g.awayPitcher.name);
      if (g.away?.id && g.away?.abbr && !teamFromCalendar.has(g.awayPitcher.id)) {
        teamFromCalendar.set(g.awayPitcher.id, { id: g.away.id, abbr: g.away.abbr });
      }
    }
    if (g.homePitcher?.id) {
      seen.set(g.homePitcher.id, g.homePitcher.name);
      if (g.home?.id && g.home?.abbr && !teamFromCalendar.has(g.homePitcher.id)) {
        teamFromCalendar.set(g.homePitcher.id, { id: g.home.id, abbr: g.home.abbr });
      }
    }
  }
  const ids = Array.from(seen.keys());
  console.log(`Found ${ids.length} unique probable pitchers in calendar.json`);

  const teamAbbrevs = await fetchTeamAbbrevs();

  const pitchers: Pitcher[] = [];
  // 8 concurrent requests at a time, no inter-batch sleep — MLB Stats API
  // tolerates this fine and the script otherwise takes forever.
  await rateLimit(ids, 8, 0, async (id) => {
    const [person, arsenal, season] = await Promise.all([
      fetchPerson(id),
      fetchArsenal(id),
      fetchSeason(id),
    ]);
    // Prefer calendar-derived team (always present for probable starters); fall
    // back on the /people endpoint if for some reason it's missing.
    const calTeam = teamFromCalendar.get(id);
    const mlbTeamId = calTeam?.id ?? person?.mlbTeamId ?? null;
    const mlbTeam = calTeam?.abbr ?? (person?.mlbTeamId != null ? (teamAbbrevs.get(person.mlbTeamId) ?? null) : null);
    pitchers.push({
      id,
      name: person?.name ?? seen.get(id) ?? `MLB#${id}`,
      slug: slugify(person?.name ?? seen.get(id) ?? `mlb-${id}`) + `-${id}`,
      mlbTeam,
      mlbTeamId,
      pitchHand: person?.pitchHand ?? null,
      age: person?.age ?? null,
      totalPitches: arsenal.totalPitches,
      pitches: arsenal.pitches,
      season,
    });
  });
  pitchers.sort((a, b) => b.totalPitches - a.totalPitches);

  fs.writeFileSync(
    path.join(outDir, 'pitchers.json'),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      season: SEASON,
      pitchers,
    }, null, 2),
  );

  console.log(`Wrote ${pitchers.length} pitchers (${pitchers.filter(p => p.pitches.length > 0).length} with arsenal data)`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
