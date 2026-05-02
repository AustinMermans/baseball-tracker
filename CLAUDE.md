# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Local dev — Next.js with API routes hitting SQLite directly (http://localhost:3000)
npm run build    # Standard Next.js build (server mode)
npm run lint     # next lint (ESLint with next/core-web-vitals + next/typescript)
npm start        # Run the built server

# Static export (what GitHub Pages runs). Note: this requires src/app/api to be removed first
# (the GH Action does `rm -rf src/app/api` before building).
STATIC_EXPORT=true NEXT_PUBLIC_STATIC=true NEXT_PUBLIC_BASE_PATH=/baseball-tracker npx next build

# Data scripts
npx tsx src/db/seed.ts                       # Re-seed baseball.db from scratch (only if DB is missing)
npx tsx scripts/sync-and-build.ts            # Incremental MLB stat sync + regenerate every public/data/*.json
BACKFILL=true npx tsx scripts/sync-and-build.ts  # Full re-sync from season start (idempotent; takes ~7 minutes)
npx tsx scripts/generate-static.ts           # Just regenerate batter JSON from current DB (no MLB fetch)
npx tsx scripts/generate-calendar.ts         # Refresh public/data/calendar.json from MLB API
npx tsx scripts/generate-pitchers.ts         # Refresh public/data/pitchers.json (Statcast pitch arsenals; ~30s)
npx tsx scripts/refresh-player-teams.ts      # Update mlb_team & position for every player from MLB API (one call)
npx tsx scripts/migrate-add-stats.ts         # One-shot migration that added the 23 expanded batting columns to daily_stats

