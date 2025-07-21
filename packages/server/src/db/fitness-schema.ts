import { pgTable, uuid, varchar, integer, timestamp, decimal, boolean, index } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  eloRating: integer('elo_rating').default(1200),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
})

export const matches = pgTable('matches', {
  id: uuid('id').defaultRandom().primaryKey(),
  player1Id: uuid('player1_id').references(() => users.id),
  player2Id: uuid('player2_id').references(() => users.id),
  sport: varchar('sport', { length: 50 }).notNull(),
  winnerId: uuid('winner_id').references(() => users.id),
  player1EloChange: integer('player1_elo_change'),
  player2EloChange: integer('player2_elo_change'),
  status: varchar('status', { length: 20 }).default('pending'),
  createdAt: timestamp('created_at').defaultNow()
})

// Add indexes
export const userEmailIdx = index('user_email_idx').on(users.email)
export const matchPlayerIdx = index('match_player_idx').on(matches.player1Id, matches.player2Id)