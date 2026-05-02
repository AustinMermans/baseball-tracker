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

  // Collect unique probable pitchers
  const seen = new Map<number, string>();
  for (const g of calendar.games) {
    for (const p of [g.awayPitcher, g.homePitcher]) {
      if (p?.id) seen.set(p.id, p.name);
    }
  }
  const ids = Array.from(seen.keys());
  console.log(`Found ${ids.length} unique probable pitchers in calendar.json`);

  const teamAbbrevs = await fetchTeamAbbrevs();

  const pitchers: Pitcher[] = [];
  // 8 concurrent requests at a time, no inter-batch sleep — MLB Stats API
  // tolerates this fine and the script otherwise takes forever.
  await rateLimit(ids, 8, 0, async (id) => {
    const [person, arsenal] = await Promise.all([fetchPerson(id), fetchArsenal(id)]);
    pitchers.push({
      id,
      name: person?.name ?? seen.get(id) ?? `MLB#${id}`,
      slug: slugify(person?.name ?? seen.get(id) ?? `mlb-${id}`) + `-${id}`,
      mlbTeam: person?.mlbTeamId != null ? (teamAbbrevs.get(person.mlbTeamId) ?? null) : null,
      mlbTeamId: person?.mlbTeamId ?? null,
      pitchHand: person?.pitchHand ?? null,
      age: person?.age ?? null,
      totalPitches: arsenal.totalPitches,
      pitches: arsenal.pitches,
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
