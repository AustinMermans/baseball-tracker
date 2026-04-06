'use client';

import { useEffect, useState } from 'react';
import { fetchData } from '@/lib/data';
import Link from 'next/link';

interface PlayerData {
  id: number;
  name: string;
  fantasyTeam: string;
  teamId: number;
  draftRound: number;
  totalScore: number;
  gamesPlayed: number;
  totalBases: number;
  stolenBases: number;
  walks: number;
  hbp: number;
  last3Score: number;
  last3Games: number;
}

type SortKey = 'totalScore' | 'totalBases' | 'stolenBases' | 'walks' | 'hbp' | 'gamesPlayed' | 'ptsPerGame';

function getHotCold(player: PlayerData): 'hot' | 'cold' | null {
  if (player.gamesPlayed < 4 || player.last3Games < 3) return null;
  const avg = player.totalScore / player.gamesPlayed;
  const recent = player.last3Score / player.last3Games;
  if (recent > avg * 1.3) return 'hot';
  if (recent < avg * 0.7) return 'cold';
  return null;
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('totalScore');

  useEffect(() => {
    fetchData<PlayerData[]>('/api/players').then(setPlayers).finally(() => setLoading(false));
  }, []);

  const filtered = players
    .filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.fantasyTeam.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'ptsPerGame') {
        const aAvg = a.gamesPlayed ? a.totalScore / a.gamesPlayed : 0;
        const bAvg = b.gamesPlayed ? b.totalScore / b.gamesPlayed : 0;
        return bAvg - aAvg;
      }
      return b[sortBy] - a[sortBy];
    });

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-48 bg-muted rounded animate-pulse" />
        <div className="h-96 bg-muted/50 rounded-lg animate-pulse" />
      </div>
    );
  }

  const exportCSV = () => {
    const header = 'Rank,Player,Fantasy Team,GP,TB,SB,BB,HBP,PTS,PTS/G';
    const rows = filtered.map((p, i) =>
      `${i + 1},"${p.name}","${p.fantasyTeam}",${p.gamesPlayed},${p.totalBases},${p.stolenBases},${p.walks},${p.hbp},${p.totalScore},${p.gamesPlayed ? (p.totalScore / p.gamesPlayed).toFixed(1) : '0.0'}`
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
      className={`text-right text-[11px] font-medium px-3 py-2.5 cursor-pointer select-none transition-colors whitespace-nowrap ${
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
          {players.filter(p => p.gamesPlayed > 0).length} active of {players.length} rostered
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

      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full min-w-[600px]">
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
              {sortHeader('ptsPerGame', 'PTS/G')}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, idx) => {
              const trend = getHotCold(p);
              const ptsPerGame = p.gamesPlayed ? (p.totalScore / p.gamesPlayed).toFixed(1) : '—';
              return (
                <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2 text-xs tabular-nums text-muted-foreground">{idx + 1}</td>
                  <td className="px-4 py-2">
                    <span className="text-sm font-medium">{p.name}</span>
                    {trend === 'hot' && <span className="ml-1.5 text-[10px] text-red-500" title="Scoring 30%+ above average last 3 games">▲</span>}
                    {trend === 'cold' && <span className="ml-1.5 text-[10px] text-blue-500" title="Scoring 30%+ below average last 3 games">▼</span>}
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/teams/${p.teamId}`} className="text-xs text-muted-foreground hover:text-primary transition-colors">
                      {p.fantasyTeam}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">{p.gamesPlayed}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{p.totalBases}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{p.stolenBases}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{p.walks}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{p.hbp}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums font-semibold">{p.totalScore}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">{ptsPerGame}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
