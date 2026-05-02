'use client';

import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

interface RankingEntry {
  id: number;
  name: string;
  weeks: Array<{ week: string; score: number; rank: number }>;
}

interface BumpChartProps {
  entries: RankingEntry[];
  weeks: string[];
  maxRank: number;
  title: string;
  subtitle?: string;
}

const COLORS = [
  'hsl(var(--chart-1, 220 70% 50%))',
  'hsl(var(--chart-2, 160 60% 45%))',
  'hsl(var(--chart-3, 30 80% 55%))',
  'hsl(var(--chart-4, 280 65% 60%))',
  'hsl(var(--chart-5, 340 75% 55%))',
  'hsl(0 70% 50%)',
  'hsl(45 80% 45%)',
  'hsl(190 70% 50%)',
  'hsl(100 50% 45%)',
  'hsl(260 50% 55%)',
];

function BumpTooltip({ active, payload, label, maxRank }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string; payload: Record<string, string | number> }>;
  label?: string;
  maxRank?: number;
}) {
  if (!active || !payload?.length) return null;

  // Only show entries that are within the visible ranking range
  const visible = payload.filter(item => item.value <= (maxRank || 10));
  if (!visible.length) return null;

  const sorted = [...visible].sort((a, b) => (a.value as number) - (b.value as number));

  return (
    <div
      className="rounded-md border border-border bg-card px-3 py-2 shadow-md"
      style={{ fontSize: '12px' }}
    >
      <p className="text-xs font-medium text-foreground mb-1.5">{label}</p>
      {sorted.map(item => {
        const score = item.payload[`${item.name}_score`];
        return (
          <div key={item.name} className="flex items-center gap-2 py-0.5">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
            <span className="text-muted-foreground min-w-[3ch] text-right">#{item.value}</span>
            <span className="text-foreground">{item.name}</span>
            <span className="text-muted-foreground ml-auto pl-2">{score} pts</span>
          </div>
        );
      })}
    </div>
  );
}

// Custom dot that hides when rank is off-chart
function RankDot({ cx, cy, value, maxRank, color }: {
  cx?: number; cy?: number; value?: number; maxRank: number; color: string;
}) {
  if (cx == null || cy == null || !value || value > maxRank) return null;
  return (
    <circle cx={cx} cy={cy} r={5} fill={color} stroke="hsl(var(--background))" strokeWidth={2} />
  );
}

export function BumpChart({ entries, weeks, maxRank, title, subtitle }: BumpChartProps) {
  // Transform data: one object per week with each entry's rank as a field
  const chartData = weeks.map(week => {
    const point: Record<string, string | number> = { week };
    for (const entry of entries) {
      const weekData = entry.weeks.find(w => w.week === week);
      if (weekData) {
        point[entry.name] = weekData.rank;
        point[`${entry.name}_score`] = weekData.score;
      }
    }
    return point;
  });

  return (
    <div>
      <h2 className="text-sm font-medium">{title}</h2>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5 mb-3">{subtitle}</p>}
      <div className="border border-border rounded-lg p-3 sm:p-4 mt-3">
        <ResponsiveContainer width="100%" height={Math.max(280, maxRank * 40)}>
          <LineChart data={chartData} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="week"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              padding={{ left: 8, right: 8 }}
            />
            <YAxis
              reversed
              // Pad the domain by 0.5 on each side so dots at rank 1 and rank
              // maxRank get visual breathing room and don't clip on the chart
              // edge. allowDataOverflow stays off since the data is now safely
              // inside the domain.
              domain={[0.5, maxRank + 0.5]}
              ticks={Array.from({ length: maxRank }, (_, i) => i + 1)}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              width={22}
            />
            <Tooltip
              content={<BumpTooltip maxRank={maxRank} />}
              cursor={false}
            />
            {entries.map((entry, i) => (
              <Line
                key={entry.id}
                type="bump"
                dataKey={entry.name}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2.5}
                dot={<RankDot maxRank={maxRank} color={COLORS[i % COLORS.length]} />}
                activeDot={<RankDot maxRank={maxRank} color={COLORS[i % COLORS.length]} />}
                name={entry.name}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 px-1">
          {entries.map((entry, i) => (
            <div key={entry.id} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="text-xs text-muted-foreground">{entry.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
