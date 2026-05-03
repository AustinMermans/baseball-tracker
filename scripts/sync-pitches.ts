/**
 * Pitch-by-pitch Statcast extractor.
 *
 * For every completed game in the given date range, parses
 * `/api/v1.1/game/{gamePk}/feed/live` and writes one row per pitch into
 * `pitches.db` (gitignored — see /.gitignore). Aggregates derived from this
 * DB ship as `public/data/statcast-{season}.json` via build-statcast.ts.
 *
 * Idempotent: PRIMARY KEY on (game_pk, ab_index, pitch_index) means re-runs
 * upsert without duplicating. Designed to piggyback on the daily CI pipeline
 * (only fetches games newer than MAX(game_date) by default).
 *
 * Usage:
 *   npx tsx scripts/sync-pitches.ts                # incremental from latest synced date
 *   START=2026-03-26 END=2026-04-30 npx tsx scripts/sync-pitches.ts   # explicit range
 *   BACKFILL=true npx tsx scripts/sync-pitches.ts  # full season from 2026-03-26
 */

import Database from 'better-sqlite3';
import path from 'path';

const BASE_URL = 'https://statsapi.mlb.com';
const SEASON_START = '2026-03-26';
const dbPath = path.join(process.cwd(), 'pitches.db');
const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS pitches (
    game_pk      INTEGER NOT NULL,
    ab_index     INTEGER NOT NULL,
    pitch_index  INTEGER NOT NULL,
    game_date    TEXT    NOT NULL,
    season       INTEGER NOT NULL,
    inning       INTEGER,
    half_inning  TEXT,
    pitcher_id   INTEGER,
    batter_id    INTEGER,
    pitcher_hand TEXT,
    batter_hand  TEXT,
    pitch_type   TEXT,
    pitch_name   TEXT,
    plate_x      REAL,
    plate_z      REAL,
    sz_top       REAL,
    sz_bot       REAL,
    release_speed REAL,
    pfx_x        REAL,
    pfx_z        REAL,
    is_in_play   INTEGER,
    launch_speed REAL,
    launch_angle REAL,
    total_distance REAL,
    trajectory   TEXT,
    event        TEXT,
    event_type   TEXT,
    PRIMARY KEY (game_pk, ab_index, pitch_index)
  );
  CREATE INDEX IF NOT EXISTS idx_pitches_season ON pitches(season);
  CREATE INDEX IF NOT EXISTS idx_pitches_date   ON pitches(game_date);
  CREATE INDEX IF NOT EXISTS idx_pitches_pitcher ON pitches(pitcher_id);
  CREATE INDEX IF NOT EXISTS idx_pitches_batter  ON pitches(batter_id);
`);

const insertPitch = sqlite.prepare(`
  INSERT OR REPLACE INTO pitches (
    game_pk, ab_index, pitch_index, game_date, season, inning, half_inning,
    pitcher_id, batter_id, pitcher_hand, batter_hand,
    pitch_type, pitch_name, plate_x, plate_z, sz_top, sz_bot,
    release_speed, pfx_x, pfx_z, is_in_play,
    launch_speed, launch_angle, total_distance, trajectory,
    event, event_type
  ) VALUES (
    @game_pk, @ab_index, @pitch_index, @game_date, @season, @inning, @half_inning,
    @pitcher_id, @batter_id, @pitcher_hand, @batter_hand,
    @pitch_type, @pitch_name, @plate_x, @plate_z, @sz_top, @sz_bot,
    @release_speed, @pfx_x, @pfx_z, @is_in_play,
    @launch_speed, @launch_angle, @total_distance, @trajectory,
    @event, @event_type
  )
