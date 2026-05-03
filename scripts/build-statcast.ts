/**
 * Pre-aggregates raw pitch-by-pitch data from `pitches.db` into a small JSON
 * payload for the /nerds page: pitch mix, velocity quartiles, pitch-location
 * heatmaps by pitch type, and a launch-speed × launch-angle run-value grid.
 *
 * Output: public/data/statcast-{season}.json (committed; ships with static export).
 *
 * Run-value uses fixed FanGraphs-style linear weights (Tango). Without
 * Statcast's pre-computed delta_run_exp this is a season-agnostic
 * approximation, accurate to within rounding at heatmap resolution.
 *
 * Usage: npx tsx scripts/build-statcast.ts                # all seasons in DB
 *        SEASON=2026 npx tsx scripts/build-statcast.ts    # one season
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dbPath = path.join(process.cwd(), 'pitches.db');
if (!fs.existsSync(dbPath)) {
  console.error(`pitches.db not found — run scripts/sync-pitches.ts first.`);
  process.exit(1);
}
const sqlite = new Database(dbPath, { readonly: true });

// Standard Tango/FanGraphs run values per offensive event (delta run expectancy
// per PA, league-mean approximation). Used as a stand-in when Statcast's
// delta_run_exp isn't on hand. Sources: Tom Tango's Run Values, FanGraphs.
// Negative for outs (cost the offense) — value applies regardless of who fielded.
const RUN_VALUE: Record<string, number> = {
  single:               +0.45,
  double:               +0.75,
  triple:               +1.04,
  home_run:             +1.40,
  field_out:            -0.27,
  force_out:            -0.27,
  grounded_into_double_play: -0.59,
  fielders_choice:      -0.27,
  fielders_choice_out:  -0.27,
  sac_fly:              +0.05,
  sac_bunt:             -0.10,
  field_error:          +0.45,  // ROE ≈ single
  catcher_interf:       +0.31,
  // strikeouts / walks / HBP are typically not classified as in-play, but
  // include them defensively in case the API tags an in-play event with a
  // weird outcome
  strikeout:            -0.30,
  walk:                 +0.31,
  hit_by_pitch:         +0.32,
};

// Friendly pitch-type names so we don't hardcode them in the page.
const PITCH_NAMES: Record<string, string> = {
  FF: '4-Seam Fastball',
  SI: 'Sinker',
  FC: 'Cutter',
  FS: 'Splitter',
  FA: 'Fastball',
  CH: 'Changeup',
  SL: 'Slider',
  ST: 'Sweeper',
  CU: 'Curveball',
  KC: 'Knuckle Curve',
  SV: 'Slurve',
  EP: 'Eephus',
  KN: 'Knuckleball',
  SC: 'Screwball',
  FO: 'Forkball',
  PO: 'Pitch Out',
  IN: 'Intentional Ball',
};

interface PitchRow {
  pitch_type: string | null;
  pitch_name: string | null;
  plate_x: number | null;
  plate_z: number | null;
  release_speed: number | null;
  is_in_play: number;
  launch_speed: number | null;
  launch_angle: number | null;
  event_type: string | null;
}

// Pitch location bin grid. Plate is roughly -0.83..+0.83 ft horizontal,
// strike zone vertical roughly 1.5..3.5 ft. Show -2.5..2.5 / 0.5..4.5 to give
// breathing room around the zone.
const X_MIN = -2.5, X_MAX = 2.5, X_BINS = 25;
const Z_MIN = 0.5,  Z_MAX = 4.5, Z_BINS = 25;
// Strike zone overlay box (approx mean — Statcast publishes per-batter sz_top/bot).
const SZ = { left: -0.83, right: 0.83, bottom: 1.5, top: 3.5 };

// Run-value heatmap dims. Speed bin width 4 mph (40..120 → 20 bins),
// angle bin width 5° (-80..80 → 32 bins).
const LS_MIN = 40,  LS_MAX = 120, LS_BINS = 20;
const LA_MIN = -80, LA_MAX = 80,  LA_BINS = 32;

function binIndex(value: number, min: number, max: number, bins: number): number | null {
  if (value < min || value > max) return null;
  const idx = Math.floor(((value - min) / (max - min)) * bins);
  return idx >= bins ? bins - 1 : idx;
}

function quartiles(sorted: number[]): [number, number, number, number, number] | null {
  if (sorted.length === 0) return null;
  const at = (q: number) => {
    const i = (sorted.length - 1) * q;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  };
  return [sorted[0], at(0.25), at(0.5), at(0.75), sorted[sorted.length - 1]];
}

function buildSeason(season: number) {
  const rows = sqlite.prepare<[number], PitchRow>(`
    SELECT pitch_type, pitch_name, plate_x, plate_z, release_speed, is_in_play,
           launch_speed, launch_angle, event_type
    FROM pitches WHERE season = ?
  `).all(season);

  if (rows.length === 0) {
    console.warn(`  No pitches for season ${season}`);
    return null;
  }

  // ---- Pitch mix + velocity quartiles by pitch type ----
  const byType = new Map<string, { count: number; velocities: number[]; name: string }>();
  for (const r of rows) {
    if (!r.pitch_type) continue;
    let entry = byType.get(r.pitch_type);
    if (!entry) {
      entry = { count: 0, velocities: [], name: r.pitch_name ?? PITCH_NAMES[r.pitch_type] ?? r.pitch_type };
      byType.set(r.pitch_type, entry);
    }
    entry.count++;
    if (typeof r.release_speed === 'number' && r.release_speed > 30) {
      entry.velocities.push(r.release_speed);
    }
  }

  const pitchMix = Array.from(byType.entries())
    .map(([code, e]) => {
      const sorted = e.velocities.slice().sort((a, b) => a - b);
      return {
        code,
        name: e.name,
        count: e.count,
        velocityQuartiles: quartiles(sorted),
        avgVelocity: sorted.length ? sorted.reduce((s, v) => s + v, 0) / sorted.length : null,
      };
    })
    .sort((a, b) => b.count - a.count);
  const totalPitches = pitchMix.reduce((s, x) => s + x.count, 0);

  // ---- Pitch-location density grid by pitch type (top-N for payload size) ----
  const TOP_N_TYPES = 8;
  const topTypes = pitchMix.slice(0, TOP_N_TYPES).map(p => p.code);
  const grids: Record<string, { name: string; grid: number[][]; max: number }> = {};
  for (const code of topTypes) {
    grids[code] = {
      name: byType.get(code)!.name,
      grid: Array.from({ length: Z_BINS }, () => Array(X_BINS).fill(0)),
      max: 0,
    };
  }
  for (const r of rows) {
    if (!r.pitch_type || !grids[r.pitch_type]) continue;
    if (r.plate_x == null || r.plate_z == null) continue;
    const xi = binIndex(r.plate_x, X_MIN, X_MAX, X_BINS);
    const zi = binIndex(r.plate_z, Z_MIN, Z_MAX, Z_BINS);
    if (xi == null || zi == null) continue;
    grids[r.pitch_type].grid[zi][xi]++;
  }
  for (const code of topTypes) {
    let max = 0;
    for (const row of grids[code].grid) for (const v of row) if (v > max) max = v;
    grids[code].max = max;
  }

  // ---- Launch-speed × launch-angle run-value grid (batted balls only) ----
  type Cell = { sum: number; count: number };
  const rvGrid: Cell[][] = Array.from({ length: LA_BINS }, () =>
    Array.from({ length: LS_BINS }, () => ({ sum: 0, count: 0 }))
  );
  let battedBalls = 0;
  let knownOutcomes = 0;
  for (const r of rows) {
    if (!r.is_in_play) continue;
    if (r.launch_speed == null || r.launch_angle == null) continue;
    if (!r.event_type) continue;
    const w = RUN_VALUE[r.event_type];
    if (w == null) continue;
    const si = binIndex(r.launch_speed, LS_MIN, LS_MAX, LS_BINS);
    const ai = binIndex(r.launch_angle, LA_MIN, LA_MAX, LA_BINS);
    if (si == null || ai == null) continue;
    rvGrid[ai][si].sum += w;
    rvGrid[ai][si].count++;
    battedBalls++;
    knownOutcomes++;
  }

  // Flatten grid to {avg, count} and report payload-friendly numbers.
  const battedBallGrid = rvGrid.map(row =>
    row.map(c => ({ avg: c.count > 0 ? c.sum / c.count : null, count: c.count }))
  );

  return {
    season,
    generatedAt: new Date().toISOString(),
    totalPitches,
    battedBalls,
    knownOutcomes,
    pitchMix,
    pitchLocation: {
      xMin: X_MIN, xMax: X_MAX, xBins: X_BINS,
      zMin: Z_MIN, zMax: Z_MAX, zBins: Z_BINS,
      strikeZone: SZ,
      byType: grids,
    },
    battedBallRunValue: {
      lsMin: LS_MIN, lsMax: LS_MAX, lsBins: LS_BINS,
      laMin: LA_MIN, laMax: LA_MAX, laBins: LA_BINS,
      grid: battedBallGrid,
    },
  };
}

function main() {
  const explicit = process.env.SEASON;
  let seasons: number[];
  if (explicit) {
    seasons = [parseInt(explicit, 10)];
  } else {
    const rows = sqlite.prepare(`SELECT DISTINCT season FROM pitches ORDER BY season`).all() as { season: number }[];
    seasons = rows.map(r => r.season);
  }

  if (seasons.length === 0) {
    console.error(`No seasons in pitches.db. Run scripts/sync-pitches.ts first.`);
    process.exit(1);
  }

  const outDir = path.join(process.cwd(), 'public', 'data');
  fs.mkdirSync(outDir, { recursive: true });

  for (const season of seasons) {
    console.log(`Building statcast aggregates for ${season}...`);
    const data = buildSeason(season);
    if (!data) continue;
    const file = path.join(outDir, `statcast-${season}.json`);
    fs.writeFileSync(file, JSON.stringify(data));
    const sizeKB = (fs.statSync(file).size / 1024).toFixed(1);
    console.log(`  ${file}  (${sizeKB} KB · ${data.totalPitches.toLocaleString()} pitches · ${data.battedBalls.toLocaleString()} batted balls)`);
  }
}

main();
