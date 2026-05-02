# Players-page Key/All toggle — Design

**Date:** 2026-05-01
**Status:** Approved (design phase)
**Scope:** Feature #1 in `notes for extension of this.md`

## Problem

The `/players` leaderboard at `src/app/players/page.tsx` only shows fantasy-scoring columns (GP, TB, SB, BB, HBP, PTS). To see real-world batting stats — AB, H, HR, AVG, etc. — a user has to click into each player's detail page one at a time. The team page (`/teams/[teamId]`) already has a Key/All toggle that shows the full batting line in a table; the players leaderboard should expose the same thing across all rostered players.

## Solution

Add a three-way segmented control (Fantasy / Key / All) to the players page. Default = Fantasy (preserves today's view exactly). Key and All replace the right-hand columns with batting stats mirroring `src/app/teams/[teamId]/page.tsx` exactly.

This is a **client-side-only change**. `players.json` and `/api/players` already include every raw counting stat needed (atBats, hits, doubles, triples, homeRuns, runs, rbi, strikeouts, plateAppearances, sacFlies, caughtStealing, intentionalWalks). Rate stats (AVG, OBP, SLG) are derived in the component via existing helpers in `src/lib/stats.ts`.

## Columns per view

Rank, Player name, Fantasy team are pinned on the left in every view.

| View | Columns (in order) |
|------|-------------------|
| **Fantasy** (default) | GP, TB, SB, BB, HBP, **PTS** |
| **Key** | GP, AB, H, HR, SB, BB, AVG |
| **All** | GP, PA, AB, H, 2B, 3B, HR, R, RBI, BB, IBB, SO, SB, CS, HBP, SF, AVG, OBP, SLG |

Key and All match the team page (`src/app/teams/[teamId]/page.tsx` lines 237–267) exactly; the only addition is GP, which makes sense as a shared first column on the leaderboard.

TB is intentionally excluded from Key and All. Reason: the team page's Key/All views are "real-world batting stats" and TB is mathematically derivable from H/2B/3B/HR. Adding it later — to both pages in sync — is a separate change.

## Sorting

- Sort state is per-column; clicking a column header sets the sort key.
- Sort state persists across view toggles when the column exists in the target view; otherwise it falls back to that view's default.
- View defaults: Fantasy → PTS, Key → H, All → H.
- Always descending. Matches current behavior.

## Search

Unchanged. The search input filters by player name or fantasy team name across all views.

## CSV export

The exporter currently hardcodes the Fantasy column set. Refactor to build the header line and per-row values from the active view's column list. Filename stays `fantasy-baseball-players-YYYY-MM-DD.csv`.

## Rate-stat formatting

Use `avg`, `obp`, `slg`, and `fmtRate` from `src/lib/stats.ts`. AVG = `H / AB`. OBP = `(H + BB + HBP) / (AB + BB + HBP + SF)`. SLG = `TB / AB`. Display with leading-dot 3-decimal format (`.342`) — `fmtRate` already handles this.

## Non-goals

- Adding non-rostered MLB players. That's feature #2 — separate spec.
- Adding TB to Key/All. Defer; would require a parallel team-page change to keep tables consistent.
- Per-period column variants. The leaderboard is season-cumulative; period filtering is a different feature.

## Files touched

- `src/app/players/page.tsx` — only file modified.

No changes to:
- `src/app/api/players/route.ts` (already returns the needed columns)
- `scripts/generate-static.ts` (already emits them in `players.json`)
- `src/lib/data.ts`, schema, sync.

## Testing

Manual, in `npm run dev`:
1. Page loads in Fantasy view by default; existing columns render unchanged.
2. Toggle Key → table re-renders with AB/H/HR/SB/BB/AVG; row count and order match Fantasy except for sort default.
3. Toggle All → 18 stat columns render; AVG/OBP/SLG use leading-dot formatting; horizontal scroll appears on narrow viewports.
4. Sort: click any column header in any view; clicking a header that exists in another view, then toggling, retains the sort.
5. Search: typing a name filters in every view; typing a fantasy-team name also filters.
6. CSV export: each view downloads a CSV whose header line and column count match the on-screen table.
7. `npm run lint` passes.
8. `npm run build` succeeds.
9. Static-export build also succeeds (no API/data shape change required, but verify): `STATIC_EXPORT=true NEXT_PUBLIC_STATIC=true NEXT_PUBLIC_BASE_PATH=/baseball-tracker npx next build` after `rm -rf src/app/api` (or test on a copy).

No automated tests — repo has no test suite.
