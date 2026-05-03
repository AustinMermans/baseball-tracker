'use client';

import { useEffect, useState } from 'react';
import { fetchData } from '@/lib/data';

interface PitchMixEntry {
  code: string;
  name: string;
  count: number;
  velocityQuartiles: [number, number, number, number, number] | null;
  avgVelocity: number | null;
}

interface PitchLocationGrid {
  name: string;
  grid: number[][];
  max: number;
}

interface StatcastData {
  season: number;
  generatedAt: string;
  totalPitches: number;
  battedBalls: number;
  knownOutcomes: number;
  pitchMix: PitchMixEntry[];
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

// Sequential purple ramp aligned with the app's primary hue.
// Used for density (low → high counts).
function densityColor(t: number): string {
  // Cream → lilac → primary purple → deep
  if (t <= 0) return 'transparent';
  const stops = [
    { t: 0,    h: 250, s: 30,  l: 96 },
    { t: 0.25, h: 262, s: 45,  l: 82 },
    { t: 0.55, h: 262, s: 55,  l: 60 },
    { t: 0.85, h: 262, s: 60,  l: 40 },
    { t: 1.0,  h: 262, s: 65,  l: 25 },
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].t) {
      const a = stops[i - 1], b = stops[i];
      const f = (t - a.t) / (b.t - a.t);
      return `hsl(${a.h + (b.h - a.h) * f}, ${a.s + (b.s - a.s) * f}%, ${a.l + (b.l - a.l) * f}%)`;
    }
  }
  return `hsl(262, 65%, 25%)`;
}

