const BASE_URL = 'https://statsapi.mlb.com';

export interface ScheduleGame {
  gamePk: number;
  officialDate: string;
  status: { statusCode: string; detailedState: string };
  teams: {
    away: { team: { id: number; name: string } };
    home: { team: { id: number; name: string } };
  };
}

export interface BattingStats {
  atBats: number;
  hits: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  totalBases: number;
  stolenBases: number;
  baseOnBalls: number;
  hitByPitch: number;
  runs: number;
  rbi: number;
  strikeOuts: number;
  plateAppearances: number;
  sacBunts: number;
  sacFlies: number;
  groundIntoDoublePlay: number;
  groundIntoTriplePlay: number;
  leftOnBase: number;
  groundOuts: number;
  flyOuts: number;
  lineOuts: number;
  popOuts: number;
  airOuts: number;
  catchersInterference: number;
  caughtStealing: number;
  intentionalWalks: number;
  pickoffs: number;
}

export interface BoxscorePlayer {
  person: { id: number; fullName: string };
  stats: { batting?: BattingStats };
  position: { abbreviation: string };
}

export async function getSchedule(date: string): Promise<ScheduleGame[]> {
  const url = `${BASE_URL}/api/v1/schedule?sportId=1&date=${date}&hydrate=team`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Schedule API failed: ${res.status}`);
  const data = await res.json();
  const games: ScheduleGame[] = [];
  for (const dateEntry of data.dates || []) {
    for (const game of dateEntry.games || []) {
      games.push(game);
    }
  }
  return games;
}

export async function getBoxscoreBatting(gamePk: number): Promise<Map<number, BattingStats>> {
  const url = `${BASE_URL}/api/v1.1/game/${gamePk}/feed/live`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Boxscore API failed for game ${gamePk}: ${res.status}`);
  const data = await res.json();
  const playerStats = new Map<number, BattingStats>();
  const boxscore = data.liveData?.boxscore;
  if (!boxscore) return playerStats;

  for (const side of ['away', 'home'] as const) {
    const teamPlayers = boxscore.teams[side]?.players || {};
    for (const [, playerData] of Object.entries(teamPlayers)) {
      const p = playerData as BoxscorePlayer;
      const batting = p.stats?.batting;
      if (batting && (batting.atBats > 0 || batting.baseOnBalls > 0 || batting.hitByPitch > 0)) {
        playerStats.set(p.person.id, {
          atBats: batting.atBats || 0,
          hits: batting.hits || 0,
          doubles: batting.doubles || 0,
          triples: batting.triples || 0,
          homeRuns: batting.homeRuns || 0,
          totalBases: batting.totalBases || 0,
          stolenBases: batting.stolenBases || 0,
          baseOnBalls: batting.baseOnBalls || 0,
          hitByPitch: batting.hitByPitch || 0,
          runs: batting.runs || 0,
          rbi: batting.rbi || 0,
          strikeOuts: batting.strikeOuts || 0,
          plateAppearances: batting.plateAppearances || 0,
          sacBunts: batting.sacBunts || 0,
          sacFlies: batting.sacFlies || 0,
          groundIntoDoublePlay: batting.groundIntoDoublePlay || 0,
          groundIntoTriplePlay: batting.groundIntoTriplePlay || 0,
          leftOnBase: batting.leftOnBase || 0,
          groundOuts: batting.groundOuts || 0,
          flyOuts: batting.flyOuts || 0,
          lineOuts: batting.lineOuts || 0,
          popOuts: batting.popOuts || 0,
          airOuts: batting.airOuts || 0,
          catchersInterference: batting.catchersInterference || 0,
          caughtStealing: batting.caughtStealing || 0,
          intentionalWalks: batting.intentionalWalks || 0,
          pickoffs: batting.pickoffs || 0,
        });
      }
    }
  }
  return playerStats;
}

export async function searchPlayer(name: string): Promise<{ id: number; fullName: string; team: string } | null> {
  const url = `${BASE_URL}/api/v1/sports/1/players?season=2026&search=${encodeURIComponent(name)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const people = data.people || [];
  if (people.length === 0) return null;
  return {
    id: people[0].id,
    fullName: people[0].fullName,
    team: people[0].currentTeam?.abbreviation || 'N/A',
  };
}
