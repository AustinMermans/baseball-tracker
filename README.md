# Fantasy Baseball Tracker

Automated scorekeeper for our 2026 best-ball fantasy baseball league. 8 teams, 13 batters each, top 10 count toward each period's score. Stats sync daily from the MLB Stats API.

**Live site:** https://austinmermans.github.io/baseball-tracker/

## League Format

- **8 teams**, $25 buy-in, 13 batters drafted per team
- **Best ball**: top 10 of 13 players count each period
- **Scoring**: Total Bases + Stolen Bases + Walks + Hit By Pitch
- **3 periods** with redrafts on May 31 and Jul 31
- **Payouts**: each period winner + cumulative season winner

## Features

- League standings with cumulative + per-period rankings
- Team detail pages with full roster, scoring trend chart, best-ball indicators
- Player leaderboard with sortable columns (TB / SB / BB / HBP / PTS / PTS/G)
- Hot/cold indicators based on last 3 games vs season average
- CSV export for all player stats
- Mobile responsive
- Daily auto-sync via GitHub Actions

## Stack

- **Next.js 14** (App Router) + TypeScript + Tailwind
- **SQLite** via better-sqlite3 (committed to repo, ~80KB)
- **Recharts** for trend visualization
- **MLB Stats API** (statsapi.mlb.com — free, no key)
- **GitHub Actions + Pages** for hosting and daily sync

## How It Works

The site is built two ways from the same codebase:

1. **Local dev** (`npm run dev`) — full Next.js app with API routes hitting SQLite directly
2. **GitHub Pages** — static export with all data pre-generated to JSON files

The data layer (`src/lib/data.ts`) auto-detects which mode it's in.

### Daily Sync Flow

A GitHub Action runs every day at midnight PT:
1. Pulls the repo (with the existing `baseball.db`)
2. Runs `scripts/sync-and-build.ts` — fetches yesterday's MLB boxscores, upserts new stats
3. Regenerates static JSON files in `public/data/`
4. Commits the updated DB and JSON back to the repo
5. Builds the static site and deploys to GitHub Pages

This means daily runs take ~30 seconds (only fetching new games, not the whole season).

## Local Development

```bash
npm install
npm run dev          # http://localhost:3000
```

To seed the database from scratch (only needed if `baseball.db` is missing):
```bash
npx tsx src/db/seed.ts
```

To manually backfill or sync stats:
```bash
npx tsx scripts/sync-and-build.ts
```

## Project Structure

```
src/
├── app/                    # Next.js pages
│   ├── page.tsx            # Dashboard / overview
│   ├── standings/          # Standings with period filters
│   ├── teams/[teamId]/     # Team detail + trend chart
│   ├── players/            # Sortable player leaderboard + CSV export
│   └── api/                # API routes (local dev only)
├── components/ui/          # shadcn primitives (Card, Button, Badge, Tabs)
├── db/
│   ├── schema.ts           # Drizzle schema
│   ├── seed.ts             # Initial roster + period data
│   └── index.ts            # DB connection
└── lib/
    ├── data.ts             # Static vs API mode router
    ├── mlb-api.ts          # MLB Stats API client
    └── scoring.ts          # Best-ball scoring logic

scripts/
├── sync-and-build.ts       # Daily sync + static JSON generation
└── generate-static.ts      # Regenerates JSON from current DB

public/data/                # Static JSON for GitHub Pages deployment
baseball.db                 # SQLite database (committed to repo)
```

## Data Model

- `teams` — 8 fantasy teams
- `players` — 104 rostered players with MLB IDs
- `daily_stats` — per-player per-game stat lines
- `season_periods` — 3 period definitions
- `redraft_log` — drops/adds per redraft (for May 31 and Jul 31)
