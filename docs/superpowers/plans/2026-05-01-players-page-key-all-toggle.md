# Players-page Key/All toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Fantasy / Key / All segmented control to `/players` so the leaderboard can show real-world batting stats inline (mirroring the team page) instead of forcing a click-through to each player's detail page.

**Architecture:** Pure client-side change. The existing `/api/players` route and `public/data/players.json` already include every raw counting stat (atBats, hits, doubles, triples, homeRuns, runs, rbi, strikeouts, plateAppearances, sacFlies, caughtStealing, intentionalWalks). Rate stats (AVG, OBP, SLG) are derived in-component via existing helpers in `src/lib/stats.ts`. No API, schema, sync, or `generate-static.ts` changes.

**Tech Stack:** Next.js 14 App Router (client component), TypeScript, Tailwind. Existing helpers: `fetchData` from `@/lib/data`; `avg`, `obp`, `slg`, `fmtRate` from `@/lib/stats`.

**Reference design:** `docs/superpowers/specs/2026-05-01-players-page-key-all-toggle-design.md`

**Reference implementation pattern:** `src/app/teams/[teamId]/page.tsx` lines 216–322 — same Key/All headers/rows/toggle should appear on the players page (plus the new outer Fantasy view and a leading GP column).

**Repo testing reality:** No test framework exists (`package.json` has no `test` script). Verification is manual browser testing in `npm run dev` plus `npm run lint` and `npm run build`. Each task lists what to eyeball.

---

## File Structure

