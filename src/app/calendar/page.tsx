'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fetchData } from '@/lib/data';

interface CalendarTeam {
  id: number;
  abbr: string | null;
  name: string;
}

interface CalendarGame {
  date: string;
  gamePk: number;
  away: CalendarTeam;
  home: CalendarTeam;
  awayScore: number | null;
  homeScore: number | null;
  status: string;
  detailedState: string;
  gameTimeISO: string | null;
  doubleHeader: string | null;
}

interface RosterEntry {
  name: string;
  slug: string;
  fantasyTeam: string;
  fantasyTeamId: number;
}

interface CalendarData {
  generatedAt: string;
  seasonStart: string;
  endDate: string;
  games: CalendarGame[];
  rosteredByTeam?: Record<string, RosterEntry[]>;
}

const todayYmd = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

function ymdToParts(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split('-').map(Number);
  return { y, m, d };
}

function partsToYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function startOfMonthDayOfWeek(y: number, m: number): number {
  // 0 = Sunday
  return new Date(y, m - 1, 1).getDay();
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function fmtTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function CalendarPage() {
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);

  // Default to today's month/year, but bound to the calendar's available range.
  const today = ymdToParts(todayYmd);
  const [year, setYear] = useState(today.y);
  const [month, setMonth] = useState(today.m); // 1-12
  const [selectedDate, setSelectedDate] = useState<string>(todayYmd);

  useEffect(() => {
    fetchData<CalendarData>('/api/calendar')
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  // Group games by date for fast cell rendering.
  const gamesByDate = useMemo(() => {
    const map = new Map<string, CalendarGame[]>();
    if (!data) return map;
    for (const g of data.games) {
      if (!map.has(g.date)) map.set(g.date, []);
      map.get(g.date)!.push(g);
    }
    // Sort each date's games by time.
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.gameTimeISO ?? '').localeCompare(b.gameTimeISO ?? ''));
    }
    return map;
  }, [data]);

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-48 bg-muted rounded animate-pulse" />
        <div className="h-72 bg-muted/50 rounded-lg animate-pulse" />
      </div>
    );
  }

  const seasonStartParts = ymdToParts(data.seasonStart);
  const endParts = ymdToParts(data.endDate);

  const canPrev = year > seasonStartParts.y || (year === seasonStartParts.y && month > seasonStartParts.m);
  const canNext = year < endParts.y || (year === endParts.y && month < endParts.m);

  const dim = daysInMonth(year, month);
  const startDow = startOfMonthDayOfWeek(year, month);
  // Build 6×7 grid (always 42 cells) so layout stays stable.
  const cells: ({ ymd: string; day: number; inMonth: boolean } | null)[] = [];
  // Leading days from previous month.
  const prevMonthDim = daysInMonth(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1);
  for (let i = startDow - 1; i >= 0; i--) {
    const day = prevMonthDim - i;
    const py = month === 1 ? year - 1 : year;
    const pm = month === 1 ? 12 : month - 1;
    cells.push({ ymd: partsToYmd(py, pm, day), day, inMonth: false });
  }
  for (let day = 1; day <= dim; day++) {
    cells.push({ ymd: partsToYmd(year, month, day), day, inMonth: true });
  }
  while (cells.length < 42) {
    const idx = cells.length - (startDow + dim);
    const day = idx + 1;
    const ny = month === 12 ? year + 1 : year;
    const nm = month === 12 ? 1 : month + 1;
    cells.push({ ymd: partsToYmd(ny, nm, day), day, inMonth: false });
  }

  const selectedGames = gamesByDate.get(selectedDate) ?? [];

  const goPrevMonth = () => {
    if (!canPrev) return;
    if (month === 1) { setYear(year - 1); setMonth(12); }
    else setMonth(month - 1);
  };
  const goNextMonth = () => {
    if (!canNext) return;
    if (month === 12) { setYear(year + 1); setMonth(1); }
    else setMonth(month + 1);
  };

  const handleSelect = (ymdStr: string, inMonth: boolean) => {
    setSelectedDate(ymdStr);
    if (!inMonth) {
      const parts = ymdToParts(ymdStr);
      setYear(parts.y);
      setMonth(parts.m);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Calendar</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {data.games.length.toLocaleString()} games · season start {data.seasonStart} · through {data.endDate}
        </p>
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={goPrevMonth}
          disabled={!canPrev}
          className="min-h-[36px] min-w-[36px] px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Previous month"
        >
          ←
        </button>
        <div className="flex items-center gap-2 flex-1 justify-center">
          <h2 className="text-sm font-medium tabular-nums">{MONTHS[month - 1]} {year}</h2>
          {(year !== today.y || month !== today.m || selectedDate !== todayYmd) && (
            <button
              onClick={() => { setYear(today.y); setMonth(today.m); setSelectedDate(todayYmd); }}
              className="min-h-[28px] px-2.5 py-1 text-[11px] rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
            >
              Today
            </button>
          )}
        </div>
        <button
          onClick={goNextMonth}
          disabled={!canNext}
          className="min-h-[36px] min-w-[36px] px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Next month"
        >
          →
        </button>
      </div>

      {/* Month grid */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="grid grid-cols-7 bg-muted/40 border-b border-border">
          {DOW.map((d, i) => (
            <div key={i} className="text-center text-[10px] font-medium text-muted-foreground py-1.5">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell, idx) => {
            if (!cell) return <div key={idx} className="aspect-square sm:aspect-auto sm:min-h-[72px] border-t border-l border-border/50" />;
            const games = gamesByDate.get(cell.ymd) ?? [];
            const isToday = cell.ymd === todayYmd;
            const isSelected = cell.ymd === selectedDate;
            const hasGames = games.length > 0;
            const allFinal = hasGames && games.every(g => g.status === 'F');
            return (
              <button
                key={idx}
                onClick={() => handleSelect(cell.ymd, cell.inMonth)}
                className={`relative aspect-square sm:aspect-auto sm:min-h-[72px] border-t border-l border-border/50 px-1.5 py-1 text-left transition-colors ${
                  !cell.inMonth ? 'bg-muted/10 text-muted-foreground/50' : ''
                } ${isSelected ? 'bg-primary/10 ring-1 ring-primary/40 ring-inset' : 'hover:bg-muted/30'}`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className={`text-[11px] tabular-nums ${isToday ? 'font-semibold text-primary' : ''}`}>
                    {cell.day}
                  </span>
                  {hasGames && (
                    <span className={`text-[9px] px-1 rounded tabular-nums ${
                      allFinal ? 'bg-muted text-muted-foreground' : 'bg-primary/15 text-primary font-medium'
                    }`}>
                      {games.length}
                    </span>
                  )}
                </div>
                {/* show up to 2 game thumbnails on larger cells */}
                <div className="hidden sm:block mt-1 space-y-0.5">
                  {games.slice(0, 2).map(g => (
                    <div key={g.gamePk} className="text-[9px] text-muted-foreground truncate tabular-nums">
                      {g.away.abbr ?? '???'} @ {g.home.abbr ?? '???'}
                      {g.status === 'F' && g.awayScore != null && g.homeScore != null && (
                        <span className="ml-1 font-medium text-foreground">{g.awayScore}-{g.homeScore}</span>
                      )}
                    </div>
                  ))}
                  {games.length > 2 && (
                    <div className="text-[9px] text-muted-foreground/60">+{games.length - 2} more</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day details */}
      <div>
        <h2 className="text-sm font-medium mb-3 tabular-nums">
          {selectedDate}
          {selectedDate === todayYmd && (
            <span className="ml-2 text-[10px] uppercase tracking-wide text-primary">Today</span>
          )}
          <span className="ml-2 text-xs text-muted-foreground font-normal">
            {selectedGames.length} game{selectedGames.length === 1 ? '' : 's'}
          </span>
        </h2>
        {selectedGames.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 px-3 border border-dashed border-border rounded-lg">
            No games scheduled.
          </div>
        ) : (
          <div className="space-y-2">
            {selectedGames.map(g => {
              const awayRoster = (data.rosteredByTeam?.[g.away.abbr ?? ''] ?? []);
              const homeRoster = (data.rosteredByTeam?.[g.home.abbr ?? ''] ?? []);
              return (
              <div
                key={g.gamePk}
                className="border border-border rounded-lg hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm tabular-nums">
                      <span className="font-medium">{g.away.abbr ?? g.away.name}</span>
                      {g.away.name && g.away.abbr && <span className="text-muted-foreground/60 text-xs"> {g.away.name}</span>}
                      <span className="mx-2 text-muted-foreground/60">@</span>
                      <span className="font-medium">{g.home.abbr ?? g.home.name}</span>
                      {g.home.name && g.home.abbr && <span className="text-muted-foreground/60 text-xs"> {g.home.name}</span>}
                    </div>
                    {g.doubleHeader && (
                      <div className="text-[10px] uppercase text-muted-foreground tracking-wide mt-0.5">Doubleheader</div>
                    )}
                  </div>
                  <div className="text-right whitespace-nowrap">
                    {g.status === 'F' && g.awayScore != null && g.homeScore != null ? (
                      <div>
                        <div className="text-sm tabular-nums font-semibold">{g.awayScore} – {g.homeScore}</div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{g.detailedState}</div>
                      </div>
                    ) : g.status === 'I' ? (
                      <div>
                        <div className="text-sm tabular-nums font-semibold">
                          {g.awayScore ?? 0} – {g.homeScore ?? 0}
                        </div>
                        <div className="text-[10px] uppercase tracking-wide text-amber-500">{g.detailedState}</div>
                      </div>
                    ) : (
                      <div>
                        <div className="text-xs text-muted-foreground tabular-nums">{fmtTime(g.gameTimeISO)}</div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{g.detailedState}</div>
                      </div>
                    )}
                  </div>
                </div>
                {(awayRoster.length > 0 || homeRoster.length > 0) && (
                  <div className="border-t border-border/60 px-3 py-2 bg-muted/15">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 gap-x-4">
                      {[
                        { side: g.away.abbr ?? '???', roster: awayRoster },
                        { side: g.home.abbr ?? '???', roster: homeRoster },
                      ].map(({ side, roster }) => (
                        <div key={side} className="min-w-0">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 tabular-nums">{side}</div>
                          {roster.length === 0 ? (
                            <div className="text-[11px] text-muted-foreground/50">No drafted players</div>
                          ) : (
                            <ul className="space-y-0.5">
                              {roster.map(r => (
                                <li key={r.slug} className="flex items-baseline justify-between gap-2 text-[11px]">
                                  <Link href={`/players/${r.slug}`} className="font-medium hover:text-primary transition-colors truncate">
                                    {r.name}
                                  </Link>
                                  <Link
                                    href={`/teams/${r.fantasyTeamId}`}
                                    className="text-muted-foreground hover:text-primary transition-colors whitespace-nowrap shrink-0"
                                  >
                                    {r.fantasyTeam}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
