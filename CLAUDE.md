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
npx tsx src/db/seed.ts                  # Re-seed baseball.db from scratch (only if DB is missing)
npx tsx scripts/sync-and-build.ts       # Incremental MLB stat sync + regenerate public/data/*.json
npx tsx scripts/generate-static.ts      # Just regenerate JSON from current DB (no MLB fetch)
npx tsx scripts/migrate-add-stats.ts    # One-shot migration that added the 23 expanded batting columns to daily_stats
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

- **`baseball.db`** is committed to the repo (~260KB). It's the source of truth in dev and gets updated daily by CI.
- **`src/db/schema.ts`** is a Drizzle schema, but most queries throughout `scripts/` and the API routes use **raw `better-sqlite3` prepared statements**, not Drizzle's query builder. Drizzle is essentially used for schema declaration and inferred types. When adding queries, follow the prevailing raw-SQL pattern.
- Tables: `teams` (8), `players` (104 rostered, with `mlb_id` linking to MLB Stats API), `daily_stats` (per-player per-game), `team_daily_scores`, `season_periods` (3 periods), `redraft_log`.
- `daily_stats` has the 4 fantasy-scoring columns (`total_bases`, `stolen_bases`, `walks`, `hbp`, plus the precomputed `fantasy_score`) **plus 23 expanded batting columns** (`at_bats`, `hits`, `doubles`, `triples`, `home_runs`, `runs`, `rbi`, `strikeouts`, etc.) used by player detail pages.
- `src/lib/stats.ts` derives rate stats (AVG / OBP / SLG, cumulative + rolling-window averages) from raw counting stats. Rate stats are never stored.

### Scoring rules (`src/lib/scoring.ts`)

- Per-game `fantasy_score = total_bases + stolen_bases + walks + hit_by_pitch`. Stored on each `daily_stats` row.
- Per-period team score is **best ball**: top 10 of each team's 13 players by cumulative period score count; the other 3 are "bench" for that period. Computed by `computeBestBall()`.
- The `computeBestBall` logic is duplicated verbatim in `scripts/generate-static.ts` to keep that script free of `src/lib` imports — keep both copies in sync if you change the rule.

### Daily sync flow (CI)

`.github/workflows/deploy.yml` runs daily at 07:00 UTC and on manual dispatch:

1. Checkout → `npm ci`
2. `npx tsx scripts/sync-and-build.ts` — figures out the date range as `(MAX(game_date) + 1day)` through `yesterday` (season start fallback `2026-03-26`), fetches MLB schedule + boxscores for completed games, upserts into `daily_stats`, then shells out to `generate-static.ts` to rewrite `public/data/*.json`.
3. Commits `baseball.db` and `public/data/` back to `master` with message `Daily stat sync YYYY-MM-DD` (this is why git log is dominated by those commits — pull frequently or your local will fall many commits behind).
4. `rm -rf src/app/api`, then static build with the env vars above, then deploy to Pages.

The sync is **incremental** — only fetches games since the last synced date — so daily runs take ~30 seconds. A full backfill happens automatically if `daily_stats` is empty.

The MLB Stats API (`statsapi.mlb.com`) is free and key-less. `sync-and-build.ts` uses `/api/v1/schedule` for game lists and `/api/v1.1/game/{gamePk}/feed/live` for boxscores, filtering to `statusCode === 'F'` (final).

## Conventions

- UI primitives in `src/components/ui/` are shadcn-style (Card, Button, Badge, Tabs). `components.json` is shadcn config — don't hand-edit those primitives unless extending shadcn patterns.
- When adding a new page that needs data, the pattern is: add an API route under `src/app/api/<thing>/route.ts`, add a corresponding emitter in `scripts/generate-static.ts` that writes `public/data/<thing>.json` with the same shape, and add the path to the `staticMap` (or a regex branch) in `src/lib/data.ts`. Missing any of the three breaks the static build silently. For dynamic-segment routes, also add `generateStaticParams` in a sibling `layout.tsx`.
- Player detail pages (`/players/[slug]`) display the full 27-stat batting line with Key/All toggles and an AVG trend chart. The players leaderboard (`/players`) has a Fantasy / Key / All segmented control that mirrors the team-page Key/All sets (Fantasy = today's GP/TB/SB/BB/HBP/PTS, Key = GP/AB/H/HR/SB/BB/AVG, All = full 19-column line including OBP/SLG). Sort state persists across views when the column exists in both; otherwise it falls back to that view's default. CSV export reflects the active view and includes the view name in the filename.

## Project notes file

`notes for extension of this.md` (project-private, currently untracked) is Austin's running list of pending feature ideas. As of 2026-05-01 the live items are:
1. Game calendar — visualize the slate of MLB games per day; many games per day so the visualization choice is open
2. Players-tab extension to non-rostered MLB players — surface the same stat set for all active MLB players (not just the 104 rostered ones), to support pre-draft scouting. Will need a new sync path and storage strategy since current sync only fetches rostered MLB IDs
3. Forecasting / EDA module driven by `30_Lab/` MLB forecasting work — deferred
