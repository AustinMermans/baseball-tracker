'use client';

import { useEffect, useState } from 'react';
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

export default function PlayersPage() {
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('totalScore');
  const [view, setView] = useState<View>('fantasy');

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

  const statValue = (p: PlayerData, key: SortKey): number => {
    switch (key) {
      case 'avg': return avg(p.hits, p.atBats);
      case 'obp': return obp(p.hits, p.walks, p.hbp, p.atBats, p.sacFlies);
      case 'slg': return slg(p.totalBases, p.atBats);
      default: return p[key];
    }
  };

  const filtered = players
    .filter(p => {
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

      <div className="flex gap-2 items-center">
        <input
          type="text"
          placeholder="Search players, fantasy teams, or MLB teams..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 max-w-sm bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        <button
          onClick={exportCSV}
          className="px-3 py-2 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors whitespace-nowrap"
        >
          Export CSV
        </button>
      </div>

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
              {filtered.map((p, idx) => {
                const isDrafted = p.teamId != null;
                return (
                <tr
                  key={p.id}
                  className={`border-b border-border/50 transition-colors ${isDrafted ? 'bg-muted/20 hover:bg-muted/40' : 'hover:bg-muted/30'}`}
                >
                  <td className="px-4 py-2 text-xs tabular-nums text-muted-foreground">{idx + 1}</td>
                  <td className="px-4 py-2 text-sm font-medium">
                    <Link href={`/players/${p.slug}`} className="hover:text-primary transition-colors">
                      {p.name}
                    </Link>
                    {p.mlbTeam && (
                      <span className="ml-1.5 text-[10px] text-muted-foreground tabular-nums">{p.mlbTeam}</span>
                    )}
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