# UI / aesthetic regression checks (Playwright)
npx tsx scripts/site-review.ts               # Crawl primary pages at desktop+mobile, capture screenshots & flag issues to /tmp/site-review/
```

There is no test suite — `package.json` defines no `test` script.

## Architecture

This app is a Next.js 14 (App Router) site that ships in **two modes from the same codebase**, controlled by environment variables. Understanding the dual-mode design is the single most important thing to know before changing anything.

### Dual-mode build

| Mode | When | Data source | Trigger |
|------|------|-------------|---------|
| **Server / API** | Local dev (`npm run dev`) | SQLite via `better-sqlite3` through `src/app/api/*` routes | default |
| **Static** | GitHub Pages deploy | Pre-generated JSON in `public/data/` | `STATIC_EXPORT=true` + `NEXT_PUBLIC_STATIC=true` |

`next.config.mjs` switches on `STATIC_EXPORT`. In static mode it sets `output: 'export'` and applies `NEXT_PUBLIC_BASE_PATH` (the GH Action sets this to `/baseball-tracker`). In server mode it whitelists `better-sqlite3` as an external package.

Pages don't branch on mode themselves. Instead, `src/lib/data.ts` exposes a single `fetchData()` helper. It calls `dataUrl(path)`, which in static mode rewrites `/api/standings` → `/data/standings.json`, `/api/teams/3` → `/data/team-3.json`, `/api/players/aaron-judge` → `/data/player-aaron-judge.json`, etc., and prepends `NEXT_PUBLIC_BASE_PATH`. **Always go through `fetchData()`** — don't hardcode either `/api/...` or `/data/...` URLs in components.

The static build cannot include API routes (they aren't compatible with `output: 'export'`). The GH Action does `rm -rf src/app/api` immediately before `next build`. So any new API route must have a counterpart JSON file emitted by `generate-static.ts`, with a matching shape, plus an entry in `staticMap` (or a regex branch) inside `src/lib/data.ts`.

### Dynamic routes and `generateStaticParams`

For `output: 'export'`, every dynamic segment must be enumerable at build time. The pattern in this repo: put `generateStaticParams` in a sibling `layout.tsx` that reads from `public/data/*.json` to pull the param list (see `src/app/players/[slug]/layout.tsx` reading `players.json`). The page component itself stays a `'use client'` component using `fetchData()`. New dynamic routes need this layout file or the static build will fail.

### Data layer

- **`baseball.db`** is committed to the repo (~840KB after the all-MLB backfill). It's the source of truth in dev and gets updated daily by CI.
- **`src/db/schema.ts`** is a Drizzle schema, but most queries throughout `scripts/` and the API routes use **raw `better-sqlite3` prepared statements**, not Drizzle's query builder. Drizzle is essentially used for schema declaration and inferred types. When adding queries, follow the prevailing raw-SQL pattern.
- Tables: `teams` (8), `players` (~460 active hitters: 104 rostered + ~356 discovered via boxscore), `daily_stats` (per-player per-game), `team_daily_scores`, `season_periods` (3 periods), `redraft_log`.
- The `players` table is populated two ways: (a) `seed.ts` inserts the 104 rostered players with `team_id` set; (b) `sync-and-build.ts` upserts every batter that appears in a boxscore with PA, with `team_id` left NULL. The combined set is what powers the `/players` leaderboard.
- `daily_stats` has the 4 fantasy-scoring columns (`total_bases`, `stolen_bases`, `walks`, `hbp`, plus the precomputed `fantasy_score`) **plus 23 expanded batting columns** (`at_bats`, `hits`, `doubles`, `triples`, `home_runs`, `runs`, `rbi`, `strikeouts`, etc.) used by player detail pages.
- `src/lib/stats.ts` derives rate stats (AVG / OBP / SLG, cumulative + rolling-window averages) from raw counting stats. Rate stats are never stored.
- **camelCase normalization gotcha**: API routes return camelCase via Drizzle (`mlbTeam`, `draftRound`); raw SQL `SELECT *` from `players` produces snake_case (`mlb_team`, `draft_round`). `generate-static.ts` has a `normalizePlayerRow()` helper that converts to camelCase so static JSON matches the API shape — use it when emitting player rows in any new generator.

### Scoring rules (`src/lib/scoring.ts`)

- Per-game `fantasy_score = total_bases + stolen_bases + walks + hit_by_pitch`. Stored on each `daily_stats` row.
- Per-period team score is **best ball**: top 10 of each team's 13 players by cumulative period score count; the other 3 are "bench" for that period. Computed by `computeBestBall()`.
- The `computeBestBall` logic is duplicated verbatim in `scripts/generate-static.ts` to keep that script free of `src/lib` imports — keep both copies in sync if you change the rule.

### Daily sync flow (CI)

`.github/workflows/deploy.yml` runs daily at 07:00 UTC and on manual dispatch:

1. Checkout → `npm ci`
2. `npx tsx scripts/sync-and-build.ts` — figures out the date range as `(MAX(game_date) + 1day)` through `yesterday` (season start fallback `2026-03-26`), fetches MLB schedule + boxscores for completed games, upserts into `daily_stats`, *and* upserts any newly-seen batters into `players` (with `team_id` NULL = non-rostered). Then chains: `refresh-player-teams.ts` (one MLB API call to update mlb_team/position for trades) → `generate-static.ts` (DB → batter JSON) → `generate-calendar.ts` (one MLB API call: schedule + linescore + probablePitcher hydrate) → `generate-pitchers.ts` (~209 pitchers × 2 calls each, 8-way concurrent, ~30s).
3. Commits `baseball.db` and `public/data/` back to `master` with message `Daily stat sync YYYY-MM-DD` (this is why git log is dominated by those commits — pull frequently or your local will fall many commits behind).
4. `rm -rf src/app/api`, then static build with the env vars above, then deploy to Pages.

The sync is **incremental** — only fetches games since the last synced date — so daily runs take ~1 minute. A full backfill happens automatically if `daily_stats` is empty, or on demand via `BACKFILL=true`.

The MLB Stats API (`statsapi.mlb.com`) is free and key-less. Endpoints used: `/api/v1/schedule` (with hydrates `team,linescore,probablePitcher`), `/api/v1.1/game/{gamePk}/feed/live`, `/api/v1/teams?sportId=1`, `/api/v1/sports/1/players?season=2026`, `/api/v1/people/{id}`, `/api/v1/people/{id}/stats?stats=pitchArsenal&group=pitching`.

## Conventions

- UI primitives in `src/components/ui/` are shadcn-style (Card, Button, Badge, Tabs). `components.json` is shadcn config — don't hand-edit those primitives unless extending shadcn patterns.
- When adding a new page that needs data, the pattern is: add an API route under `src/app/api/<thing>/route.ts`, add a corresponding emitter in `scripts/generate-static.ts` that writes `public/data/<thing>.json` with the same shape, and add the path to the `staticMap` (or a regex branch) in `src/lib/data.ts`. Missing any of the three breaks the static build silently. For dynamic-segment routes, also add `generateStaticParams` in a sibling `layout.tsx`.
- Player detail pages (`/players/[slug]`) display the full 27-stat batting line with Key/All toggles and an AVG trend chart. The players leaderboard (`/players`) has a Fantasy / Key / All view toggle plus orthogonal filters (Drafted-status, MLB team, free-text search) — every filter is mirrored in URL search params for shareable links. CSV export reflects the active view and includes the view name in the filename.
- Player comparison (`/compare?players=slug1,slug2,slug3`, max 3) overlays cumulative AVG curves and shows a side-by-side season-totals table with per-stat leader highlighted in their player's series color. Selection workflow: each row on `/players` has a small +/✓ toggle; floating bottom bar appears with up-to-3 chosen and a "Compare →" link.
- Game calendar (`/calendar`) shows a month grid with click-to-expand day-detail. Each game shows the team matchup, score (final) or game-time (scheduled), the probable starter matchup ("X vs Y"), and a 2-column list of every drafted player on either team with their fantasy-team owner. Data is built once at sync time (single `?hydrate=team,linescore,probablePitcher` call).
- Pitchers (`/pitchers`) lists every probable starter with their Statcast pitch arsenal (usage % + average velocity per pitch type, Savant-style colors). Click any row to expand a labeled stacked bar + breakdown table. Filterable by throwing hand / MLB team / free text; URL-state-synced.
- Team page roster (`/teams/[teamId]`) shows a games-next-7d badge on each rostered player (color-coded green-ish for 6+, neutral for 1-5, faded for 0) so users can spot light-schedule weeks for best-ball matchup planning.

## Project notes file

`notes for extension of this.md` (project-private, currently untracked) tracks Austin's running ideas. As of 2026-05-02 the active item is:

1. Forecasting / EDA module driven by `30_Lab/` MLB forecasting work — deferred. Earlier items (game calendar, all-MLB-hitter extension, Statcast pitcher viz) all shipped.
