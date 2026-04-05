export interface PlayerPeriodScore {
  playerId: number;
  playerName: string;
  totalScore: number;
  gamesPlayed: number;
  totalBases: number;
  stolenBases: number;
  walks: number;
  hbp: number;
}

export interface TeamPeriodResult {
  teamId: number;
  teamName: string;
  bestBallScore: number;
  allPlayerScores: PlayerPeriodScore[];
  countingPlayers: number[];
  benchPlayers: number[];
}

/**
 * Best ball: top 10 of 13 players by cumulative period score.
 */
export function computeBestBall(playerScores: PlayerPeriodScore[]): {
  bestBallScore: number;
  countingPlayerIds: number[];
  benchPlayerIds: number[];
} {
  const sorted = [...playerScores].sort((a, b) => b.totalScore - a.totalScore);
  const counting = sorted.slice(0, 10);
  const bench = sorted.slice(10);

  return {
    bestBallScore: counting.reduce((sum, p) => sum + p.totalScore, 0),
    countingPlayerIds: counting.map(p => p.playerId),
    benchPlayerIds: bench.map(p => p.playerId),
  };
}

/**
 * Fantasy score = Total Bases + Stolen Bases + Walks + HBP
 */
export function calcFantasyScore(
  totalBases: number,
  stolenBases: number,
  walks: number,
  hbp: number
): number {
  return totalBases + stolenBases + walks + hbp;
}
