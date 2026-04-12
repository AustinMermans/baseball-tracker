'use client';

import { useEffect, useState } from 'react';
import { fetchData } from '@/lib/data';
import Link from 'next/link';
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
}

type SortKey = 'totalScore' | 'totalBases' | 'stolenBases' | 'walks' | 'hbp' | 'gamesPlayed';

export default function PlayersPage() {
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('totalScore');

  useEffect(() => {
    fetchData<PlayerData[]>('/api/players')
      .then(setPlayers)
      .finally(() => setLoading(false));
  }, []);

  const filtered = players
    .filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.fantasyTeam.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => b[sortBy] - a[sortBy]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-48 bg-muted rounded animate-pulse" />
        <div className="h-96 bg-muted/50 rounded-lg animate-pulse" />
      </div>
    );
  }

  const exportCSV = () => {
    const header = 'Rank,Player,Fantasy Team,GP,TB,SB,BB,HBP,PTS';
    const rows = filtered.map((p, i) =>
      `${i + 1},"${p.name}","${p.fantasyTeam}",${p.gamesPlayed},${p.totalBases},${p.stolenBases},${p.walks},${p.hbp},${p.totalScore}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fantasy-baseball-players-${new Date().toISOString().split('T')[0]}.csv`;
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
          All 104 rostered players &middot; sorted by {sortBy === 'totalScore' ? 'total score' : sortBy}
        </p>
      </div>

      <div className="flex gap-2 items-center">
        <input
          type="text"
          placeholder="Search players or teams..."
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
                {sortHeader('gamesPlayed', 'GP')}
                {sortHeader('totalBases', 'TB')}
                {sortHeader('stolenBases', 'SB')}
                {sortHeader('walks', 'BB')}
                {sortHeader('hbp', 'HBP')}
                {sortHeader('totalScore', 'PTS')}
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
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">{p.gamesPlayed}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{p.totalBases}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{p.stolenBases}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{p.walks}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{p.hbp}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums font-semibold">{p.totalScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
