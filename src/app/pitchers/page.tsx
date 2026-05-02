'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { fetchData } from '@/lib/data';

interface Pitch {
  code: string;
  description: string;
  pitchCount: number;
  totalPitches: number;
  percentage: number;
  averageSpeed: number | null;
}

interface SeasonStats {
  gamesStarted: number | null;
  inningsPitched: string | null;
  era: string | null;
  whip: string | null;
  strikeoutsPer9Inn: string | null;
  walksPer9Inn: string | null;
  strikeOuts: number | null;
  baseOnBalls: number | null;
  wins: number | null;
  losses: number | null;
}

interface Pitcher {
  id: number;
  name: string;
  slug: string;
  mlbTeam: string | null;
  pitchHand: 'L' | 'R' | null;
  age: number | null;
  totalPitches: number;
  pitches: Pitch[];
  season: SeasonStats | null;
}

interface PitchersData {
  generatedAt: string;
  season: number;
  pitchers: Pitcher[];
}

// Statcast pitch-type colors. Mostly aligned with Baseball Savant conventions:
// fastballs warm, breaking blue/purple, off-speed green/teal.
const PITCH_COLORS: Record<string, string> = {
  FF: '#d62728',  // Four-seam — red
  SI: '#ff7f0e',  // Sinker — orange
  FC: '#bcbd22',  // Cutter — olive
  FS: '#2ca02c',  // Splitter — green
  CH: '#17becf',  // Changeup — teal
  SL: '#1f77b4',  // Slider — blue
  ST: '#9467bd',  // Sweeper — purple
  CU: '#8c564b',  // Curveball — brown
  KC: '#e377c2',  // Knuckle-curve — pink
  SV: '#7f7f7f',  // Slurve — grey
};

function pitchColor(code: string): string {
  return PITCH_COLORS[code] ?? '#888';
}

function fmtMph(speed: number | null): string {
  if (speed == null) return '—';
  return `${speed.toFixed(1)} mph`;
}

function fmtPct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

export default function PitchersPage() {
  return (
    <Suspense fallback={
      <div className="space-y-4">
        <div className="h-5 w-48 bg-muted rounded animate-pulse" />
        <div className="h-72 bg-muted/50 rounded-lg animate-pulse" />
      </div>
    }>
      <PitchersInner />
    </Suspense>
  );
}

function PitchersInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<PitchersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [handFilter, setHandFilter] = useState<'all' | 'L' | 'R'>(
    (searchParams.get('hand') as 'L' | 'R' | null) === 'L' ? 'L' :
    searchParams.get('hand') === 'R' ? 'R' : 'all'
  );
  const [mlbTeamFilter, setMlbTeamFilter] = useState<string>(searchParams.get('team') ?? '');
  const [sortBy, setSortBy] = useState<'volume' | 'name' | 'era' | 'k9'>(
    (() => {
      const s = searchParams.get('sort');
      return s === 'name' || s === 'era' || s === 'k9' ? s : 'volume';
    })()
  );
  const [selected, setSelected] = useState<string | null>(searchParams.get('p') ?? null);

  useEffect(() => {
    fetchData<PitchersData>('/api/pitchers')
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (handFilter !== 'all') params.set('hand', handFilter);
    if (mlbTeamFilter) params.set('team', mlbTeamFilter);
    if (sortBy !== 'volume') params.set('sort', sortBy);
    if (selected) params.set('p', selected);
    const qs = params.toString();
    router.replace(qs ? `/pitchers?${qs}` : '/pitchers', { scroll: false });
  }, [search, handFilter, mlbTeamFilter, sortBy, selected, router]);

  const teamOptions = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.pitchers.map(p => p.mlbTeam).filter((t): t is string => !!t))).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.pitchers.filter(p => {
      if (q && !p.name.toLowerCase().includes(q) && !(p.mlbTeam ?? '').toLowerCase().includes(q)) return false;
      if (handFilter !== 'all' && p.pitchHand !== handFilter) return false;
      if (mlbTeamFilter && p.mlbTeam !== mlbTeamFilter) return false;
      return true;
    }).sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'era') {
        const ae = a.season?.era != null ? parseFloat(a.season.era) : Infinity;
        const be = b.season?.era != null ? parseFloat(b.season.era) : Infinity;
        return ae - be;  // lowest ERA first
      }
      if (sortBy === 'k9') {
        const ak = a.season?.strikeoutsPer9Inn != null ? parseFloat(a.season.strikeoutsPer9Inn) : -Infinity;
        const bk = b.season?.strikeoutsPer9Inn != null ? parseFloat(b.season.strikeoutsPer9Inn) : -Infinity;
        return bk - ak;  // highest K/9 first
      }
      return b.totalPitches - a.totalPitches;
    });
  }, [data, search, handFilter, mlbTeamFilter, sortBy]);

  const detail = selected ? filtered.find(p => p.slug === selected) ?? data?.pitchers.find(p => p.slug === selected) ?? null : null;

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-48 bg-muted rounded animate-pulse" />
        <div className="h-72 bg-muted/50 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Pitchers</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {data.pitchers.length} probable starters · pitch arsenals from MLB Statcast {data.season}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1" role="tablist" aria-label="Throws">
          {([
            { v: 'all', label: 'L+R' },
            { v: 'R', label: 'RHP' },
            { v: 'L', label: 'LHP' },
          ] as const).map(o => (
            <button
              key={o.v}
              onClick={() => setHandFilter(o.v)}
              role="tab"
              aria-selected={handFilter === o.v}
              className={`min-h-[38px] px-3.5 py-2 text-xs sm:text-[11px] sm:py-1.5 rounded transition-colors ${
                handFilter === o.v
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
          {teamOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as 'volume' | 'name' | 'era' | 'k9')}
          aria-label="Sort by"
          className="min-h-[38px] sm:min-h-[32px] bg-background border border-border rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
        >
          <option value="volume">Sort: Pitches thrown</option>
          <option value="era">Sort: ERA (low → high)</option>
          <option value="k9">Sort: K/9 (high → low)</option>
          <option value="name">Sort: Name</option>
        </select>

        <input
          type="text"
          placeholder="Search by name or team..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] max-w-sm bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
      </div>

      {/* Selected pitcher detail (sticky at top of list) */}
      {detail && (
        <div className="border border-border rounded-lg p-4 sm:p-5 bg-card">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <h2 className="text-base font-semibold">{detail.name}</h2>
              <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                {detail.mlbTeam ?? '???'}
                {detail.pitchHand && <> · {detail.pitchHand}HP</>}
                {detail.age && <> · age {detail.age}</>}
                {detail.totalPitches > 0 && <> · {detail.totalPitches.toLocaleString()} pitches</>}
              </p>
              {detail.season && detail.season.gamesStarted != null && (
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-3 gap-y-1 mt-3 text-[11px]">
                  {[
                    { label: 'GS', value: detail.season.gamesStarted },
                    { label: 'IP', value: detail.season.inningsPitched },
                    { label: 'ERA', value: detail.season.era },
                    { label: 'WHIP', value: detail.season.whip },
                    { label: 'K/9', value: detail.season.strikeoutsPer9Inn },
                    { label: 'BB/9', value: detail.season.walksPer9Inn },
                  ].map(s => (
                    <div key={s.label} className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.label}</span>
                      <span className="tabular-nums font-medium text-foreground">{s.value ?? '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setSelected(null)}
              aria-label="Close detail"
              className="text-muted-foreground hover:text-foreground w-9 h-9 -mr-2 -mt-2 rounded hover:bg-muted flex items-center justify-center text-base leading-none shrink-0"
            >×</button>
          </div>

          {detail.pitches.length === 0 ? (
            <p className="text-xs text-muted-foreground">No pitch arsenal data for this season yet.</p>
          ) : (
            <div className="space-y-4">
              {/* Stacked horizontal usage bar */}
              <div className="flex h-7 rounded-md overflow-hidden border border-border" role="img" aria-label="Pitch usage">
                {detail.pitches.map(p => (
                  <div
                    key={p.code}
                    style={{ backgroundColor: pitchColor(p.code), width: `${p.percentage * 100}%` }}
                    title={`${p.description}: ${fmtPct(p.percentage)}, ${fmtMph(p.averageSpeed)}`}
                    className="flex items-center justify-center text-[10px] font-medium text-white tabular-nums"
                  >
                    {p.percentage >= 0.08 ? p.code : ''}
                  </div>
                ))}
              </div>

              {/* Legend / detail table */}
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="text-left text-[11px] font-medium text-muted-foreground py-1.5 pr-2"></th>
                    <th className="text-left text-[11px] font-medium text-muted-foreground py-1.5">Pitch</th>
                    <th className="text-right text-[11px] font-medium text-muted-foreground py-1.5">Usage</th>
                    <th className="text-right text-[11px] font-medium text-muted-foreground py-1.5">Avg vel</th>
                    <th className="text-right text-[11px] font-medium text-muted-foreground py-1.5">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.pitches.map(p => (
                    <tr key={p.code} className="border-b border-border/30 last:border-b-0">
                      <td className="py-1.5 pr-2">
                        <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: pitchColor(p.code) }} />
                      </td>
                      <td className="py-1.5 tabular-nums"><span className="font-medium">{p.code}</span> <span className="text-muted-foreground">{p.description}</span></td>
                      <td className="py-1.5 text-right tabular-nums">{fmtPct(p.percentage)}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">{fmtMph(p.averageSpeed)}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">{p.pitchCount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Pitcher list */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/40">
              <tr className="border-b border-border">
                <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2.5">Pitcher</th>
                <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2.5">Team</th>
                <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2.5">T</th>
                <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2.5">IP</th>
                <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2.5">ERA</th>
                <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2.5">K/9</th>
                <th className="text-right text-[11px] font-medium text-muted-foreground px-3 py-2.5">Pitches</th>
                <th className="text-left text-[11px] font-medium text-muted-foreground px-3 py-2.5 min-w-[140px]">Arsenal mix</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const isSelected = selected === p.slug;
                return (
                  <tr
                    key={p.id}
                    onClick={() => setSelected(isSelected ? null : p.slug)}
                    className={`border-b border-border/40 cursor-pointer transition-colors ${
                      isSelected ? 'bg-primary/10' : 'hover:bg-muted/30'
                    }`}
                  >
                    <td className="px-3 py-2 text-sm font-medium">{p.name}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">{p.mlbTeam ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{p.pitchHand ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-right tabular-nums text-muted-foreground">{p.season?.inningsPitched ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-right tabular-nums">{p.season?.era ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-right tabular-nums text-muted-foreground">{p.season?.strikeoutsPer9Inn ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-right text-muted-foreground tabular-nums">{p.totalPitches.toLocaleString()}</td>
                    <td className="px-3 py-2">
                      {p.pitches.length === 0 ? (
                        <span className="text-[10px] text-muted-foreground/60">no data</span>
                      ) : (
                        <div className="flex h-3 rounded-sm overflow-hidden border border-border/60 max-w-[200px]">
                          {p.pitches.map(pp => (
                            <div
                              key={pp.code}
                              style={{ backgroundColor: pitchColor(pp.code), width: `${pp.percentage * 100}%` }}
                              title={`${pp.code} ${fmtPct(pp.percentage)}`}
                            />
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-xs text-muted-foreground">No pitchers match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
