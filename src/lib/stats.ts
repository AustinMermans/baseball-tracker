export interface GameLine {
  gameDate: string;
  hits: number;
  atBats: number;
}

export function avg(hits: number, atBats: number): number {
  return atBats === 0 ? 0 : hits / atBats;
}

export function obp(hits: number, walks: number, hbp: number, atBats: number, sacFlies: number): number {
  const denom = atBats + walks + hbp + sacFlies;
  return denom === 0 ? 0 : (hits + walks + hbp) / denom;
}

export function slg(totalBases: number, atBats: number): number {
  return atBats === 0 ? 0 : totalBases / atBats;
}

export function singles(hits: number, doubles: number, triples: number, homeRuns: number): number {
  return hits - doubles - triples - homeRuns;
}

export function fmtRate(value: number): string {
  if (value === 0) return '.000';
  const s = value.toFixed(3);
  return s.startsWith('0') ? s.slice(1) : s;
}

export function cumulativeAvg(games: GameLine[]): { date: string; value: number }[] {
  let totalH = 0;
  let totalAB = 0;
  return games.map(g => {
    totalH += g.hits;
    totalAB += g.atBats;
    return { date: g.gameDate, value: totalAB === 0 ? 0 : totalH / totalAB };
  });
}

export function rollingAvg(games: GameLine[], windowDays: number): { date: string; value: number }[] {
  return games.map((g, i) => {
    const cutoff = new Date(g.gameDate);
    cutoff.setDate(cutoff.getDate() - windowDays);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    let h = 0;
    let ab = 0;
    for (let j = i; j >= 0; j--) {
      if (games[j].gameDate < cutoffStr) break;
      h += games[j].hits;
      ab += games[j].atBats;
    }
    return { date: g.gameDate, value: ab === 0 ? 0 : h / ab };
  });
}

export function gameByGameAvg(games: GameLine[]): { date: string; value: number }[] {
  return games.map(g => ({
    date: g.gameDate,
    value: g.atBats === 0 ? 0 : g.hits / g.atBats,
  }));
}
