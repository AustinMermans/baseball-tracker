'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { fetchData } from '@/lib/data';

// Mirrors the slug rule used by generate-static.ts so leader-card batter
// names route to /players/[slug] without needing slugs in the JSON.
function slugify(name: string): string {
  return name.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

interface PitchMixEntry {
  code: string;
  name: string;
  count: number;
  velocityQuartiles: [number, number, number, number, number] | null;
  avgVelocity: number | null;
  velocityHistogram: number[];
}

interface PitchLocationGrid {
  name: string;
  grid: number[][];
  max: number;
}

interface Leaders {
  hardestPitch: {
    pitcherId: number; pitcherName: string;
    pitchType: string | null; pitchName: string | null;
    releaseSpeed: number; gameDate: string;
  } | null;
  hardestHit: {
    batterId: number; batterName: string;
    pitcherId: number; pitcherName: string;
    launchSpeed: number; launchAngle: number;
    event: string; gameDate: string;
  } | null;
  longestHit: {
    batterId: number; batterName: string;
    pitcherId: number; pitcherName: string;
    totalDistance: number; launchSpeed: number; launchAngle: number;
    event: string; gameDate: string;
  } | null;
}

interface StatcastData {
  season: number;
  generatedAt: string;
  totalPitches: number;
  battedBalls: number;
  knownOutcomes: number;
  leaders: Leaders;
  pitchMix: PitchMixEntry[];
  velocityHist: { min: number; max: number; binSize: number };
  pitchLocation: {
    xMin: number; xMax: number; xBins: number;
    zMin: number; zMax: number; zBins: number;
    strikeZone: { left: number; right: number; bottom: number; top: number };
    byType: Record<string, PitchLocationGrid>;
  };
  battedBallRunValue: {
    lsMin: number; lsMax: number; lsBins: number;
    laMin: number; laMax: number; laBins: number;
    grid: { avg: number | null; count: number }[][];
  };
}

// Sequential purple ramp aligned with the app's primary hue. Below `cutoff`
// the cell is transparent so sparse one-off pitches don't fog the panel.
function densityColor(t: number, cutoff = 0.06): string {
  if (t <= cutoff) return 'transparent';
  // Re-normalize above cutoff so the gradient uses its full range.
  const tt = (t - cutoff) / (1 - cutoff);
  const stops = [
    { t: 0,    h: 262, s: 50,  l: 88, a: 0.55 },
    { t: 0.25, h: 262, s: 60,  l: 70, a: 0.75 },
    { t: 0.55, h: 262, s: 65,  l: 52, a: 0.9  },
    { t: 0.85, h: 262, s: 70,  l: 38, a: 0.95 },
    { t: 1.0,  h: 262, s: 75,  l: 26, a: 1.0  },
  ];
  for (let i = 1; i < stops.length; i++) {
    if (tt <= stops[i].t) {
      const a = stops[i - 1], b = stops[i];
      const f = (tt - a.t) / (b.t - a.t);
      const lerp = (x: number, y: number) => x + (y - x) * f;
      return `hsla(${lerp(a.h, b.h)}, ${lerp(a.s, b.s)}%, ${lerp(a.l, b.l)}%, ${lerp(a.a, b.a)})`;
    }
  }
  return `hsla(262, 75%, 26%, 1)`;
}

// Diverging red ↔ neutral ↔ green for run values. Centered at zero. Pushed
// darker at both extremes (peak ~28% lightness) so the chart reads as a true
// dark-red → cream → dark-green gradient rather than a pastel wash.
function divergingColor(value: number, magnitude: number): string {
  if (Math.abs(value) < 1e-9) return 'hsl(45, 25%, 95%)';
  const t = Math.max(-1, Math.min(1, value / magnitude));
  if (t > 0) {
    const l = 92 - t * 64;
    const s = 55 + t * 10;
    return `hsl(142, ${s}%, ${l}%)`;
  } else {
    const l = 92 - Math.abs(t) * 64;
    const s = 65 + Math.abs(t) * 10;
    return `hsl(8, ${s}%, ${l}%)`;
  }
}

// Statcast-style pitch palette for the small label chips. Same colors used
// elsewhere in the app for consistency.
const PITCH_COLORS: Record<string, string> = {
  FF: '#d62728', SI: '#ff7f0e', FC: '#bcbd22', FS: '#2ca02c',
  CH: '#17becf', SL: '#1f77b4', ST: '#9467bd', CU: '#8c564b',
  KC: '#e377c2', SV: '#7f7f7f',
};

function pitchColor(code: string): string {
  return PITCH_COLORS[code] ?? 'hsl(var(--primary))';
}

// Seasons for which we ship a pre-aggregated statcast-{season}.json.
// Add new seasons here as they get backfilled — the page tries each in turn
// (newest first) and shows the first that loads.
const SUPPORTED_SEASONS = [2026, 2025, 2024];

export default function NerdsPage() {
  return (
    <Suspense fallback={null}>
      <NerdsPageInner />
    </Suspense>
  );
}

function NerdsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSeason = (() => {
    const q = parseInt(searchParams.get('season') ?? '', 10);
    return SUPPORTED_SEASONS.includes(q) ? q : SUPPORTED_SEASONS[0];
  })();
  const [data, setData] = useState<StatcastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [season, setSeason] = useState<number>(initialSeason);
  const [available, setAvailable] = useState<number[]>([SUPPORTED_SEASONS[0]]);

  // Persist the chosen season in the URL so it survives reloads / can be linked.
  useEffect(() => {
    const url = season === SUPPORTED_SEASONS[0] ? '/nerds' : `/nerds?season=${season}`;
    router.replace(url, { scroll: false });
  }, [season, router]);

  // On mount, probe each supported season once and remember which ones exist.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found: number[] = [];
      for (const s of SUPPORTED_SEASONS) {
        try {
          const r = await fetch(`/api/statcast/${s}`, { method: 'HEAD' });
          if (r.ok) found.push(s);
        } catch { /* ignore */ }
      }
      if (cancelled) return;
      // Always include the default current season even if HEAD failed (works
      // both for the static export, where HEAD might 404 spuriously, and for
      // edge cases where a season is in flight).
      if (found.length === 0) found.push(SUPPORTED_SEASONS[0]);
      setAvailable(found);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    const path = season === SUPPORTED_SEASONS[0] ? '/api/statcast' : `/api/statcast/${season}`;
    fetchData<StatcastData>(path)
      .then(setData)
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [season]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-48 bg-muted rounded animate-pulse" />
        <div className="h-72 bg-muted/50 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Nerds</h1>
        <p className="text-sm text-muted-foreground">{err ?? 'No statcast data yet — run scripts/sync-pitches.ts.'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-block w-1 h-9 bg-primary rounded-full shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">Nerds</h1>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {data.totalPitches.toLocaleString()} pitches · {data.battedBalls.toLocaleString()} batted balls · {data.season} season
              {' · '}
              <span className="text-muted-foreground/70">league-wide aggregates from MLB Statcast</span>
            </p>
          </div>
        </div>
        {available.length > 1 && (
          <div className="flex items-center gap-1 shrink-0 border border-border rounded-md p-0.5 bg-card">
            {available.map(s => (
              <button
                key={s}
                onClick={() => setSeason(s)}
                className={`text-xs px-2.5 py-1 rounded tabular-nums transition-colors ${
                  s === season
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <LeadersSection leaders={data.leaders} idx="01" />
      <PitchMixSection data={data} idx="02" />
      <PitchLocationSection data={data} idx="03" />
      <RunValueSection data={data} idx="04" />

      <div className="pt-4 mt-2 border-t border-border text-[11px] text-muted-foreground/80 leading-relaxed">
        <p>
          Source: MLB Stats API <code className="font-mono text-[10px]">/game/&#123;gamePk&#125;/feed/live</code> · pitch-by-pitch tracking via Statcast.
          {' '}Aggregates rebuilt daily. Run values use fixed{' '}
          <a href="https://library.fangraphs.com/principles/linear-weights/" target="_blank" rel="noopener noreferrer"
             className="underline-offset-2 hover:underline hover:text-foreground">
            Tango linear weights
          </a>
          {' '}as a stand-in for Statcast&apos;s delta-run-expectancy.
        </p>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// League Extremes — three highlight cards
// ----------------------------------------------------------------------------

function LeadersSection({ leaders, idx }: { leaders: Leaders; idx?: string }) {
  if (!leaders) return null;
  const fmtDate = (iso: string) => {
    try {
      const d = new Date(iso + 'T00:00:00Z');
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    } catch { return iso; }
  };
  return (
    <section>
      <SectionHeader idx={idx} title="League Extremes"
        subtitle="Single-pitch outliers from the season — the hardest, the loudest, the longest." />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {leaders.hardestPitch && (
          <LeaderCard
            label="Hardest pitch"
            big={`${leaders.hardestPitch.releaseSpeed.toFixed(1)} mph`}
            primary={leaders.hardestPitch.pitcherName}
            secondary={`${leaders.hardestPitch.pitchName ?? leaders.hardestPitch.pitchType} · ${fmtDate(leaders.hardestPitch.gameDate)}`}
            accent={leaders.hardestPitch.pitchType ? pitchColor(leaders.hardestPitch.pitchType) : 'hsl(var(--primary))'}
          />
        )}
        {leaders.hardestHit && (
          <LeaderCard
            label="Hardest hit ball"
            big={`${leaders.hardestHit.launchSpeed.toFixed(1)} mph`}
            primary={leaders.hardestHit.batterName}
            primaryHref={`/players/${slugify(leaders.hardestHit.batterName)}`}
            secondary={`${leaders.hardestHit.event} · ${leaders.hardestHit.launchAngle}° off ${leaders.hardestHit.pitcherName} · ${fmtDate(leaders.hardestHit.gameDate)}`}
            accent="#16a34a"
          />
        )}
        {leaders.longestHit && (
          <LeaderCard
            label="Longest hit"
            big={`${leaders.longestHit.totalDistance} ft`}
            primary={leaders.longestHit.batterName}
            primaryHref={`/players/${slugify(leaders.longestHit.batterName)}`}
            secondary={`${leaders.longestHit.event} · ${leaders.longestHit.launchSpeed.toFixed(1)} mph @ ${leaders.longestHit.launchAngle}° · ${fmtDate(leaders.longestHit.gameDate)}`}
            accent="#d97706"
          />
        )}
      </div>
    </section>
  );
}

function LeaderCard({
  label, big, primary, primaryHref, secondary, accent,
}: {
  label: string; big: string; primary: string; primaryHref?: string;
  secondary: string; accent: string;
}) {
  const primaryEl = primaryHref ? (
    <Link href={primaryHref} className="text-sm font-medium text-foreground hover:text-primary transition-colors truncate inline-block max-w-full" title={primary}>
      {primary}
    </Link>
  ) : (
    <span className="text-sm font-medium text-foreground truncate inline-block max-w-full" title={primary}>{primary}</span>
  );
  return (
    <div className="border border-border rounded-lg bg-card p-4 relative overflow-hidden hover:shadow-sm transition-shadow">
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: accent }} />
      <div className="pl-2">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tabular-nums mt-1" style={{ color: accent }}>{big}</div>
        <div className="mt-1.5">{primaryEl}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{secondary}</div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Pitch Mix + Velocity (single combined section: bar + box plots side-by-side)
// ----------------------------------------------------------------------------

function PitchMixSection({ data, idx }: { data: StatcastData; idx?: string }) {
  const total = data.totalPitches;
  const filtered = data.pitchMix.filter(p => p.count >= 50).slice(0, 14);
  const maxCount = Math.max(...filtered.map(p => p.count));
  const allVelos = filtered.flatMap(p => (p.velocityQuartiles ? [p.velocityQuartiles[0], p.velocityQuartiles[4]] : []));
  const veloMin = Math.floor(Math.min(...allVelos) - 2);
  const veloMax = Math.ceil(Math.max(...allVelos) + 2);

  return (
    <section>
      <SectionHeader idx={idx} title="Pitch Mix · Velocity Distribution"
        subtitle="What's getting thrown, and how hard. Each violin is a smoothed kernel-density of release speed; bar = IQR; dot = median." />

      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] divide-y lg:divide-y-0 lg:divide-x divide-border">
          {/* Pitch Mix (horizontal usage bars) */}
          <div className="p-5">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-3">Pitch Mix</div>
            <div className="space-y-1.5">
              {filtered.map(p => {
                const w = (p.count / maxCount) * 100;
                const pct = (p.count / total) * 100;
                const med = p.velocityQuartiles?.[2];
                return (
                  <div key={p.code} className="flex items-center gap-2 text-[11px]" title={`${p.count.toLocaleString()} pitches`}>
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: pitchColor(p.code) }} />
                    <span className="font-medium tabular-nums w-6 shrink-0">{p.code}</span>
                    <span className="text-muted-foreground truncate w-24 shrink-0">{p.name}</span>
                    <div className="flex-1 h-4 bg-muted/50 rounded-sm overflow-hidden relative">
                      <div className="h-full rounded-sm transition-all" style={{ width: `${w}%`, backgroundColor: pitchColor(p.code), opacity: 0.85 }} />
                    </div>
                    <span className="tabular-nums w-12 text-right text-foreground">{pct.toFixed(1)}%</span>
                    <span className="tabular-nums w-14 text-right text-muted-foreground hidden sm:inline">{med != null ? `${med.toFixed(0)} mph` : '—'}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Velocity violins */}
          <div className="p-5 overflow-x-auto">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-3">Velocity by Pitch Type (mph)</div>
            <ViolinPanel pitches={filtered} hist={data.velocityHist} veloMin={veloMin} veloMax={veloMax} />
          </div>
        </div>
      </div>
    </section>
  );
}

// Smooth a histogram with a small Gaussian kernel (sigma in bins).
function smoothHist(h: number[], sigma = 1.5): number[] {
  const radius = Math.ceil(sigma * 3);
  const kernel: number[] = [];
  for (let i = -radius; i <= radius; i++) kernel.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
  const ksum = kernel.reduce((s, v) => s + v, 0);
  return h.map((_, i) => {
    let acc = 0;
    for (let j = -radius; j <= radius; j++) {
      const idx = i + j;
      if (idx < 0 || idx >= h.length) continue;
      acc += h[idx] * kernel[j + radius];
    }
    return acc / ksum;
  });
}

// Catmull-Rom spline → cubic Bezier path data, for smooth violin/area outlines.
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function ViolinPanel({
  pitches,
  hist,
  veloMin,
  veloMax,
}: {
  pitches: PitchMixEntry[];
  hist: { min: number; max: number; binSize: number };
  veloMin: number;
  veloMax: number;
}) {
  const W = 480;
  const ROW_H = 30;
  const H = pitches.length * ROW_H + 40;
  const padL = 56, padR = 16, padT = 8, padB = 28;
  const innerW = W - padL - padR;
  const xToPx = (v: number) => padL + ((v - veloMin) / (veloMax - veloMin)) * innerW;

  const tickStep = 5;
  const ticks: number[] = [];
  for (let v = Math.ceil(veloMin / tickStep) * tickStep; v <= veloMax; v += tickStep) ticks.push(v);

  // Smoothed densities for each pitch type, normalized so the tallest bin in
  // each pitch's own distribution maps to half-row-height. Each violin shows
  // its own shape clearly without a tiny pitch type's distribution looking flat.
  const violins = pitches.map(p => {
    const histRaw = p.velocityHistogram ?? [];
    const smoothed = histRaw.length ? smoothHist(histRaw, 1.6) : [];
    const max = smoothed.length ? Math.max(...smoothed) || 1 : 1;
    return { code: p.code, name: p.name, q: p.velocityQuartiles, smoothed, max };
  });

  const halfH = (ROW_H - 8) / 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" className="text-foreground">
      {/* Vertical gridlines */}
      {ticks.map(t => (
        <line key={t} x1={xToPx(t)} x2={xToPx(t)} y1={padT} y2={H - padB} stroke="hsl(var(--border))" strokeWidth="0.5" strokeOpacity="0.6" />
      ))}
      {/* Tick labels */}
      {ticks.map(t => (
        <text key={t} x={xToPx(t)} y={H - padB + 14} textAnchor="middle" fontSize="9" fill="hsl(var(--muted-foreground))" className="tabular-nums">{t}</text>
      ))}
      <text x={padL + innerW / 2} y={H - 4} textAnchor="middle" fontSize="9" fill="hsl(var(--muted-foreground))">mph</text>

      {violins.map((v, i) => {
        const yMid = padT + i * ROW_H + ROW_H / 2;
        const c = pitchColor(v.code);

        // Build the violin outline: top points = (binCenter, yMid - halfH * d/max),
        // then bottom points reversed.
        const top: { x: number; y: number }[] = [];
        const bot: { x: number; y: number }[] = [];
        for (let bin = 0; bin < v.smoothed.length; bin++) {
          const mph = hist.min + (bin + 0.5) * hist.binSize;
          if (mph < veloMin - 1 || mph > veloMax + 1) continue;
          const d = v.smoothed[bin] / v.max; // 0..1
          if (d < 0.005) continue;
          const x = xToPx(mph);
          const offset = halfH * d;
          top.push({ x, y: yMid - offset });
          bot.unshift({ x, y: yMid + offset });
        }
        if (top.length < 2) return null;
        const outline = smoothPath(top) + ' ' + smoothPath(bot).replace(/^M/, 'L') + ' Z';

        const q = v.q;
        return (
          <g key={v.code}>
            {/* Pitch code label */}
            <text x={padL - 6} y={yMid + 3} textAnchor="end" fontSize="10" fill="hsl(var(--foreground))" fontWeight="500" className="tabular-nums">{v.code}</text>
            {/* Violin body */}
            <path d={outline} fill={c} fillOpacity="0.32" stroke={c} strokeWidth="1" strokeOpacity="0.85" />
            {/* IQR center band */}
            {q && (
              <line x1={xToPx(q[1])} x2={xToPx(q[3])} y1={yMid} y2={yMid} stroke={c} strokeWidth="1.5" strokeOpacity="0.6" />
            )}
            {/* Median tick */}
            {q && (
              <circle cx={xToPx(q[2])} cy={yMid} r={2.5} fill={c} stroke="white" strokeWidth="1" />
            )}
            {q && (
              <title>{`${v.name}\nmin ${q[0].toFixed(1)} · q25 ${q[1].toFixed(1)} · med ${q[2].toFixed(1)} · q75 ${q[3].toFixed(1)} · max ${q[4].toFixed(1)} mph`}</title>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ----------------------------------------------------------------------------
// Pitch Location Heatmap (small multiples by pitch type)
// ----------------------------------------------------------------------------

function PitchLocationSection({ data, idx }: { data: StatcastData; idx?: string }) {
  const { pitchLocation, pitchMix } = data;
  const codes = pitchMix.slice(0, 6).map(p => p.code).filter(c => pitchLocation.byType[c]);
  // Build a quick code → median-mph map so the panel header can show velocity.
  const medByCode = new Map<string, number | null>();
  for (const p of pitchMix) {
    medByCode.set(p.code, p.velocityQuartiles?.[2] ?? null);
  }
  return (
    <section>
      <SectionHeader idx={idx} title="Pitch Location Density"
        subtitle="Where each pitch type is thrown, viewed from the catcher's perspective. Strike zone shown in outline." />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {codes.map(code => (
          <PitchLocationPanel key={code} code={code} entry={pitchLocation.byType[code]} loc={pitchLocation} medianMph={medByCode.get(code) ?? null} />
        ))}
      </div>
    </section>
  );
}

function PitchLocationPanel({
  code,
  entry,
  loc,
  medianMph,
}: {
  code: string;
  entry: PitchLocationGrid;
  loc: StatcastData['pitchLocation'];
  medianMph: number | null;
}) {
  const W = 220, H = 260;
  const padL = 30, padR = 8, padT = 30, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const cellW = innerW / loc.xBins;
  const cellH = innerH / loc.zBins;
  const xToPx = (x: number) => padL + ((x - loc.xMin) / (loc.xMax - loc.xMin)) * innerW;
  const zToPx = (z: number) => padT + ((loc.zMax - z) / (loc.zMax - loc.zMin)) * innerH; // Z is up

  // Build the cells. The grid is [zBins][xBins]; row 0 is the lowest z (bottom of frame).
  // Track which bin centers are inside the strike-zone box so we can show
  // "% in zone" — a more useful summary than raw "peak count".
  const cells: { x: number; y: number; v: number }[] = [];
  let totalCount = 0;
  let inZoneCount = 0;
  // Track count-weighted centroid in raw plate coordinates, so we can drop a
  // small dot on the panel marking each pitch type's average location.
  let cxAccum = 0, czAccum = 0;
  const xBinW = (loc.xMax - loc.xMin) / loc.xBins;
  const zBinH = (loc.zMax - loc.zMin) / loc.zBins;
  for (let zi = 0; zi < loc.zBins; zi++) {
    for (let xi = 0; xi < loc.xBins; xi++) {
      const v = entry.grid[zi][xi];
      const px = padL + xi * cellW;
      const py = padT + (loc.zBins - 1 - zi) * cellH;
      cells.push({ x: px, y: py, v });
      totalCount += v;
      const cx = loc.xMin + (xi + 0.5) * xBinW;
      const cz = loc.zMin + (zi + 0.5) * zBinH;
      cxAccum += cx * v;
      czAccum += cz * v;
      if (cx >= loc.strikeZone.left && cx <= loc.strikeZone.right
          && cz >= loc.strikeZone.bottom && cz <= loc.strikeZone.top) {
        inZoneCount += v;
      }
    }
  }
  const pctInZone = totalCount > 0 ? (inZoneCount / totalCount) * 100 : 0;
  const centroid = totalCount > 0
    ? { x: cxAccum / totalCount, z: czAccum / totalCount }
    : null;

  return (
    <div className="border border-border rounded-lg bg-card p-3">
      <div className="flex items-baseline justify-between mb-1.5 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: pitchColor(code) }} />
          <span className="text-[12px] font-medium truncate">{entry.name}</span>
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
          {pctInZone.toFixed(0)}% in zone{medianMph != null && <> · {medianMph.toFixed(0)} mph</>}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet">
        <defs>
          {/* Elevation-map effect: heavy Gaussian blur over the discrete cells
              produces a smooth density field, then feComponentTransfer with
              discrete alpha steps quantizes that field into clean isobands
              (no rectangular grid visible). */}
          <filter id={`isoband-${code}`} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="4.5" />
            <feComponentTransfer>
              <feFuncA type="discrete" tableValues="0 0 0.25 0.45 0.62 0.78 0.92 1" />
            </feComponentTransfer>
          </filter>
        </defs>
        {/* Gridlines (subtle) */}
        {[-1, 0, 1].map(x => (
          <line key={x} x1={xToPx(x)} x2={xToPx(x)} y1={padT} y2={H - padB} stroke="hsl(var(--border))" strokeWidth="0.5" />
        ))}
        {[1, 2, 3, 4].map(z => (
          <line key={z} x1={padL} x2={W - padR} y1={zToPx(z)} y2={zToPx(z)} stroke="hsl(var(--border))" strokeWidth="0.5" />
        ))}
        {/* Density cells; the filter blurs + posterizes the alpha to bands. */}
        <g filter={`url(#isoband-${code})`}>
          {cells.map((c, i) => {
            const t = c.v / Math.max(1, entry.max);
            if (t < 0.04) return null;
            return (
              <rect key={i} x={c.x} y={c.y} width={cellW + 0.5} height={cellH + 0.5}
                fill={densityColor(t)} />
            );
          })}
        </g>
        {/* Strike zone overlay */}
        <rect
          x={xToPx(loc.strikeZone.left)}
          y={zToPx(loc.strikeZone.top)}
          width={xToPx(loc.strikeZone.right) - xToPx(loc.strikeZone.left)}
          height={zToPx(loc.strikeZone.bottom) - zToPx(loc.strikeZone.top)}
          fill="none"
          stroke="hsl(var(--foreground))"
          strokeWidth="1.5"
          strokeOpacity="0.85"
        />
        {/* Centroid marker — count-weighted average location for this pitch type */}
        {centroid && (
          <g pointerEvents="none">
            <circle cx={xToPx(centroid.x)} cy={zToPx(centroid.z)} r={4.5} fill="white" stroke={pitchColor(code)} strokeWidth="2" />
            <circle cx={xToPx(centroid.x)} cy={zToPx(centroid.z)} r={1.5} fill={pitchColor(code)} />
            <title>{`Avg location: x=${centroid.x.toFixed(2)} ft, z=${centroid.z.toFixed(2)} ft`}</title>
          </g>
        )}
        {/* Axis ticks */}
        {[-2, -1, 0, 1, 2].map(x => (
          <text key={x} x={xToPx(x)} y={H - padB + 10} textAnchor="middle" fontSize="8" fill="hsl(var(--muted-foreground))" className="tabular-nums">{x}</text>
        ))}
        {[1, 2, 3, 4].map(z => (
          <text key={z} x={padL - 4} y={zToPx(z) + 3} textAnchor="end" fontSize="8" fill="hsl(var(--muted-foreground))" className="tabular-nums">{z}</text>
        ))}
        <text x={padL + innerW / 2} y={H - 4} textAnchor="middle" fontSize="8" fill="hsl(var(--muted-foreground))">plate x (ft)</text>
      </svg>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Batted-Ball Run Value Heatmap
// ----------------------------------------------------------------------------

function RunValueSection({ data, idx }: { data: StatcastData; idx?: string }) {
  const rv = data.battedBallRunValue;
  // Lock the color scale magnitude so the legend's tick labels match the
  // heatmap's saturation — anything ≥0.9 (HR territory) clamps to deepest green.
  const SCALE_MAGNITUDE = 0.9;
  return (
    <section>
      <SectionHeader idx={idx} title="Batted-Ball Run Value"
        subtitle="Average run value of every batted ball, by exit velocity and launch angle. Green = damage; red = outs. Linear weights (Tango)." />
      <div className="border border-border rounded-xl bg-card p-4 sm:p-6 overflow-x-auto">
        <RunValueHeatmap rv={rv} magnitude={SCALE_MAGNITUDE} />
        <Legend min={-SCALE_MAGNITUDE} max={SCALE_MAGNITUDE} />
      </div>
    </section>
  );
}

function RunValueHeatmap({ rv, magnitude }: { rv: StatcastData['battedBallRunValue']; magnitude: number }) {
  const W = 760, H = 380;
  const padL = 56, padR = 96, padT = 18, padB = 38;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const cellW = innerW / rv.lsBins;
  const cellH = innerH / rv.laBins;

  const lsToPx = (ls: number) => padL + ((ls - rv.lsMin) / (rv.lsMax - rv.lsMin)) * innerW;
  const laToPx = (la: number) => padT + ((rv.laMax - la) / (rv.laMax - rv.laMin)) * innerH;

  const lsTicks: number[] = [];
  for (let v = rv.lsMin; v <= rv.lsMax; v += 10) lsTicks.push(v);
  const laTicks: number[] = [];
  for (let v = -75; v <= 75; v += 15) laTicks.push(v);

  // Count-weighted Gaussian smooth over each cell's 3×3 neighborhood. Outputs a
  // continuous avg run value (or null when the neighborhood is too sparse to
  // trust). The blur+posterize-alpha SVG filter applied below handles the
  // visual smoothing — we don't band-snap here, so the resulting isobands come
  // from the alpha quantization rather than discrete fill colors.
  const smoothed: (number | null)[][] = Array.from({ length: rv.laBins }, () => Array(rv.lsBins).fill(null));
  for (let ai = 0; ai < rv.laBins; ai++) {
    for (let si = 0; si < rv.lsBins; si++) {
      let sum = 0, weight = 0, nbrs = 0;
      for (let dai = -1; dai <= 1; dai++) {
        for (let dsi = -1; dsi <= 1; dsi++) {
          const aj = ai + dai, sj = si + dsi;
          if (aj < 0 || aj >= rv.laBins || sj < 0 || sj >= rv.lsBins) continue;
          const c = rv.grid[aj][sj];
          if (c.avg == null || c.count < 1) continue;
          const k = (dai === 0 && dsi === 0) ? 4 : (dai === 0 || dsi === 0 ? 2 : 1);
          const w = k * Math.min(20, c.count);
          sum += c.avg * w;
          weight += w;
          nbrs++;
        }
      }
      if (weight > 0 && nbrs >= 1) smoothed[ai][si] = sum / weight;
    }
  }

  // Single light extrapolation pass: only fills null cells with ≥3 non-null
  // neighbors (concave edges of the envelope). Keeps the boundary close to the
  // real data — sub-cell feathering happens in the bilinear renderer below.
  {
    const next = smoothed.map(row => row.slice());
    for (let ai = 0; ai < rv.laBins; ai++) {
      for (let si = 0; si < rv.lsBins; si++) {
        if (smoothed[ai][si] != null) continue;
        let sum = 0, n = 0;
        for (let dai = -1; dai <= 1; dai++) {
          for (let dsi = -1; dsi <= 1; dsi++) {
            if (dai === 0 && dsi === 0) continue;
            const aj = ai + dai, sj = si + dsi;
            if (aj < 0 || aj >= rv.laBins || sj < 0 || sj >= rv.lsBins) continue;
            const v = smoothed[aj][sj];
            if (v == null) continue;
            sum += v;
            n++;
          }
        }
        if (n >= 3) next[ai][si] = sum / n;
      }
    }
    for (let ai = 0; ai < rv.laBins; ai++) {
      for (let si = 0; si < rv.lsBins; si++) smoothed[ai][si] = next[ai][si];
    }
  }

  // Static tooltip layer above the iso layers — kept un-filtered so hovering
  // returns the original cell's stats, not a smoothed approximation.
  const tooltipCells: React.ReactNode[] = [];
  for (let ai = 0; ai < rv.laBins; ai++) {
    for (let si = 0; si < rv.lsBins; si++) {
      const c = rv.grid[ai][si];
      if (c.avg == null || c.count < 2) continue;
      const x = padL + si * cellW;
      const y = padT + (rv.laBins - 1 - ai) * cellH;
      tooltipCells.push(
        <rect key={`t-${ai}-${si}`} x={x} y={y} width={cellW + 0.5} height={cellH + 0.5}
          fill="transparent" pointerEvents="all">
          <title>{`launch ${(rv.lsMin + (si + 0.5) * (rv.lsMax - rv.lsMin) / rv.lsBins).toFixed(0)} mph · ${(rv.laMin + (ai + 0.5) * (rv.laMax - rv.laMin) / rv.laBins).toFixed(0)}°\nrun value ${c.avg >= 0 ? '+' : ''}${c.avg.toFixed(2)} · n=${c.count}`}</title>
        </rect>
      );
    }
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet">
      <defs>
        <clipPath id="rv-clip">
          <rect x={padL} y={padT} width={innerW} height={innerH} />
        </clipPath>
      </defs>

      {/* Render a bilinearly-interpolated finer grid: each original cell becomes
          a SUB×SUB block of sub-cells whose values are weighted from the 4
          surrounding original cell centers. This gives a continuous gradient
          (no visible cell boundaries) without any blur — so the field stays
          crisp where the data is, and the envelope edge stays sharp. */}
      <g clipPath="url(#rv-clip)" shapeRendering="crispEdges">
        {(() => {
          const SUB = 6;
          const fineLs = rv.lsBins * SUB;
          const fineLa = rv.laBins * SUB;
          const fineW = innerW / fineLs;
          const fineH = innerH / fineLa;
          const out: React.ReactNode[] = [];
          for (let fa = 0; fa < fineLa; fa++) {
            // Original-grid (cell-center) coordinates of this sub-cell
            const ax = (fa + 0.5) / SUB - 0.5;
            const ai0 = Math.max(0, Math.min(rv.laBins - 2, Math.floor(ax)));
            const tA = Math.max(0, Math.min(1, ax - ai0));
            for (let fs = 0; fs < fineLs; fs++) {
              const sx = (fs + 0.5) / SUB - 0.5;
              const si0 = Math.max(0, Math.min(rv.lsBins - 2, Math.floor(sx)));
              const tS = Math.max(0, Math.min(1, sx - si0));
              const v00 = smoothed[ai0][si0];
              const v01 = smoothed[ai0][si0 + 1];
              const v10 = smoothed[ai0 + 1][si0];
              const v11 = smoothed[ai0 + 1][si0 + 1];
              // Bilinear weights — these always sum to 1 when all corners
              // exist. If any corner is null, sum the available weight and
              // use it as alpha — yields a sub-cell-resolution feathered edge
              // that follows the data envelope without imputing values
              // beyond it.
              const w00 = (1 - tA) * (1 - tS);
              const w01 = (1 - tA) * tS;
              const w10 = tA * (1 - tS);
              const w11 = tA * tS;
              let weightedSum = 0;
              let availW = 0;
              if (v00 != null) { weightedSum += v00 * w00; availW += w00; }
              if (v01 != null) { weightedSum += v01 * w01; availW += w01; }
              if (v10 != null) { weightedSum += v10 * w10; availW += w10; }
              if (v11 != null) { weightedSum += v11 * w11; availW += w11; }
              if (availW < 0.05) continue;
              const v = weightedSum / availW;
              const x = padL + fs * fineW;
              const y = padT + (fineLa - 1 - fa) * fineH;
              // No overlap (no +0.5): when alpha < 1, overlapping rects would
              // accumulate opacity and produce a checkerboard at the boundary.
              const overlap = availW > 0.99 ? 0.5 : 0;
              out.push(
                <rect key={`${fa}-${fs}`} x={x} y={y} width={fineW + overlap} height={fineH + overlap}
                  fill={divergingColor(v, magnitude)} fillOpacity={availW} />
              );
            }
          }
          return out;
        })()}
      </g>

      {/* Reference: 95 mph (avg four-seam / hard-hit threshold). 0° dropped —
          y-axis already labels it. */}
      <line x1={lsToPx(95)} x2={lsToPx(95)} y1={padT} y2={H - padB}
        stroke="hsl(var(--foreground))" strokeWidth="0.5" strokeOpacity="0.22" strokeDasharray="3 3" />

      {/* Barrel-zone marker — small ring at the peak, label sits below the axis. */}
      {(() => {
        const bx = lsToPx(105), by = laToPx(28);
        return (
          <g pointerEvents="none">
            <circle cx={bx} cy={by} r={5.5} fill="none"
              stroke="hsl(var(--foreground))" strokeOpacity="0.6" strokeWidth="1" />
            <circle cx={bx} cy={by} r={1.5} fill="hsl(var(--foreground))" fillOpacity="0.6" />
            <text x={bx} y={H - padB + 26} textAnchor="middle" fontSize="9"
              fill="hsl(var(--foreground))" fillOpacity="0.55"
              className="tracking-wide uppercase">Barrel zone</text>
          </g>
        );
      })()}

      {/* Chart frame */}
      <rect x={padL} y={padT} width={innerW} height={innerH} fill="none"
        stroke="hsl(var(--border))" strokeWidth="1" />

      {/* Right-side launch-angle region gutter: tick marks at 50°/25°/10° plus
          a label centered between each pair of boundaries. Reads like an
          anatomical key rather than text floating over the data. */}
      {(() => {
        const x0 = padL + innerW;
        const tickEnd = x0 + 6;
        const labelX = x0 + 10;
        const boundaries = [50, 25, 10];
        const regions: { yMid: number; text: string }[] = [
          { yMid: (laToPx(rv.laMax) + laToPx(50)) / 2, text: 'Pop ups' },
          { yMid: (laToPx(50) + laToPx(25)) / 2, text: 'Fly balls' },
          { yMid: (laToPx(25) + laToPx(10)) / 2, text: 'Line drives' },
          { yMid: (laToPx(10) + laToPx(rv.laMin)) / 2, text: 'Ground balls' },
        ];
        return (
          <g pointerEvents="none">
            {boundaries.map(b => (
              <line key={b} x1={x0} x2={tickEnd} y1={laToPx(b)} y2={laToPx(b)}
                stroke="hsl(var(--muted-foreground))" strokeWidth="0.5" />
            ))}
            {regions.map(r => (
              <text key={r.text} x={labelX} y={r.yMid + 3} textAnchor="start"
                fontSize="9.5" fontWeight="500" fill="hsl(var(--foreground))" fillOpacity="0.55"
                className="tracking-wide">{r.text}</text>
            ))}
          </g>
        );
      })()}

      {/* X axis */}
      {lsTicks.map(t => (
        <g key={t}>
          <line x1={lsToPx(t)} x2={lsToPx(t)} y1={H - padB} y2={H - padB + 4} stroke="hsl(var(--muted-foreground))" strokeWidth="0.5" />
          <text x={lsToPx(t)} y={H - padB + 14} textAnchor="middle" fontSize="10" fill="hsl(var(--muted-foreground))" className="tabular-nums">{t}</text>
        </g>
      ))}
      <text x={padL + innerW / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="hsl(var(--foreground))">Exit velocity (mph)</text>

      {/* Y axis */}
      {laTicks.map(t => (
        <g key={t}>
          <line x1={padL - 4} x2={padL} y1={laToPx(t)} y2={laToPx(t)} stroke="hsl(var(--muted-foreground))" strokeWidth="0.5" />
          <text x={padL - 6} y={laToPx(t) + 3} textAnchor="end" fontSize="10" fill="hsl(var(--muted-foreground))" className="tabular-nums">{t}°</text>
        </g>
      ))}
      <text x={14} y={padT + innerH / 2} textAnchor="middle" fontSize="11" fill="hsl(var(--foreground))" transform={`rotate(-90 14 ${padT + innerH / 2})`}>Launch angle</text>

      {/* Hover layer — invisible cells that surface per-bin tooltips without
          getting filtered/blurred. Drawn last so it sits on top. */}
      <g>{tooltipCells}</g>
    </svg>
  );
}

function Legend({ min, max }: { min: number; max: number }) {
  // Smooth gradient bar with labeled tick marks at sensible run-value cutoffs.
  const W = 360, H = 44;
  const padL = 12, padR = 12, padT = 4, padB = 22;
  const innerW = W - padL - padR;
  const magnitude = Math.max(Math.abs(min), Math.abs(max));
  const valueToPx = (v: number) => padL + ((v - min) / (max - min)) * innerW;

  // Build a smooth gradient with ~21 colored stops so the diverging palette
  // appears continuous rather than stepped.
  const stops = Array.from({ length: 21 }, (_, i) => {
    const t = i / 20;
    const v = min + t * (max - min);
    return { offset: `${t * 100}%`, color: divergingColor(v, magnitude) };
  });
  const ticks = [-0.5, -0.25, 0, 0.25, 0.5, 0.75].filter(t => t >= min && t <= max);

  return (
    <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
      <span className="font-medium">Run value</span>
      <svg viewBox={`0 0 ${W} ${H}`} width="360" height="44">
        <defs>
          <linearGradient id="rv-scale" x1="0" x2="1" y1="0" y2="0">
            {stops.map((s, i) => <stop key={i} offset={s.offset} stopColor={s.color} />)}
          </linearGradient>
        </defs>
        <rect x={padL} y={padT} width={innerW} height={H - padT - padB} fill="url(#rv-scale)" stroke="hsl(var(--border))" strokeWidth="0.5" rx="2" />
        {ticks.map(t => {
          const x = valueToPx(t);
          return (
            <g key={t}>
              <line x1={x} x2={x} y1={padT} y2={H - padB + 2} stroke="hsl(var(--foreground))" strokeWidth="0.6" strokeOpacity="0.45" />
              <text x={x} y={H - 6} textAnchor="middle" fontSize="9" fill="hsl(var(--muted-foreground))" className="tabular-nums">
                {t > 0 ? `+${t}` : t.toString()}
              </text>
            </g>
          );
        })}
      </svg>
      <span className="text-muted-foreground/70">runs / batted ball</span>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Generic section header
// ----------------------------------------------------------------------------

function SectionHeader({ title, subtitle, idx }: { title: string; subtitle?: string; idx?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2.5">
      {idx && (
        <span className="text-[10px] font-mono font-medium tracking-wider text-primary/60 tabular-nums shrink-0 mt-0.5">
          {idx}
        </span>
      )}
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}
