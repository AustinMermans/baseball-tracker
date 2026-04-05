'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { fetchData } from '@/lib/data';
import { Badge } from '@/components/ui/badge';

interface PlayerData {
  id: number;
  name: string;
  fantasyTeam: string;
  draftRound: number;
  totalScore: number;
  gamesPlayed: number;
  totalBases: number;
  stolenBases: number;
  walks: number;
  hbp: number;
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'totalScore' | 'totalBases' | 'stolenBases' | 'walks' | 'hbp'>('totalScore');

  useEffect(() => {
    fetchData<PlayerData[]>('/api/players').then(setPlayers).finally(() => setLoading(false));
  }, []);

  const filtered = players
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()) ||
                 p.fantasyTeam.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b[sortBy] - a[sortBy]);

  if (loading) return <div className="text-muted-foreground">Loading players...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Player Leaderboard</h1>
        <p className="text-muted-foreground text-sm">All 104 rostered players, ranked by fantasy score</p>
      </div>

      {/* Search & Sort */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search players or teams..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-card border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as typeof sortBy)}
          className="bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="totalScore">Total Score</option>
          <option value="totalBases">Total Bases</option>
          <option value="stolenBases">Stolen Bases</option>
          <option value="walks">Walks</option>
          <option value="hbp">HBP</option>
        </select>
      </div>

      <Card className="bg-card border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-xs font-medium text-muted-foreground p-4 w-12">#</th>
                <th className="text-left text-xs font-medium text-muted-foreground p-4">Player</th>
                <th className="text-left text-xs font-medium text-muted-foreground p-4">Team</th>
                <th className="text-right text-xs font-medium text-muted-foreground p-4">GP</th>
                <th className="text-right text-xs font-medium text-muted-foreground p-4 cursor-pointer hover:text-foreground" onClick={() => setSortBy('totalBases')}>TB</th>
                <th className="text-right text-xs font-medium text-muted-foreground p-4 cursor-pointer hover:text-foreground" onClick={() => setSortBy('stolenBases')}>SB</th>
                <th className="text-right text-xs font-medium text-muted-foreground p-4 cursor-pointer hover:text-foreground" onClick={() => setSortBy('walks')}>BB</th>
                <th className="text-right text-xs font-medium text-muted-foreground p-4 cursor-pointer hover:text-foreground" onClick={() => setSortBy('hbp')}>HBP</th>
                <th className="text-right text-xs font-medium text-muted-foreground p-4 cursor-pointer hover:text-foreground" onClick={() => setSortBy('totalScore')}>Score</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, idx) => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                  <td className="p-4 text-sm text-muted-foreground font-mono">{idx + 1}</td>
                  <td className="p-4">
                    <span className="font-medium text-sm">{p.name}</span>
                  </td>
                  <td className="p-4">
                    <Badge variant="secondary" className="text-[10px]">{p.fantasyTeam}</Badge>
                  </td>
                  <td className="p-4 text-right text-sm font-mono text-muted-foreground">{p.gamesPlayed}</td>
                  <td className="p-4 text-right text-sm font-mono">{p.totalBases}</td>
                  <td className="p-4 text-right text-sm font-mono">{p.stolenBases}</td>
                  <td className="p-4 text-right text-sm font-mono">{p.walks}</td>
                  <td className="p-4 text-right text-sm font-mono">{p.hbp}</td>
                  <td className="p-4 text-right text-sm font-bold font-mono text-primary">{p.totalScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
