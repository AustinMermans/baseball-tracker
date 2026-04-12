import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const teams = sqliteTable('teams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  owner: text('owner').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const players = sqliteTable('players', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  mlbId: integer('mlb_id').notNull().unique(),
  name: text('name').notNull(),
  mlbTeam: text('mlb_team'),
  position: text('position'),
  teamId: integer('team_id').references(() => teams.id),
  draftRound: integer('draft_round'),
  isActive: integer('is_active').default(1),
});

export const dailyStats = sqliteTable('daily_stats', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  playerId: integer('player_id').references(() => players.id).notNull(),
  gameDate: text('game_date').notNull(),
  gamePk: integer('game_pk'),
  totalBases: integer('total_bases').default(0),
  stolenBases: integer('stolen_bases').default(0),
  walks: integer('walks').default(0),
  hbp: integer('hbp').default(0),
  fantasyScore: integer('fantasy_score').default(0),
  atBats: integer('at_bats').default(0),
  hits: integer('hits').default(0),
  doubles: integer('doubles').default(0),
  triples: integer('triples').default(0),
  homeRuns: integer('home_runs').default(0),
  plateAppearances: integer('plate_appearances').default(0),
  runs: integer('runs').default(0),
  rbi: integer('rbi').default(0),
  strikeouts: integer('strikeouts').default(0),
  sacBunts: integer('sac_bunts').default(0),
  sacFlies: integer('sac_flies').default(0),
  groundIntoDoublePlay: integer('ground_into_double_play').default(0),
  groundIntoTriplePlay: integer('ground_into_triple_play').default(0),
  leftOnBase: integer('left_on_base').default(0),
  groundOuts: integer('ground_outs').default(0),
  flyOuts: integer('fly_outs').default(0),
  lineOuts: integer('line_outs').default(0),
  popOuts: integer('pop_outs').default(0),
  airOuts: integer('air_outs').default(0),
  catchersInterference: integer('catchers_interference').default(0),
  caughtStealing: integer('caught_stealing').default(0),
  intentionalWalks: integer('intentional_walks').default(0),
  pickoffs: integer('pickoffs').default(0),
}, (table) => ({
  playerDateIdx: uniqueIndex('player_date_idx').on(table.playerId, table.gameDate),
}));

export const teamDailyScores = sqliteTable('team_daily_scores', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  teamId: integer('team_id').references(() => teams.id).notNull(),
  gameDate: text('game_date').notNull(),
  totalScore: integer('total_score').notNull().default(0),
}, (table) => ({
  teamDateIdx: uniqueIndex('team_date_idx').on(table.teamId, table.gameDate),
}));

export const seasonPeriods = sqliteTable('season_periods', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  redraftDate: text('redraft_date'),
});

export const redraftLog = sqliteTable('redraft_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  periodId: integer('period_id').references(() => seasonPeriods.id),
  teamId: integer('team_id').references(() => teams.id),
  playerDropped: integer('player_dropped').references(() => players.id),
  playerAdded: integer('player_added').references(() => players.id),
  pickOrder: integer('pick_order'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export type Team = typeof teams.$inferSelect;
export type Player = typeof players.$inferSelect;
export type DailyStat = typeof dailyStats.$inferSelect;
export type TeamDailyScore = typeof teamDailyScores.$inferSelect;
export type SeasonPeriod = typeof seasonPeriods.$inferSelect;
