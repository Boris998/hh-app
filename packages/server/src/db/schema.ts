// packages/server/src/db/schema.ts
import { relations } from 'drizzle-orm';
import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  pgEnum,
  uuid,
  jsonb,
} from 'drizzle-orm/pg-core';

// Enums
export const userRoleEnum = pgEnum('user_role', ['admin', 'organizer', 'player']);
export const tournamentStatusEnum = pgEnum('tournament_status', ['draft', 'upcoming', 'ongoing', 'completed', 'cancelled']);
export const matchStatusEnum = pgEnum('match_status', ['scheduled', 'ongoing', 'completed', 'cancelled']);

// Users table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  publicId: uuid('public_id').defaultRandom().notNull().unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  role: userRoleEnum('role').default('player').notNull(),
  isEmailVerified: boolean('is_email_verified').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Teams table
export const teams = pgTable('teams', {
  id: serial('id').primaryKey(),
  publicId: uuid('public_id').defaultRandom().notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  logoUrl: varchar('logo_url', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Players table
export const players = pgTable('players', {
  id: serial('id').primaryKey(),
  publicId: uuid('public_id').defaultRandom().notNull().unique(),
  userId: integer('user_id').references(() => users.id).notNull(),
  teamId: integer('team_id').references(() => teams.id),
  position: varchar('position', { length: 50 }),
  jerseyNumber: integer('jersey_number'),
  stats: jsonb('stats'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Tournaments table
export const tournaments = pgTable('tournaments', {
  id: serial('id').primaryKey(),
  publicId: uuid('public_id').defaultRandom().notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  location: varchar('location', { length: 200 }),
  maxTeams: integer('max_teams').notNull(),
  entryFee: integer('entry_fee'), // in cents
  prizePool: integer('prize_pool'), // in cents
  status: tournamentStatusEnum('status').default('draft').notNull(),
  organizerId: integer('organizer_id').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Matches table
export const matches = pgTable('matches', {
  id: serial('id').primaryKey(),
  publicId: uuid('public_id').defaultRandom().notNull().unique(),
  tournamentId: integer('tournament_id').references(() => tournaments.id).notNull(),
  homeTeamId: integer('home_team_id').references(() => teams.id).notNull(),
  awayTeamId: integer('away_team_id').references(() => teams.id).notNull(),
  scheduledAt: timestamp('scheduled_at').notNull(),
  homeScore: integer('home_score'),
  awayScore: integer('away_score'),
  status: matchStatusEnum('status').default('scheduled').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Chat Rooms table
export const chatRooms = pgTable('chat_rooms', {
  id: serial('id').primaryKey(),
  publicId: uuid('public_id').defaultRandom().notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  isPrivate: boolean('is_private').default(false).notNull(),
  createdById: integer('created_by_id').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Room Members table
export const roomMembers = pgTable('room_members', {
  id: serial('id').primaryKey(),
  roomId: integer('room_id').references(() => chatRooms.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
  isAdmin: boolean('is_admin').default(false).notNull(),
});

// Messages table
export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  publicId: uuid('public_id').defaultRandom().notNull().unique(),
  roomId: integer('room_id').references(() => chatRooms.id).notNull(),
  senderId: integer('sender_id').references(() => users.id).notNull(),
  content: text('content').notNull(),
  messageType: varchar('message_type', { length: 50 }).default('text').notNull(), // text, image, file, etc.
  metadata: jsonb('metadata'), // for storing additional data like file info
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  players: many(players),
  organizedTournaments: many(tournaments),
  createdChatRooms: many(chatRooms),
  roomMemberships: many(roomMembers),
  messages: many(messages),
}));

export const teamsRelations = relations(teams, ({ many }) => ({
  players: many(players),
  homeMatches: many(matches, { relationName: 'homeTeam' }),
  awayMatches: many(matches, { relationName: 'awayTeam' }),
}));

export const playersRelations = relations(players, ({ one }) => ({
  user: one(users, {
    fields: [players.userId],
    references: [users.id],
  }),
  team: one(teams, {
    fields: [players.teamId],
    references: [teams.id],
  }),
}));

export const tournamentsRelations = relations(tournaments, ({ one, many }) => ({
  organizer: one(users, {
    fields: [tournaments.organizerId],
    references: [users.id],
  }),
  matches: many(matches),
}));

export const matchesRelations = relations(matches, ({ one }) => ({
  tournament: one(tournaments, {
    fields: [matches.tournamentId],
    references: [tournaments.id],
  }),
  homeTeam: one(teams, {
    fields: [matches.homeTeamId],
    references: [teams.id],
    relationName: 'homeTeam',
  }),
  awayTeam: one(teams, {
    fields: [matches.awayTeamId],
    references: [teams.id],
    relationName: 'awayTeam',
  }),
}));

export const chatRoomsRelations = relations(chatRooms, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [chatRooms.createdById],
    references: [users.id],
  }),
  members: many(roomMembers),
  messages: many(messages),
}));

export const roomMembersRelations = relations(roomMembers, ({ one }) => ({
  room: one(chatRooms, {
    fields: [roomMembers.roomId],
    references: [chatRooms.id],
  }),
  user: one(users, {
    fields: [roomMembers.userId],
    references: [users.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  room: one(chatRooms, {
    fields: [messages.roomId],
    references: [chatRooms.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
}));