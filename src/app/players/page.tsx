'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { fetchData } from '@/lib/data';
import { avg, obp, slg, fmtRate } from '@/lib/stats';
import Link from 'next/link';
interface PlayerData {
  id: number;
  name: string;
  slug: string;
  fantasyTeam: string;
  teamId: number | null;
  mlbTeam: string | null;
  draftRound: number | null;
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

type SortKey =
  | 'totalScore' | 'totalBases' | 'stolenBases' | 'walks' | 'hbp' | 'gamesPlayed'
  | 'atBats' | 'hits' | 'homeRuns' | 'avg'
  | 'plateAppearances' | 'doubles' | 'triples' | 'runs' | 'rbi'
  | 'intentionalWalks' | 'strikeouts' | 'caughtStealing' | 'sacFlies'
  | 'obp' | 'slg';

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

type DraftFilter = 'all' | 'drafted' | 'undrafted';

const VALID_VIEWS: View[] = ['fantasy', 'key', 'all'];
const VALID_DRAFT_FILTERS: DraftFilter[] = ['all', 'drafted', 'undrafted'];
const VALID_SORT_KEYS: ReadonlyArray<SortKey> = [
  'totalScore', 'totalBases', 'stolenBases', 'walks', 'hbp', 'gamesPlayed',
  'atBats', 'hits', 'homeRuns', 'avg',
  'plateAppearances', 'doubles', 'triples', 'runs', 'rbi',
  'intentionalWalks', 'strikeouts', 'caughtStealing', 'sacFlies',
  'obp', 'slg',
];

export default function PlayersPage() {
  // Suspense boundary needed because the inner component reads
  // useSearchParams (which forces a CSR bailout under static export).
  return (
    <Suspense fallback={
      <div className="space-y-4">
        <div className="h-5 w-48 bg-muted rounded animate-pulse" />
        <div className="h-96 bg-muted/50 rounded-lg animate-pulse" />
      </div>
    }>
      <PlayersPageInner />
    </Suspense>
  );
}

function PlayersPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read initial state from URL once. We deliberately DON'T re-run this on
  // every searchParams change — that would create a feedback loop with the
  // setState→pushState cycle below.
  const initialState = useRef<{
    view: View; sortBy: SortKey; search: string;
    mlbTeamFilter: string; draftFilter: DraftFilter;
  } | null>(null);
  if (initialState.current === null) {
    const v = searchParams.get('view') as View | null;
    const s = searchParams.get('sort') as SortKey | null;
    const d = searchParams.get('drafted') as DraftFilter | null;
    initialState.current = {
      view: v && VALID_VIEWS.includes(v) ? v : 'fantasy',
      sortBy: s && VALID_SORT_KEYS.includes(s) ? s : 'totalScore',
      search: searchParams.get('q') ?? '',
      mlbTeamFilter: searchParams.get('team') ?? '',
      draftFilter: d && VALID_DRAFT_FILTERS.includes(d) ? d : 'all',
    };
  }

  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialState.current.search);
  const [sortBy, setSortBy] = useState<SortKey>(initialState.current.sortBy);
  const [view, setView] = useState<View>(initialState.current.view);
  const [mlbTeamFilter, setMlbTeamFilter] = useState<string>(initialState.current.mlbTeamFilter);
  const [draftFilter, setDraftFilter] = useState<DraftFilter>(initialState.current.draftFilter);

  useEffect(() => {
    fetchData<PlayerData[]>('/api/players')
      .then(setPlayers)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!COLUMNS_BY_VIEW[view].includes(sortBy)) {
      setSortBy(DEFAULT_SORT_BY_VIEW[view]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Sync state → URL. Use replace() so the back button doesn't accumulate
  // every keystroke. Skip params at their default value to keep URLs clean.
  useEffect(() => {
    const params = new URLSearchParams();
    if (view !== 'fantasy') params.set('view', view);
    if (sortBy !== DEFAULT_SORT_BY_VIEW[view]) params.set('sort', sortBy);
    if (search) params.set('q', search);
    if (mlbTeamFilter) params.set('team', mlbTeamFilter);
    if (draftFilter !== 'all') params.set('drafted', draftFilter);
    const qs = params.toString();
    router.replace(qs ? `/players?${qs}` : '/players', { scroll: false });
  }, [view, sortBy, search, mlbTeamFilter, draftFilter, router]);

  const statValue = (p: PlayerData, key: SortKey): number => {
    switch (key) {
      case 'avg': return avg(p.hits, p.atBats);
      case 'obp': return obp(p.hits, p.walks, p.hbp, p.atBats, p.sacFlies);
      case 'slg': return slg(p.totalBases, p.atBats);
      default: return p[key];
    }
  };

  // Sorted, deduplicated list of MLB team abbreviations for the dropdown.
  const mlbTeamOptions = Array.from(
    new Set(players.map(p => p.mlbTeam).filter((t): t is string => !!t))
  ).sort();

  const filtered = players
    .filter(p => {
      // Draft-status filter
      if (draftFilter === 'drafted' && p.teamId == null) return false;
      if (draftFilter === 'undrafted' && p.teamId != null) return false;
      // MLB team filter
      if (mlbTeamFilter && p.mlbTeam !== mlbTeamFilter) return false;
      // Search
      const q = search.toLowerCase();
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.fantasyTeam.toLowerCase().includes(q) ||
        (p.mlbTeam ?? '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => statValue(b, sortBy) - statValue(a, sortBy));

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-48 bg-muted rounded animate-pulse" />
        <div className="h-96 bg-muted/50 rounded-lg animate-pulse" />
      </div>
    );
  }

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

  const sortHeader = (key: SortKey, label: string) => (
    <th
      className={`text-right text-[11px] font-medium px-3 py-2.5 cursor-pointer select-none transition-colors ${
        sortBy === key ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
      }`}
      onClick={() => setSortBy(key)}
    >
      {label}{sortBy === key ? ' ↓' : ''}
    </th>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Players</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {(() => {
            const total = players.length;
            const drafted = players.filter(p => p.teamId != null).length;
            return `${total} active MLB hitters · ${drafted} drafted · ${view === 'fantasy' ? 'fantasy scoring' : view === 'key' ? 'key batting stats' : 'full batting stats'}`;
          })()}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1" role="tablist" aria-label="Stat view">
          {(['fantasy', 'key', 'all'] as View[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              role="tab"
              aria-selected={view === v}
              className={`min-h-[38px] px-3.5 py-2 text-xs sm:text-[11px] sm:py-1.5 rounded transition-colors capitalize ${
                view === v
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-border hidden sm:block" />

        <div className="flex gap-1" role="tablist" aria-label="Roster filter">
          {([
            { v: 'all', label: 'All' },
            { v: 'drafted', label: 'Drafted' },
            { v: 'undrafted', label: 'Undrafted' },
          ] as const).map(o => (
            <button
              key={o.v}
              onClick={() => setDraftFilter(o.v)}
              role="tab"
              aria-selected={draftFilter === o.v}
              className={`min-h-[38px] px-3.5 py-2 text-xs sm:text-[11px] sm:py-1.5 rounded transition-colors ${
                draftFilter === o.v
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-border hidden sm:block" />

        <select
          value={mlbTeamFilter}
          onChange={e => setMlbTeamFilter(e.target.value)}
          aria-label="Filter by MLB team"
          className="min-h-[38px] sm:min-h-[32px] bg-background border border-border rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
        >
          <option value="">All MLB teams</option>
          {mlbTeamOptions.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {(mlbTeamFilter || draftFilter !== 'all') && (
          <button
            onClick={() => { setMlbTeamFilter(''); setDraftFilter('all'); }}
            className="min-h-[32px] px-2.5 py-1 text-[11px] rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="flex gap-2 items-center">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            placeholder="Search players, fantasy teams, or MLB teams..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-background border border-border rounded-lg pl-3 pr-9 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center"
            >
              ×
            </button>
          )}
        </div>
        <button
          onClick={exportCSV}
          className="min-h-[40px] px-3 py-2 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors whitespace-nowrap"
        >
          Export CSV
        </button>
      </div>
      {search && (
        <p className="text-[11px] text-muted-foreground -mt-3">
          {filtered.length} of {players.length} match &ldquo;{search}&rdquo;
        </p>
      )}

      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-20 bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted">
              <tr className="border-b border-border">
                <th className="sticky left-0 z-30 bg-muted text-left text-[11px] font-medium text-muted-foreground px-3 py-2.5 w-9">#</th>
                <th className="sticky left-9 z-30 bg-muted text-left text-[11px] font-medium text-muted-foreground px-3 py-2.5 shadow-[1px_0_0_0_hsl(var(--border))]">Player</th>
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
              {filtered.map((p, idx) => {
                const isDrafted = p.teamId != null;
                // Sticky cells need an opaque bg so scrolled-away columns
                // don't show through. We use --card (drafted) vs --background
                // (everyone else) — both are solid in this theme.
                const stickyBg = isDrafted ? 'bg-card' : 'bg-background';
                return (
                <tr
                  key={p.id}
                  className={`border-b border-border/50 transition-colors group ${isDrafted ? 'bg-muted/30' : ''} hover:bg-muted/40`}
                >
                  <td className={`sticky left-0 z-[2] ${stickyBg} group-hover:bg-muted/40 px-3 py-2 text-xs tabular-nums text-muted-foreground w-9`}>{idx + 1}</td>
                  <td className={`sticky left-9 z-[2] ${stickyBg} group-hover:bg-muted/40 px-3 py-2 text-sm font-medium shadow-[1px_0_0_0_hsl(var(--border)/0.4)]`}>
                    <span className="inline-flex items-center gap-1.5">
                      <Link href={`/players/${p.slug}`} className="inline-flex items-center min-h-[36px] -my-2 hover:text-primary transition-colors">
                        {p.name}
                      </Link>
                      {p.mlbTeam && (
                        <span className="text-[10px] text-muted-foreground tabular-nums">{p.mlbTeam}</span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {isDrafted ? (
                      <Link
                        href={`/teams/${p.teamId}`}
                        className="text-xs text-muted-foreground hover:text-primary transition-colors"
                      >
                        {p.fantasyTeam}
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    )}
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
              );})}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
