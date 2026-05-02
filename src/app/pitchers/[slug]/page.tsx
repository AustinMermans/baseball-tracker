'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
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

const PITCH_COLORS: Record<string, string> = {
  FF: '#d62728',
  SI: '#ff7f0e',
  FC: '#bcbd22',
  FS: '#2ca02c',
  CH: '#17becf',
  SL: '#1f77b4',
  ST: '#9467bd',
  CU: '#8c564b',
  KC: '#e377c2',
  SV: '#7f7f7f',
};

function pitchColor(code: string) {
  return PITCH_COLORS[code] ?? '#888';
}

function fmtMph(v: number | null) {
  return v == null ? '—' : `${v.toFixed(1)} mph`;
}

function fmtPct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

export default function PitcherDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  const [data, setData] = useState<PitchersData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData<PitchersData>('/api/pitchers')
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const pitcher = useMemo(() => {
    if (!data || !slug) return null;
    return data.pitchers.find(p => p.slug === slug) ?? null;
  }, [data, slug]);

  const neighbors = useMemo(() => {
    if (!data || !pitcher) return { prev: null as Pitcher | null, next: null as Pitcher | null };
    const sorted = [...data.pitchers].sort((a, b) => a.name.localeCompare(b.name));
    const i = sorted.findIndex(p => p.slug === pitcher.slug);
    return {
      prev: i > 0 ? sorted[i - 1] : null,
      next: i >= 0 && i < sorted.length - 1 ? sorted[i + 1] : null,
    };
  }, [data, pitcher]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-48 bg-muted rounded animate-pulse" />
        <div className="h-72 bg-muted/50 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!pitcher) {
    return (
      <div className="space-y-4">
        <Link href="/pitchers" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center min-h-[36px]">
          ← All pitchers
        </Link>
        <p className="text-sm">Pitcher not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/pitchers" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center min-h-[36px]">
        ← All pitchers
      </Link>

      <div>
        <h1 className="text-xl font-semibold">{pitcher.name}</h1>
        <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
          {pitcher.mlbTeam ?? '???'}
          {pitcher.pitchHand && <> · {pitcher.pitchHand}HP</>}
          {pitcher.age && <> · age {pitcher.age}</>}
          {pitcher.totalPitches > 0 && <> · {pitcher.totalPitches.toLocaleString()} pitches tracked</>}
        </p>
      </div>

      {pitcher.season && pitcher.season.gamesStarted != null && (
        <div className="border border-border rounded-lg p-4 sm:p-5 bg-card">
          <h2 className="text-[11px] uppercase tracking-wide text-muted-foreground mb-3">Season totals</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-4 gap-y-2 text-sm">
            {[
              { label: 'GS', value: pitcher.season.gamesStarted },
              { label: 'IP', value: pitcher.season.inningsPitched },
              { label: 'ERA', value: pitcher.season.era },
              { label: 'WHIP', value: pitcher.season.whip },
              { label: 'K/9', value: pitcher.season.strikeoutsPer9Inn },
              { label: 'BB/9', value: pitcher.season.walksPer9Inn },
              { label: 'K', value: pitcher.season.strikeOuts },
              { label: 'BB', value: pitcher.season.baseOnBalls },
              { label: 'W', value: pitcher.season.wins },
              { label: 'L', value: pitcher.season.losses },
            ].map(s => (
              <div key={s.label} className="flex flex-col">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.label}</span>
                <span className="tabular-nums font-medium">{s.value ?? '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border border-border rounded-lg p-4 sm:p-5 bg-card">
        <h2 className="text-[11px] uppercase tracking-wide text-muted-foreground mb-3">Pitch arsenal</h2>
        {pitcher.pitches.length === 0 ? (
          <p className="text-xs text-muted-foreground">No pitch arsenal data for this season yet.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex h-8 rounded-md overflow-hidden border border-border" role="img" aria-label="Pitch usage">
              {pitcher.pitches.map(p => (
                <div
                  key={p.code}
                  style={{ backgroundColor: pitchColor(p.code), width: `${p.percentage * 100}%` }}
                  title={`${p.description}: ${fmtPct(p.percentage)}, ${fmtMph(p.averageSpeed)}`}
                  className="flex items-center justify-center text-[11px] font-medium text-white tabular-nums"
                >
                  {p.percentage >= 0.06 ? p.code : ''}
                </div>
              ))}
            </div>

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
                {pitcher.pitches.map(p => (
                  <tr key={p.code} className="border-b border-border/30 last:border-b-0">
                    <td className="py-1.5 pr-2">
                      <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: pitchColor(p.code) }} />
                    </td>
                    <td className="py-1.5 tabular-nums">
                      <span className="font-medium">{p.code}</span> <span className="text-muted-foreground">{p.description}</span>
                    </td>
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

      <div className="flex items-center justify-between border-t border-border pt-4">
        {neighbors.prev ? (
          <Link
            href={`/pitchers/${neighbors.prev.slug}`}
            className="inline-flex items-center min-h-[36px] text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← {neighbors.prev.name}
          </Link>
        ) : <span />}
        {neighbors.next ? (
          <Link
            href={`/pitchers/${neighbors.next.slug}`}
            className="inline-flex items-center min-h-[36px] text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {neighbors.next.name} →
          </Link>
        ) : <span />}
      </div>
    </div>
  );
}