Files modified:
- `src/app/players/page.tsx` — only file touched. Currently 149 lines; will grow to roughly 300 with the three view branches inlined (matches the team page's pattern of inlining the Key/All branches rather than extracting a sub-component).

No new files. No deletions.

---

## Task 1: Extend types and add view state

**Files:**
- Modify: `src/app/players/page.tsx`

- [ ] **Step 1.1: Expand `PlayerData` interface to include all batting columns**

Replace the existing `PlayerData` interface (currently lines 6–19) with the full shape that `/api/players` and `players.json` already return:

```typescript
interface PlayerData {
  id: number;
  name: string;
  slug: string;
  fantasyTeam: string;
  teamId: number;
  draftRound: number;
  totalScore: number;
  gamesPlayed: number;
  totalBases: number;
  stolenBases: number;
  walks: number;
  hbp: number;
  atBats: number;
  hits: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  runs: number;
  rbi: number;
  strikeouts: number;
  plateAppearances: number;
  sacFlies: number;
  caughtStealing: number;
  intentionalWalks: number;
}
```

Verify by checking `src/app/api/players/route.ts:38-68` — every property above is already returned. No data shape change.

- [ ] **Step 1.2: Expand `SortKey` to cover all sortable columns**

Replace the existing `SortKey` type (currently `'totalScore' | 'totalBases' | 'stolenBases' | 'walks' | 'hbp' | 'gamesPlayed'`) with:

```typescript
type SortKey =
  // Fantasy view
  | 'totalScore' | 'totalBases' | 'stolenBases' | 'walks' | 'hbp' | 'gamesPlayed'
  // Key + All shared
  | 'atBats' | 'hits' | 'homeRuns' | 'avg'
  // All only
  | 'plateAppearances' | 'doubles' | 'triples' | 'runs' | 'rbi'
  | 'intentionalWalks' | 'strikeouts' | 'caughtStealing' | 'sacFlies'
  | 'obp' | 'slg';
```

Note that `walks`, `stolenBases`, `hbp` already exist in the Fantasy enum and are reused as BB / SB / HBP columns in Key and All — no rename needed. AVG/OBP/SLG sort keys (`avg`, `obp`, `slg`) are derived; the sort comparator (Task 3) computes them on the fly.

- [ ] **Step 1.3: Add `View` type and view state**

Just below the `SortKey` definition, add:

```typescript
type View = 'fantasy' | 'key' | 'all';

const DEFAULT_SORT_BY_VIEW: Record<View, SortKey> = {
  fantasy: 'totalScore',
  key: 'hits',
  all: 'hits',
};

const COLUMNS_BY_VIEW: Record<View, SortKey[]> = {
  fantasy: ['gamesPlayed', 'totalBases', 'stolenBases', 'walks', 'hbp', 'totalScore'],
  key: ['gamesPlayed', 'atBats', 'hits', 'homeRuns', 'stolenBases', 'walks', 'avg'],
  all: ['gamesPlayed', 'plateAppearances', 'atBats', 'hits', 'doubles', 'triples', 'homeRuns', 'runs', 'rbi', 'walks', 'intentionalWalks', 'strikeouts', 'stolenBases', 'caughtStealing', 'hbp', 'sacFlies', 'avg', 'obp', 'slg'],
};
```

Inside the `PlayersPage` component, add state below the existing `sortBy` state:

```typescript
const [view, setView] = useState<View>('fantasy');
```

- [ ] **Step 1.4: Verify the file compiles**

Run: `npm run lint`
Expected: no new errors. (Existing rules: `next/core-web-vitals` + `next/typescript`.)

- [ ] **Step 1.5: Commit**

```bash
git add src/app/players/page.tsx
git commit -m "Expand PlayerData/SortKey types for players-page Key/All toggle"
```

---

## Task 2: Add view-aware sort comparator

**Files:**
- Modify: `src/app/players/page.tsx`

- [ ] **Step 2.1: Import rate-stat helpers**

At the top of the file (next to the existing `import { fetchData } from '@/lib/data';`), add:

```typescript
import { avg, obp, slg, fmtRate } from '@/lib/stats';
```

- [ ] **Step 2.2: Replace the existing sort with a view-aware comparator**

The current sort line is:
```typescript
.sort((a, b) => b[sortBy] - a[sortBy]);
```

This breaks once `sortBy` can be `'avg' | 'obp' | 'slg'`, which aren't fields on `PlayerData`. Replace the `filtered` constant block (currently lines 35–40) with:

```typescript
function statValue(p: PlayerData, key: SortKey): number {
  switch (key) {
    case 'avg': return avg(p.hits, p.atBats);
    case 'obp': return obp(p.hits, p.walks, p.hbp, p.atBats, p.sacFlies);
    case 'slg': return slg(p.totalBases, p.atBats);
    default: return p[key];
  }
}

const filtered = players
  .filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.fantasyTeam.toLowerCase().includes(search.toLowerCase())
  )
  .sort((a, b) => statValue(b, sortBy) - statValue(a, sortBy));
```

Place `statValue` above the component or inside it (above the `filtered` block) — either is fine; the existing file is small enough that an inline helper is the lower-friction choice.

- [ ] **Step 2.3: Verify**

Run: `npm run lint`
Expected: no new errors.

Also start `npm run dev`, open `http://localhost:3000/players`, click each existing column header (GP, TB, SB, BB, HBP, PTS) — each should still sort. Default still PTS-descending. (Other views aren't visible yet — that's Task 4/5.)

- [ ] **Step 2.4: Commit**

```bash
git add src/app/players/page.tsx
git commit -m "Add view-aware sort comparator with rate-stat support"
```

---

## Task 3: Add view-toggle effect

**Files:**
- Modify: `src/app/players/page.tsx`

- [ ] **Step 3.1: Add a sort-fallback effect**

When the user toggles views, if the current `sortBy` column isn't in the new view, drop back to that view's default. Add this `useEffect` below the existing data-fetch `useEffect`:

```typescript
useEffect(() => {
  if (!COLUMNS_BY_VIEW[view].includes(sortBy)) {
    setSortBy(DEFAULT_SORT_BY_VIEW[view]);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [view]);
```

The `eslint-disable` is intentional: we deliberately exclude `sortBy` from the dep array — re-running this effect when the user clicks a column header would immediately undo their click. The lint rule's suggestion would be wrong here.

- [ ] **Step 3.2: Verify lint**

Run: `npm run lint`
Expected: no new errors. (The `eslint-disable-next-line` comment suppresses the `react-hooks/exhaustive-deps` warning for that specific line.)

- [ ] **Step 3.3: Commit**

```bash
git add src/app/players/page.tsx
git commit -m "Reset sort to view default when toggled column is absent"
```

---

## Task 4: Render Fantasy / Key / All segmented control

**Files:**
- Modify: `src/app/players/page.tsx`

- [ ] **Step 4.1: Add the three-button toggle above the search/export row**

Inside the returned JSX, between the page heading block and the `<div className="flex gap-2 items-center">` search/export row, insert:

```tsx
<div className="flex gap-1">
  {(['fantasy', 'key', 'all'] as View[]).map(v => (
    <button
      key={v}
      onClick={() => setView(v)}
      className={`px-2.5 py-1 text-[11px] rounded transition-colors capitalize ${
        view === v
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {v}
    </button>
  ))}
