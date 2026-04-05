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
