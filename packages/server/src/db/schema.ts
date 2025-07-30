import { relations } from 'drizzle-orm';
import {
  pgTable,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  pgEnum,
  uuid,
  jsonb,
  unique
} from 'drizzle-orm/pg-core';

// Enums
export const userRoleEnum = pgEnum('user_role', ['admin', 'user', 'moderator']);
export const connectionStatusEnum = pgEnum('connection_status', ['pending', 'accepted', 'rejected']);
export const participantStatusEnum = pgEnum('participant_status', ['pending', 'accepted', 'declined']);
export const skillTypeEnum = pgEnum('skill_type', ['physical', 'technical', 'mental', 'tactical']);

// NEW: Activity category enum
export const activityCategoryEnum = pgEnum('activity_category', [
  'team_sports', 
  'individual_sports', 
  'fitness', 
  'mind_body', 
  'combat_sports',
  'outdoor_activities'
]);

// Tables
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  publicId: uuid('public_id').defaultRandom().notNull().unique(),
  username: varchar('username', { length: 50 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  role: userRoleEnum('role').default('user').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// NEW: ActivityTypes table
export const activityTypes = pgTable('activity_types', {
  id: uuid('id').defaultRandom().primaryKey(),
  publicId: uuid('public_id').defaultRandom().notNull().unique(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  description: text('description'),
  category: activityCategoryEnum('category').notNull(),
  isSoloPerformable: boolean('is_solo_performable').default(false).notNull(),
  
  // JSON fields for flexible configuration
  skillCategories: jsonb('skill_categories').notNull().default('[]'),
  defaultELOSettings: jsonb('default_elo_settings').notNull().default('{}'),
  
  // Metadata
  isActive: boolean('is_active').default(true).notNull(),
  displayOrder: integer('display_order').default(0),
  iconUrl: varchar('icon_url', { length: 500 }),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Updated activities table
export const activities = pgTable('activities', {
  id: uuid('id').defaultRandom().primaryKey(),
  publicId: uuid('public_id').defaultRandom().notNull().unique(),
  activityTypeId: uuid('activity_type_id').references(() => activityTypes.id, { onDelete: 'restrict' }).notNull(),
  creatorId: uuid('creator_id').references(() => users.id).notNull(),
  description: text('description'),
  location: varchar('location', { length: 200 }),
  dateTime: timestamp('date_time').notNull(),
  
  // NEW: Enhanced fields
  maxParticipants: integer('max_participants'),
  eloLevel: integer('elo_level'),
  skillRequirements: jsonb('skill_requirements').default('{}'),
  isELORated: boolean('is_elo_rated').default(true).notNull(),
  completionStatus: varchar('completion_status', { length: 20 }).default('scheduled').notNull(),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const activityParticipants = pgTable('activity_participants', {
  id: uuid('id').defaultRandom().primaryKey(),
  activityId: uuid('activity_id').references(() => activities.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  status: participantStatusEnum('status').default('pending').notNull(),
  
  // NEW: Enhanced fields for team activities
  team: varchar('team', { length: 50 }),
  finalResult: varchar('final_result', { length: 20 }),
  performanceNotes: text('performance_notes'),
  
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
});

export const skillDefinitions = pgTable('skill_definitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  publicId: uuid('public_id').defaultRandom().notNull().unique(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  skillType: skillTypeEnum('skill_type').notNull(), // physical/technical/mental/tactical
  isGeneral: boolean('is_general').default(false).notNull(),
  description: text('description'),
  ratingScaleMin: integer('rating_scale_min').default(1),
  ratingScaleMax: integer('rating_scale_max').default(10),
  category: varchar('category', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const activityTypeSkills = pgTable('activity_type_skills', {
  id: uuid('id').defaultRandom().primaryKey(),
  activityTypeId: uuid('activity_type_id').references(() => activityTypes.id).notNull(),
  skillDefinitionId: uuid('skill_definition_id').references(() => skillDefinitions.id).notNull(),
  isSpecificToActivityType: boolean('is_specific_to_activity_type').default(false),
  weight: integer('weight').default(100), // 0-100 importance percentage
  displayOrder: integer('display_order').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  unique: unique().on(table.activityTypeId, table.skillDefinitionId),
}));

export const userConnections = pgTable('user_connections', {
  id: uuid('id').defaultRandom().primaryKey(),
  user1Id: uuid('user1_id').references(() => users.id).notNull(),
  user2Id: uuid('user2_id').references(() => users.id).notNull(),
  status: connectionStatusEnum('status').default('pending').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userActivityTypeELOs = pgTable('user_activity_type_elos', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  activityTypeId: uuid('activity_type_id').references(() => activityTypes.id).notNull(),
  eloScore: integer('elo_score').default(1200).notNull(),
  gamesPlayed: integer('games_played').default(0),
  peakELO: integer('peak_elo').default(1200),
  volatility: integer('volatility').default(300), // stored as integer (3.00 * 100)
  lastUpdated: timestamp('last_updated').defaultNow().notNull(),
  version: integer('version').default(1), // optimistic locking
}, (table) => ({
  unique: unique().on(table.userId, table.activityTypeId),
}));

export const activityELOStatus = pgTable('activity_elo_status', {
  activityId: uuid('activity_id').references(() => activities.id).primaryKey(),
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  lockedBy: varchar('locked_by', { length: 100 }),
  lockedAt: timestamp('locked_at'),
  completedAt: timestamp('completed_at'),
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').default(0),
});

export const userActivitySkillRatings = pgTable('user_activity_skill_ratings', {
  id: uuid('id').defaultRandom().primaryKey(),
  activityId: uuid('activity_id').references(() => activities.id).notNull(),
  ratedUserId: uuid('rated_user_id').references(() => users.id).notNull(),
  ratingUserId: uuid('rating_user_id').references(() => users.id).notNull(),
  skillDefinitionId: uuid('skill_definition_id').references(() => skillDefinitions.id).notNull(),
  ratingValue: integer('rating_value').notNull(), // 1-10
  confidence: integer('confidence').default(5), // 1-5
  comment: text('comment'),
  isAnonymous: boolean('is_anonymous').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  unique: unique().on(table.activityId, table.ratedUserId, table.ratingUserId, table.skillDefinitionId),
}));

export const userActivityTypeSkillSummaries = pgTable('user_activity_type_skill_summaries', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  activityTypeId: uuid('activity_type_id').references(() => activityTypes.id).notNull(),
  skillDefinitionId: uuid('skill_definition_id').references(() => skillDefinitions.id).notNull(),
  averageRating: integer('average_rating'), // stored as integer (7.50 * 100 = 750)
  totalRatings: integer('total_ratings').default(0),
  lastCalculatedAt: timestamp('last_calculated_at').defaultNow(),
  trend: varchar('trend', { length: 20 }).default('stable'),
}, (table) => ({
  unique: unique().on(table.userId, table.activityTypeId, table.skillDefinitionId),
}));

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  createdActivities: many(activities),
  activityParticipants: many(activityParticipants),
}));

export const activityTypesRelations = relations(activityTypes, ({ many }) => ({
  activities: many(activities),
}));

export const activitiesRelations = relations(activities, ({ one, many }) => ({
  activityType: one(activityTypes, {
    fields: [activities.activityTypeId],
    references: [activityTypes.id],
  }),
  creator: one(users, {
    fields: [activities.creatorId],
    references: [users.id],
  }),
  participants: many(activityParticipants),
}));

export const activityParticipantsRelations = relations(activityParticipants, ({ one }) => ({
  activity: one(activities, {
    fields: [activityParticipants.activityId],
    references: [activities.id],
  }),
  user: one(users, {
    fields: [activityParticipants.userId],
    references: [users.id],
  }),
}));