// Diverging red ↔ neutral ↔ green for run values. Centered at zero.
function divergingColor(value: number, magnitude: number): string {
  if (Math.abs(value) < 1e-9) return 'hsl(45, 25%, 95%)';
  const t = Math.max(-1, Math.min(1, value / magnitude));
  if (t > 0) {
    // green ramp
    const l = 92 - t * 50;
    return `hsl(142, 55%, ${l}%)`;
  } else {
    // red ramp
    const l = 92 - Math.abs(t) * 50;
    return `hsl(8, 70%, ${l}%)`;
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

export default function NerdsPage() {
  const [data, setData] = useState<StatcastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchData<StatcastData>('/api/statcast')
      .then(setData)
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

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
      <div>
        <h1 className="text-lg font-semibold">Nerds</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {data.totalPitches.toLocaleString()} pitches · {data.battedBalls.toLocaleString()} batted balls · {data.season} season
          {' · '}
          <span className="text-muted-foreground/70">league-wide aggregates from MLB Statcast</span>
        </p>
      </div>

      <PitchMixSection data={data} />
      <PitchLocationSection data={data} />
      <RunValueSection data={data} />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Pitch Mix + Velocity (single combined section: bar + box plots side-by-side)
// ----------------------------------------------------------------------------

function PitchMixSection({ data }: { data: StatcastData }) {
  const total = data.totalPitches;
  const filtered = data.pitchMix.filter(p => p.count >= 50).slice(0, 14);
  const maxCount = Math.max(...filtered.map(p => p.count));
  const allVelos = filtered.flatMap(p => (p.velocityQuartiles ? [p.velocityQuartiles[0], p.velocityQuartiles[4]] : []));
  const veloMin = Math.floor(Math.min(...allVelos) - 2);
  const veloMax = Math.ceil(Math.max(...allVelos) + 2);

  return (
    <section>
      <SectionHeader title="Pitch Mix · Velocity Distribution"
        subtitle="What's getting thrown, and how hard. Box: 25–75% range; whiskers: min/max; line: median." />

      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] divide-y lg:divide-y-0 lg:divide-x divide-border">
          {/* Pitch Mix (horizontal usage bars) */}
          <div className="p-5">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-3">Pitch Mix</div>
            <div className="space-y-1.5">
              {filtered.map(p => {
                const w = (p.count / maxCount) * 100;
                const pct = (p.count / total) * 100;
                return (
                  <div key={p.code} className="flex items-center gap-2 text-[11px]">
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: pitchColor(p.code) }} />
                    <span className="font-medium tabular-nums w-6 shrink-0">{p.code}</span>
                    <span className="text-muted-foreground truncate w-24 shrink-0">{p.name}</span>
                    <div className="flex-1 h-4 bg-muted/50 rounded-sm overflow-hidden relative">
                      <div className="h-full rounded-sm transition-all" style={{ width: `${w}%`, backgroundColor: pitchColor(p.code), opacity: 0.85 }} />
                    </div>
                    <span className="tabular-nums w-12 text-right text-muted-foreground">{pct.toFixed(1)}%</span>
                    <span className="tabular-nums w-12 text-right text-muted-foreground/70 hidden sm:inline">{p.count.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Velocity boxplots */}
          <div className="p-5 overflow-x-auto">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-3">Velocity by Pitch Type (mph)</div>
            <BoxPlotPanel pitches={filtered} veloMin={veloMin} veloMax={veloMax} />
          </div>
        </div>
      </div>
    </section>
  );
}

function BoxPlotPanel({ pitches, veloMin, veloMax }: { pitches: PitchMixEntry[]; veloMin: number; veloMax: number }) {
  const W = 460;
  const H = pitches.length * 26 + 40;
  const padL = 56, padR = 12, padT = 8, padB = 28;
  const innerW = W - padL - padR;
  const xToPx = (v: number) => padL + ((v - veloMin) / (veloMax - veloMin)) * innerW;

  const tickStep = 5;
  const ticks: number[] = [];
  for (let v = Math.ceil(veloMin / tickStep) * tickStep; v <= veloMax; v += tickStep) ticks.push(v);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" className="text-foreground">
      {/* Vertical gridlines */}
      {ticks.map(t => (
        <line key={t} x1={xToPx(t)} x2={xToPx(t)} y1={padT} y2={H - padB} stroke="hsl(var(--border))" strokeWidth="1" />
      ))}
      {/* Tick labels */}
      {ticks.map(t => (
        <text key={t} x={xToPx(t)} y={H - padB + 14} textAnchor="middle" fontSize="9" fill="hsl(var(--muted-foreground))" className="tabular-nums">{t}</text>
      ))}
      <text x={padL + innerW / 2} y={H - 4} textAnchor="middle" fontSize="9" fill="hsl(var(--muted-foreground))">mph</text>

      {pitches.map((p, i) => {
        const q = p.velocityQuartiles;
        if (!q) return null;
        const [min, q1, med, q3, max] = q;
        const y = padT + i * 26 + 12;
        const c = pitchColor(p.code);
        return (
          <g key={p.code}>
            {/* Pitch label */}
            <text x={padL - 6} y={y + 4} textAnchor="end" fontSize="10" fill="hsl(var(--foreground))" fontWeight="500" className="tabular-nums">{p.code}</text>
            {/* Whiskers */}
            <line x1={xToPx(min)} x2={xToPx(max)} y1={y} y2={y} stroke={c} strokeWidth="1" opacity="0.55" />
            <line x1={xToPx(min)} x2={xToPx(min)} y1={y - 4} y2={y + 4} stroke={c} strokeWidth="1.2" opacity="0.55" />
            <line x1={xToPx(max)} x2={xToPx(max)} y1={y - 4} y2={y + 4} stroke={c} strokeWidth="1.2" opacity="0.55" />
            {/* Box */}
            <rect x={xToPx(q1)} y={y - 7} width={xToPx(q3) - xToPx(q1)} height={14} fill={c} fillOpacity="0.32" stroke={c} strokeWidth="1.2" />
            {/* Median */}
            <line x1={xToPx(med)} x2={xToPx(med)} y1={y - 7} y2={y + 7} stroke={c} strokeWidth="2" />
            <title>{`${p.name}\nmin ${min.toFixed(1)} · q25 ${q1.toFixed(1)} · med ${med.toFixed(1)} · q75 ${q3.toFixed(1)} · max ${max.toFixed(1)} mph`}</title>
          </g>
        );
      })}
    </svg>
  );
}

// ----------------------------------------------------------------------------
// Pitch Location Heatmap (small multiples by pitch type)
// ----------------------------------------------------------------------------

function PitchLocationSection({ data }: { data: StatcastData }) {
  const { pitchLocation, pitchMix } = data;
  // Show top-6 by count for the panel grid (matches reference image layout).
  const codes = pitchMix.slice(0, 6).map(p => p.code).filter(c => pitchLocation.byType[c]);
  return (
    <section>
      <SectionHeader title="Pitch Location Density"
        subtitle="Where each pitch type is thrown, viewed from the catcher's perspective. Strike zone shown in outline." />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {codes.map(code => (
          <PitchLocationPanel key={code} code={code} entry={pitchLocation.byType[code]} loc={pitchLocation} />
        ))}
      </div>
    </section>
  );
}

function PitchLocationPanel({
  code,
  entry,
  loc,
}: {
  code: string;
  entry: PitchLocationGrid;
  loc: StatcastData['pitchLocation'];
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
  const cells: { x: number; y: number; v: number }[] = [];
  for (let zi = 0; zi < loc.zBins; zi++) {
    for (let xi = 0; xi < loc.xBins; xi++) {
      const v = entry.grid[zi][xi];
      const px = padL + xi * cellW;
      // zi=0 is z near zMin (bottom). Higher zi → higher z → smaller y.
      const py = padT + (loc.zBins - 1 - zi) * cellH;
      cells.push({ x: px, y: py, v });
    }
  }

  return (
    <div className="border border-border rounded-lg bg-card p-3">
      <div className="flex items-baseline justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: pitchColor(code) }} />
          <span className="text-[12px] font-medium">{entry.name}</span>
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums">{loc.byType[code].max ? `peak ${loc.byType[code].max}` : ''}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet">
        {/* Gridlines (subtle) */}
        {[-1, 0, 1].map(x => (
          <line key={x} x1={xToPx(x)} x2={xToPx(x)} y1={padT} y2={H - padB} stroke="hsl(var(--border))" strokeWidth="0.5" />
        ))}
        {[1, 2, 3, 4].map(z => (
          <line key={z} x1={padL} x2={W - padR} y1={zToPx(z)} y2={zToPx(z)} stroke="hsl(var(--border))" strokeWidth="0.5" />
        ))}
        {/* Density cells */}
        {cells.map((c, i) => c.v > 0 && (
          <rect key={i} x={c.x} y={c.y} width={cellW + 0.5} height={cellH + 0.5}
            fill={densityColor(c.v / Math.max(1, entry.max))} />
        ))}
        {/* Strike zone overlay */}
        <rect
          x={xToPx(loc.strikeZone.left)}
          y={zToPx(loc.strikeZone.top)}
          width={xToPx(loc.strikeZone.right) - xToPx(loc.strikeZone.left)}
          height={zToPx(loc.strikeZone.bottom) - zToPx(loc.strikeZone.top)}
          fill="none"
          stroke="hsl(var(--foreground))"
          strokeWidth="1.25"
          strokeOpacity="0.7"
        />
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

function RunValueSection({ data }: { data: StatcastData }) {
  const rv = data.battedBallRunValue;

  // Find magnitude for color scaling — robust max so a single outlier doesn't blow it out.
  const allValues: number[] = [];
  for (const row of rv.grid) for (const c of row) if (c.avg != null && c.count >= 3) allValues.push(c.avg);
  allValues.sort((a, b) => Math.abs(b) - Math.abs(a));
  const magnitude = allValues.length ? Math.max(0.5, allValues[Math.floor(allValues.length * 0.05)] ?? 1) : 1;

  return (
    <section>
      <SectionHeader title="Batted-Ball Run Value"
        subtitle="Average run value of every batted ball, by exit velocity and launch angle. Green = damage; red = outs. Linear weights (Tango)." />
      <div className="border border-border rounded-xl bg-card p-4 sm:p-6 overflow-x-auto">
        <RunValueHeatmap rv={rv} magnitude={Math.abs(magnitude)} />
        <Legend min={-0.5} max={0.9} steps={9} />
      </div>
    </section>
  );
}

function RunValueHeatmap({ rv, magnitude }: { rv: StatcastData['battedBallRunValue']; magnitude: number }) {
  const W = 760, H = 380;
  const padL = 56, padR = 16, padT = 16, padB = 38;
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

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet">
      {/* Cells */}
      {rv.grid.map((row, ai) =>
        row.map((c, si) => {
          if (c.avg == null || c.count < 2) return null;
          const x = padL + si * cellW;
          // ai=0 is the lowest angle bin (most negative). Higher ai → higher angle → smaller y.
          const y = padT + (rv.laBins - 1 - ai) * cellH;
          return (
            <rect key={`${ai}-${si}`} x={x} y={y} width={cellW + 0.5} height={cellH + 0.5}
              fill={divergingColor(c.avg, magnitude)}>
              <title>{`launch ${(rv.lsMin + (si + 0.5) * (rv.lsMax - rv.lsMin) / rv.lsBins).toFixed(0)} mph · ${(rv.laMin + (ai + 0.5) * (rv.laMax - rv.laMin) / rv.laBins).toFixed(0)}°\nrun value ${c.avg >= 0 ? '+' : ''}${c.avg.toFixed(2)} · n=${c.count}`}</title>
            </rect>
          );
        })
      )}
      {/* Reference lines: 0° launch angle, 90 mph */}
      <line x1={padL} x2={W - padR} y1={laToPx(0)} y2={laToPx(0)} stroke="hsl(var(--foreground))" strokeWidth="0.5" strokeOpacity="0.25" strokeDasharray="3 3" />
      <line x1={lsToPx(95)} x2={lsToPx(95)} y1={padT} y2={H - padB} stroke="hsl(var(--foreground))" strokeWidth="0.5" strokeOpacity="0.25" strokeDasharray="3 3" />
      {/* Outline */}
      <rect x={padL} y={padT} width={innerW} height={innerH} fill="none" stroke="hsl(var(--border))" strokeWidth="1" />
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
    </svg>
  );
}

function Legend({ min, max, steps }: { min: number; max: number; steps: number }) {
  const W = 280, H = 36;
  const padL = 8, padR = 8, padT = 4, padB = 16;
  const innerW = W - padL - padR;
  const cellW = innerW / steps;
  const stepValues = Array.from({ length: steps }, (_, i) => min + (i / (steps - 1)) * (max - min));
  const magnitude = Math.max(Math.abs(min), Math.abs(max));
  return (
    <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
      <span>run value →</span>
      <svg viewBox={`0 0 ${W} ${H}`} width="280" height="36">
        {stepValues.map((v, i) => (
          <rect key={i} x={padL + i * cellW} y={padT} width={cellW + 0.5} height={H - padT - padB} fill={divergingColor(v, magnitude)} stroke="hsl(var(--border))" strokeWidth="0.25" />
        ))}
        <text x={padL} y={H - 3} textAnchor="start" fontSize="9" fill="hsl(var(--muted-foreground))" className="tabular-nums">{min.toFixed(1)}</text>
        <text x={padL + innerW / 2} y={H - 3} textAnchor="middle" fontSize="9" fill="hsl(var(--muted-foreground))" className="tabular-nums">0</text>
        <text x={W - padR} y={H - 3} textAnchor="end" fontSize="9" fill="hsl(var(--muted-foreground))" className="tabular-nums">+{max.toFixed(1)}</text>
      </svg>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Generic section header
// ----------------------------------------------------------------------------

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}