</div>
```

This matches the styling of the team page's Key/All toggle (`src/app/teams/[teamId]/page.tsx:217-230`).

- [ ] **Step 4.2: Update the heading copy to reflect the active view**

Replace the existing `<p>` description below `<h1>Players</h1>` with:

```tsx
<p className="text-xs text-muted-foreground mt-0.5">
  All 104 rostered players &middot; {view === 'fantasy' ? 'fantasy scoring' : view === 'key' ? 'key batting stats' : 'full batting stats'}
</p>
```

(Drops the redundant "sorted by …" text — the active sort header already shows ↓.)

- [ ] **Step 4.3: Verify visually**

Start `npm run dev`. The three buttons render above the search box. Clicking each updates the active button styling; the description line below the heading swaps text. Sort defaults change correctly per Task 3. The table itself does not yet reflect the view — Task 5 wires it up.

- [ ] **Step 4.4: Commit**

```bash
git add src/app/players/page.tsx
git commit -m "Add Fantasy/Key/All segmented control to players page"
```

---

## Task 5: Render Key view (table headers and rows)

**Files:**
- Modify: `src/app/players/page.tsx`

- [ ] **Step 5.1: Generalize the `sortHeader` helper to accept a label set**

The existing helper (lines 66–75) hardcodes the label format. Keep it as-is but ensure the `key: SortKey` parameter accepts the new keys (it already does once the `SortKey` type is widened).

- [ ] **Step 5.2: Branch the `<thead>` and `<tbody>` on `view`**

Replace the entire `<table>` block (currently lines 104–145) with three explicit branches. The Fantasy branch is a verbatim copy of today's table; Key and All are new. The reason to inline rather than build columns from a config: the team page does the same — it's the codebase pattern, and trying to abstract over sort headers + raw value cells + rate-formatted cells produces a worse abstraction than three explicit branches.

```tsx
<div className="border border-border rounded-lg overflow-hidden">
  <div className="overflow-x-auto">
    <table className="w-full">
      <thead>
        <tr className="border-b border-border bg-muted/40">
          <th className="text-left text-[11px] font-medium text-muted-foreground px-4 py-2.5 w-10">#</th>
          <th className="text-left text-[11px] font-medium text-muted-foreground px-4 py-2.5">Player</th>
          <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2.5">Team</th>
          {view === 'fantasy' && (
            <>
              {sortHeader('gamesPlayed', 'GP')}
              {sortHeader('totalBases', 'TB')}
              {sortHeader('stolenBases', 'SB')}
              {sortHeader('walks', 'BB')}
              {sortHeader('hbp', 'HBP')}
              {sortHeader('totalScore', 'PTS')}
            </>
          )}
          {view === 'key' && (
            <>
              {sortHeader('gamesPlayed', 'GP')}
              {sortHeader('atBats', 'AB')}
              {sortHeader('hits', 'H')}
              {sortHeader('homeRuns', 'HR')}
              {sortHeader('stolenBases', 'SB')}
              {sortHeader('walks', 'BB')}
              {sortHeader('avg', 'AVG')}
            </>
          )}
          {view === 'all' && (
            <>
              {sortHeader('gamesPlayed', 'GP')}
              {sortHeader('plateAppearances', 'PA')}
              {sortHeader('atBats', 'AB')}
              {sortHeader('hits', 'H')}
              {sortHeader('doubles', '2B')}
              {sortHeader('triples', '3B')}
              {sortHeader('homeRuns', 'HR')}
              {sortHeader('runs', 'R')}
              {sortHeader('rbi', 'RBI')}
              {sortHeader('walks', 'BB')}
              {sortHeader('intentionalWalks', 'IBB')}
              {sortHeader('strikeouts', 'SO')}
              {sortHeader('stolenBases', 'SB')}
              {sortHeader('caughtStealing', 'CS')}
              {sortHeader('hbp', 'HBP')}
              {sortHeader('sacFlies', 'SF')}
              {sortHeader('avg', 'AVG')}
              {sortHeader('obp', 'OBP')}
              {sortHeader('slg', 'SLG')}
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {filtered.map((p, idx) => (
          <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
            <td className="px-4 py-2 text-xs tabular-nums text-muted-foreground">{idx + 1}</td>
            <td className="px-4 py-2 text-sm font-medium">
              <Link href={`/players/${p.slug}`} className="hover:text-primary transition-colors">
                {p.name}
              </Link>
            </td>
            <td className="px-3 py-2">
              <Link
                href={`/teams/${p.teamId}`}
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                {p.fantasyTeam}
              </Link>
            </td>
            {view === 'fantasy' && (
              <>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">{p.gamesPlayed}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">{p.totalBases}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">{p.stolenBases}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">{p.walks}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">{p.hbp}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums font-semibold">{p.totalScore}</td>
              </>
            )}
            {view === 'key' && (
              <>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">{p.gamesPlayed}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">{p.atBats}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">{p.hits}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">{p.homeRuns}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">{p.stolenBases}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">{p.walks}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">{fmtRate(avg(p.hits, p.atBats))}</td>
              </>
            )}
            {view === 'all' && (
              <>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">{p.gamesPlayed}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">{p.plateAppearances}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">{p.atBats}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">{p.hits}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">{p.doubles}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">{p.triples}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">{p.homeRuns}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">{p.runs}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">{p.rbi}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">{p.walks}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">{p.intentionalWalks}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">{p.strikeouts}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">{p.stolenBases}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">{p.caughtStealing}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">{p.hbp}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">{p.sacFlies}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">{fmtRate(avg(p.hits, p.atBats))}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">{fmtRate(obp(p.hits, p.walks, p.hbp, p.atBats, p.sacFlies))}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">{fmtRate(slg(p.totalBases, p.atBats))}</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>
```

- [ ] **Step 5.3: Verify lint and dev server**

Run: `npm run lint`
Expected: no errors.

In the running `npm run dev`, on `/players`:
1. Default Fantasy view: identical to before — same columns, same default sort by PTS.
2. Click "Key" — table swaps to GP, AB, H, HR, SB, BB, AVG. Sort default = H. AVG renders as e.g. `.342`.
3. Click any column header in Key view — sort updates.
4. Click "All" — full 19-column table appears (incl. AVG/OBP/SLG). Horizontal scroll if viewport is narrow.
5. Click "Fantasy" — back to original.
6. Click TB header in Fantasy, then Key — sort falls back to H since TB isn't in Key. Click Fantasy again — falls back to PTS since H isn't in Fantasy.
7. Search box still filters in every view.

- [ ] **Step 5.4: Commit**

```bash
git add src/app/players/page.tsx
git commit -m "Render Fantasy/Key/All views with view-aware columns"
```

---

## Task 6: Make CSV export view-aware

**Files:**
- Modify: `src/app/players/page.tsx`

- [ ] **Step 6.1: Replace the hardcoded CSV builder**

The existing `exportCSV` function (currently lines 51–64) hardcodes the Fantasy column set. Replace with a per-view builder. Place this as the new `exportCSV` body:

```typescript
const exportCSV = () => {
  const baseHeader = ['Rank', 'Player', 'Fantasy Team'];
  const baseRow = (p: PlayerData, i: number) => [
    String(i + 1),
    `"${p.name.replace(/"/g, '""')}"`,
    `"${p.fantasyTeam.replace(/"/g, '""')}"`,
  ];

  let statHeaders: string[];
  let statRow: (p: PlayerData) => string[];

  if (view === 'fantasy') {
    statHeaders = ['GP', 'TB', 'SB', 'BB', 'HBP', 'PTS'];
    statRow = p => [p.gamesPlayed, p.totalBases, p.stolenBases, p.walks, p.hbp, p.totalScore].map(String);
  } else if (view === 'key') {
    statHeaders = ['GP', 'AB', 'H', 'HR', 'SB', 'BB', 'AVG'];
    statRow = p => [
      String(p.gamesPlayed), String(p.atBats), String(p.hits), String(p.homeRuns),
      String(p.stolenBases), String(p.walks),
      fmtRate(avg(p.hits, p.atBats)),
    ];
  } else {
    statHeaders = ['GP', 'PA', 'AB', 'H', '2B', '3B', 'HR', 'R', 'RBI', 'BB', 'IBB', 'SO', 'SB', 'CS', 'HBP', 'SF', 'AVG', 'OBP', 'SLG'];
    statRow = p => [
      String(p.gamesPlayed), String(p.plateAppearances), String(p.atBats), String(p.hits),
      String(p.doubles), String(p.triples), String(p.homeRuns), String(p.runs), String(p.rbi),
      String(p.walks), String(p.intentionalWalks), String(p.strikeouts),
      String(p.stolenBases), String(p.caughtStealing), String(p.hbp), String(p.sacFlies),
      fmtRate(avg(p.hits, p.atBats)),
      fmtRate(obp(p.hits, p.walks, p.hbp, p.atBats, p.sacFlies)),
      fmtRate(slg(p.totalBases, p.atBats)),
    ];
  }

  const header = [...baseHeader, ...statHeaders].join(',');
  const rows = filtered.map((p, i) => [...baseRow(p, i), ...statRow(p)].join(','));
  const csv = [header, ...rows].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fantasy-baseball-players-${view}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};
```

The filename gets a `${view}` segment so the user can tell exports apart in their downloads folder.

- [ ] **Step 6.2: Verify**

Run: `npm run lint`. No errors.

In `npm run dev`:
1. Click Export CSV in Fantasy view → downloads `fantasy-baseball-players-fantasy-YYYY-MM-DD.csv` with the original 9-column shape.
2. Switch to Key, click Export → file ends in `-key-`, has 10 columns (Rank/Player/Team + 7 stats), AVG renders as `.342`.
3. Switch to All, click Export → file ends in `-all-`, has 22 columns.
4. Open at least one CSV in a viewer — column count and order match the on-screen table. Quoting handles a player whose name contains an apostrophe (e.g. an "O'Hearn"-style name).

- [ ] **Step 6.3: Commit**

```bash
git add src/app/players/page.tsx
git commit -m "Make players-page CSV export view-aware"
```

---

## Task 7: Full verification + final commit

**Files:**
- None modified in this task.

- [ ] **Step 7.1: Lint**

Run: `npm run lint`
Expected: clean. No new warnings, no new errors.

- [ ] **Step 7.2: Production build (server mode)**

Run: `npm run build`
Expected: build succeeds. The players page is a `'use client'` component with `useState` / `useEffect` — Next 14 should compile it as part of the standard build.

- [ ] **Step 7.3: Static export build**

This is the build that GitHub Pages actually runs. The deploy workflow does `rm -rf src/app/api` first; reproduce that locally **on a copy or a clean working tree** to avoid losing files. From the repo root:

```bash
git stash --include-untracked  # save current state
rm -rf src/app/api
STATIC_EXPORT=true NEXT_PUBLIC_STATIC=true NEXT_PUBLIC_BASE_PATH=/baseball-tracker npx next build
```

Expected: build succeeds. Output goes to `out/`. The `/players` route appears as `out/players/index.html`.

Then restore:
```bash
git checkout src/app/api
git stash pop
```

If the static build fails for an unrelated reason (e.g. missing `generateStaticParams` on a route that was already broken), surface it but don't try to fix it as part of this task — that's separate scope.

- [ ] **Step 7.4: Final manual smoke test in dev**

In `npm run dev`, on `/players`:
1. Default Fantasy view loads, default sort PTS-descending, top-10 names look reasonable for the current season standings.
2. Toggle Fantasy → Key → All → Fantasy. Each view renders with its expected columns and default sort.
3. Click a column header in each view; sort updates correctly.
4. Toggle from a sort that doesn't exist in the next view (e.g. PTS in Fantasy → Key); sort falls back to view default. Toggle back; falls back to that view's default again.
5. Search "schwarber" in each view — same player row appears with appropriate columns.
6. Click a player name — link still goes to `/players/[slug]`.
7. Click a fantasy-team name — link still goes to `/teams/[teamId]`.
8. Export CSV in each view — files have correct column counts and per-view filename suffix.
9. On a narrow window (~600px), the All view's table scrolls horizontally; Fantasy and Key fit without scroll.
10. No console errors at any point.

- [ ] **Step 7.5: Update notes file**

Edit `notes for extension of this.md` to remove item #2 (which this work delivers). The file should now contain only:
```
1. game calendar
2. players tab player extension(to include all players active not just the drafted ones)
```
(That is, the previous #1 stays, the previous #3 is renumbered to #2.)

- [ ] **Step 7.6: Commit notes update**

```bash
git add "notes for extension of this.md"
git commit -m "Mark players-tab full-stats item complete in extension notes"
```

(The notes file is currently untracked — this is the commit that adds it.)

- [ ] **Step 7.7: (Optional) Update CLAUDE.md**

The "Project notes file" section at the bottom of `CLAUDE.md` currently lists item #2 as "Players-tab full-stats expansion … is a known pending feature." After this work it's done. Update that section to say the players page now has the Fantasy/Key/All toggle and item #2 has moved to "all active MLB players, not just rostered" (which is the actual remaining feature #2).

```bash
git add CLAUDE.md
git commit -m "Update CLAUDE.md after players-page Key/All toggle ships"
```

---

## Self-Review

**Spec coverage:**
- Three-way segmented control (Fantasy / Key / All): Task 4 ✓
- Default = Fantasy, current view preserved: Task 4, Task 5 (Fantasy branch is a verbatim copy of today's table) ✓
- Column lists per view exactly matching the spec table: Task 5 ✓
- Sort: per-column, view defaults, fallback when toggled column is absent: Tasks 1.3, 2.2, 3.1 ✓
- Search unchanged: Task 2.2 (kept in same `filtered` block) ✓
- CSV reflects active view: Task 6 ✓
- Rate-stat helpers from `src/lib/stats.ts`: Tasks 2.1, 5.2, 6.1 ✓
- No data-layer changes: confirmed — Tasks only touch `src/app/players/page.tsx` ✓
- Manual verification covers each spec test item: Task 7.4 ✓

**Placeholder scan:** All code blocks contain real code. No "TBD", no "implement appropriate X", no `// ...`. ✓

**Type consistency:** `View`, `SortKey`, `PlayerData`, `DEFAULT_SORT_BY_VIEW`, `COLUMNS_BY_VIEW`, and `statValue` use consistent names across Tasks 1–7. The `SortKey` union covers every key referenced in `sortHeader(...)` calls in Task 5 and every key in `COLUMNS_BY_VIEW`. The dependency-array `[view]` in Task 3.1 is intentional. ✓

**Scope check:** Single-file change on a leaderboard page. Appropriate for one plan. ✓
