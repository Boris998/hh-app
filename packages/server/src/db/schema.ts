// packages/server/src/db/schema.ts
import { relations } from 'drizzle-orm';
import { 
  integer, 
  pgTable, 
  primaryKey, 
  text, 
  timestamp, 
  unique,
  serial,
  boolean
} from 'drizzle-orm/pg-core';
import { generateNanoId } from '../utils/security.js';

export const teams = pgTable('teams', {
  id: serial('id').primaryKey(),
  publicId: text('public_id')
    .$defaultFn(() => generateNanoId())
    .notNull()
    .unique(),
  name: text('name').notNull(),
  logoUrl: text('logo_url'),
  createdAt: timestamp('created_at')
    .defaultNow()
    .notNull(),
});

export const players = pgTable('players', {
  id: serial('id').primaryKey(),
  publicId: text('public_id')
    .$defaultFn(() => generateNanoId())
    .notNull()
    .unique(),
  name: text('name').notNull(),
  position: text('position'),
  teamId: integer('team_id').references(() => teams.id),
  createdAt: timestamp('created_at')
    .defaultNow()
    .notNull(),
});

export const tournaments = pgTable('tournaments', {
  id: serial('id').primaryKey(),
  publicId: text('public_id')
    .$defaultFn(() => generateNanoId())
    .notNull()
    .unique(),
  name: text('name').notNull(),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  createdAt: timestamp('created_at')
    .defaultNow()
    .notNull(),
});

export const matches = pgTable('matches', {
  id: serial('id').primaryKey(),
  publicId: text('public_id')
    .$defaultFn(() => generateNanoId())
    .notNull()
    .unique(),
  tournamentId: integer('tournament_id').references(() => tournaments.id),
  homeTeamId: integer('home_team_id').references(() => teams.id),
  awayTeamId: integer('away_team_id').references(() => teams.id),
  date: timestamp('date').notNull(),
  location: text('location'),
  status: text('status', { enum: ['SCHEDULED', 'LIVE', 'COMPLETED'] }).default('SCHEDULED'),
  createdAt: timestamp('created_at')
    .defaultNow()
    .notNull(),
});

export const playerStats = pgTable('player_stats', {
  id: serial('id').primaryKey(),
  matchId: integer('match_id').references(() => matches.id),
  playerId: integer('player_id').references(() => players.id),
  goals: integer('goals').default(0),
  assists: integer('assists').default(0),
  minutesPlayed: integer('minutes_played').default(0),
  createdAt: timestamp('created_at')
    .defaultNow()
    .notNull(),
});

// Relations (same as SQLite version)
export const teamRelations = relations(teams, ({ many }) => ({
  players: many(players),
  homeMatches: many(matches, { relationName: 'home_team' }),
  awayMatches: many(matches, { relationName: 'away_team' }),
}));

export const playerRelations = relations(players, ({ one, many }) => ({
  team: one(teams, {
    fields: [players.teamId],
    references: [teams.id],
  }),
  stats: many(playerStats),
}));

export const tournamentRelations = relations(tournaments, ({ many }) => ({
  matches: many(matches),
}));

export const matchRelations = relations(matches, ({ one, many }) => ({
  tournament: one(tournaments, {
    fields: [matches.tournamentId],
    references: [tournaments.id],
  }),
  homeTeam: one(teams, {
    fields: [matches.homeTeamId],
    references: [teams.id],
    relationName: 'home_team',
  }),
  awayTeam: one(teams, {
    fields: [matches.awayTeamId],
    references: [teams.id],
    relationName: 'away_team',
  }),
  stats: many(playerStats),
}));

export const playerStatsRelations = relations(playerStats, ({ one }) => ({
  match: one(matches, {
    fields: [playerStats.matchId],
    references: [matches.id],
  }),
  player: one(players, {
    fields: [playerStats.playerId],
    references: [players.id],
  }),
}));