`);

interface PitchRow {
  game_pk: number;
  ab_index: number;
  pitch_index: number;
  game_date: string;
  season: number;
  inning: number | null;
  half_inning: string | null;
  pitcher_id: number | null;
  batter_id: number | null;
  pitcher_hand: string | null;
  batter_hand: string | null;
  pitch_type: string | null;
  pitch_name: string | null;
  plate_x: number | null;
  plate_z: number | null;
  sz_top: number | null;
  sz_bot: number | null;
  release_speed: number | null;
  pfx_x: number | null;
  pfx_z: number | null;
  is_in_play: number;
  launch_speed: number | null;
  launch_angle: number | null;
  total_distance: number | null;
  trajectory: string | null;
  event: string | null;
  event_type: string | null;
}

async function getSchedule(start: string, end: string): Promise<{ gamePk: number; gameDate: string; status: string }[]> {
  const res = await fetch(`${BASE_URL}/api/v1/schedule?sportId=1&startDate=${start}&endDate=${end}`);
  if (!res.ok) throw new Error(`Schedule failed: ${res.status}`);
  const data = await res.json();
  const games: { gamePk: number; gameDate: string; status: string }[] = [];
  for (const d of data.dates ?? []) {
    for (const g of d.games ?? []) {
      // gameDate is an ISO timestamp. Use officialDate when present (the calendar day).
      const date = (g.officialDate as string) ?? d.date;
      games.push({ gamePk: g.gamePk, gameDate: date, status: g.status?.detailedState ?? '' });
    }
  }
  return games;
}

function extractPitches(gamePk: number, gameDate: string, season: number, feed: any): PitchRow[] {
  const rows: PitchRow[] = [];
  const allPlays = feed?.liveData?.plays?.allPlays ?? [];
  for (let abIndex = 0; abIndex < allPlays.length; abIndex++) {
    const play = allPlays[abIndex];
    const matchup = play?.matchup ?? {};
    const result = play?.result ?? {};
    const about = play?.about ?? {};
    const events: any[] = play?.playEvents ?? [];

    let pitchSeq = 0;
    for (const ev of events) {
      if (!ev?.isPitch) continue;
      const pd = ev.pitchData ?? {};
      const coords = pd.coordinates ?? {};
      const hd = ev.hitData ?? null;
      const det = ev.details ?? {};
      const isInPlay = !!det.isInPlay;

      rows.push({
        game_pk: gamePk,
        ab_index: abIndex,
        pitch_index: pitchSeq++,
        game_date: gameDate,
        season,
        inning: about.inning ?? null,
        half_inning: about.halfInning ?? null,
        pitcher_id: matchup.pitcher?.id ?? null,
        batter_id: matchup.batter?.id ?? null,
        pitcher_hand: matchup.pitchHand?.code ?? null,
        batter_hand: matchup.batSide?.code ?? null,
        pitch_type: det.type?.code ?? null,
        pitch_name: det.type?.description ?? null,
        plate_x: typeof coords.pX === 'number' ? coords.pX : null,
        plate_z: typeof coords.pZ === 'number' ? coords.pZ : null,
        sz_top: typeof pd.strikeZoneTop === 'number' ? pd.strikeZoneTop : null,
        sz_bot: typeof pd.strikeZoneBottom === 'number' ? pd.strikeZoneBottom : null,
        release_speed: typeof pd.startSpeed === 'number' ? pd.startSpeed : null,
        pfx_x: typeof coords.pfxX === 'number' ? coords.pfxX : null,
        pfx_z: typeof coords.pfxZ === 'number' ? coords.pfxZ : null,
        is_in_play: isInPlay ? 1 : 0,
        launch_speed: hd?.launchSpeed ?? null,
        launch_angle: hd?.launchAngle ?? null,
        total_distance: hd?.totalDistance ?? null,
        trajectory: hd?.trajectory ?? null,
        // Result is at the play level — only the terminal pitch of the AB caused it.
        // We attach the result to every pitch in the AB so isInPlay rows get the
        // correct outcome and other pitches just carry it as context.
        event: result.event ?? null,
        event_type: result.eventType ?? null,
      });
    }
  }
  return rows;
}

async function fetchFeedLive(gamePk: number): Promise<any | null> {
  const res = await fetch(`${BASE_URL}/api/v1.1/game/${gamePk}/feed/live`);
  if (!res.ok) {
    console.warn(`  feed/live ${gamePk}: ${res.status}`);
    return null;
  }
  return res.json();
}

function determineDateRange(): { start: string; end: string } {
  const explicitStart = process.env.START;
  const explicitEnd = process.env.END;
  if (explicitStart && explicitEnd) return { start: explicitStart, end: explicitEnd };

  if (process.env.BACKFILL === 'true') {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    return { start: SEASON_START, end: yesterday.toISOString().slice(0, 10) };
  }

  const row = sqlite.prepare(`SELECT MAX(game_date) as max_date FROM pitches`).get() as { max_date: string | null };
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const end = yesterday.toISOString().slice(0, 10);

  if (!row?.max_date) return { start: SEASON_START, end };
  const startDate = new Date(row.max_date);
  startDate.setUTCDate(startDate.getUTCDate() + 1);
  return { start: startDate.toISOString().slice(0, 10), end };
}

async function main() {
  const { start, end } = determineDateRange();
  if (start > end) {
    console.log(`Up to date — last synced ${start} > ${end}`);
    return;
  }

  console.log(`Pitch sync ${start} → ${end}`);
  const games = await getSchedule(start, end);
  const completed = games.filter(g => /Final|Game Over|Completed Early/.test(g.status));
  console.log(`  ${completed.length} completed games (${games.length - completed.length} skipped non-final)`);

  const insertMany = sqlite.transaction((rows: PitchRow[]) => {
    for (const r of rows) insertPitch.run(r);
  });

  let totalPitches = 0;
  let processed = 0;
  for (const g of completed) {
    const season = parseInt(g.gameDate.slice(0, 4), 10);
    const feed = await fetchFeedLive(g.gamePk);
    if (!feed) continue;
    const rows = extractPitches(g.gamePk, g.gameDate, season, feed);
    if (rows.length > 0) insertMany(rows);
    totalPitches += rows.length;
    processed++;
    if (processed % 25 === 0) console.log(`  [${processed}/${completed.length}] ${totalPitches.toLocaleString()} pitches`);
  }

  console.log(`\nDone. ${processed} games · ${totalPitches.toLocaleString()} pitches inserted/replaced.`);
  const final = sqlite.prepare(`SELECT COUNT(*) as c FROM pitches`).get() as { c: number };
  console.log(`Total in DB: ${final.c.toLocaleString()}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
