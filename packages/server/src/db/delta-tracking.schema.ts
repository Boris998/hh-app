// src/db/delta-tracking.schema.ts - Fixed schema with new pgTable syntax and zod validation
import {
  pgTable,
  varchar,
  timestamp,
  integer,
  jsonb,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./schema";
import { z } from "zod";
import { sql } from "drizzle-orm";

// Entity change log table with new pgTable syntax
export const entityChangeLog = pgTable(
  "entity_change_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    entityId: varchar("entity_id", { length: 255 }).notNull(),
    changeType: varchar("change_type", { length: 20 }).notNull(),

    // User who was affected by this change (for filtering user-specific deltas)
    affectedUserId: uuid("affected_user_id")
      .references(() => users.id)
      .default(sql`null`),

    // Related entity (e.g., activity for ELO changes)
    relatedEntityId: varchar("related_entity_id", { length: 255 }).default(
      sql`null`
    ),

    // Data before change (for updates/deletes)
    previousData: jsonb("previous_data").default(null),

    // Data after change (for creates/updates)
    newData: jsonb("new_data").notNull(),

    // Additional metadata about the change
    changeDetails: jsonb("change_details").default(null),

    // Who triggered the change
    triggeredBy: uuid("triggered_by")
      .references(() => users.id)
      .default(sql`null`),

    // Source of the change (system, user_action, etc.)
    changeSource: varchar("change_source", { length: 50 }).default("system"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // New array syntax for indexes
    index("entity_change_log_affected_user_idx").on(table.affectedUserId),
    index("entity_change_log_entity_type_idx").on(table.entityType),
    index("entity_change_log_created_at_idx").on(table.createdAt),
    index("entity_change_log_entity_idx").on(table.entityType, table.entityId),
  ]
);

// User delta cursors table with new pgTable syntax
export const userDeltaCursors = pgTable(
  "user_delta_cursors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull()
      .unique(),

    // Entity-specific sync cursors
    lastELOSync: timestamp("last_elo_sync").defaultNow(),
    lastActivitySync: timestamp("last_activity_sync").defaultNow(),
    lastSkillRatingSync: timestamp("last_skill_rating_sync").defaultNow(),
    lastConnectionSync: timestamp("last_connection_sync").defaultNow(),
    lastMatchmakingSync: timestamp("last_matchmaking_sync").defaultNow(),

    // Client info for adaptive polling
    lastActiveAt: timestamp("last_active_at").defaultNow(),
    clientType: varchar("client_type", { length: 20 }).default("web"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // New array syntax for indexes
    index("user_delta_cursor_idx").on(table.userId),
  ]
);

// Aggregated delta summaries table with new pgTable syntax
export const deltaSummaries = pgTable(
  "delta_summaries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),

    // Summary period
    summaryDate: timestamp("summary_date").notNull(), // Daily summaries

    // Change counts by type
    eloChanges: integer("elo_changes").default(0),
    activityChanges: integer("activity_changes").default(0),
    skillRatingChanges: integer("skill_rating_changes").default(0),
    connectionChanges: integer("connection_changes").default(0),

    // Summary data
    summaryData: jsonb("summary_data").default("{}"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // New array syntax for indexes
    index("delta_summary_user_date_idx").on(table.userId, table.summaryDate),
  ]
);

// ====================================
// ZOD VALIDATION SCHEMAS
// ====================================

// Entity Change Log schemas
export const insertEntityChangeLogSchema = z.object({
  id: z.string().uuid().optional(),
  entityType: z.enum([
    "elo",
    "activity",
    "skill_rating",
    "connection",
    "matchmaking",
    "chat_room",
    "activity_chat_message",
  ]),
  entityId: z.string().min(1, "Entity ID is required"),
  changeType: z.enum(["create", "update", "delete"]),
  affectedUserId: z.string().uuid().optional().nullable(),
  relatedEntityId: z.string().optional().nullable(),
  previousData: z.any().optional().nullable(),
  newData: z.any(),
  changeDetails: z.any().optional().nullable(),
  triggeredBy: z.string().uuid().optional().nullable(),
  changeSource: z.string().max(50).default("user_action").optional(), // Make optional with default
  createdAt: z.date().optional(),
});

export const selectEntityChangeLogSchema = z.object({
  id: z.string().uuid(),
  entityType: z.string(),
  entityId: z.string(),
  changeType: z.string(),
  affectedUserId: z.string().uuid().nullable(),
  relatedEntityId: z.string().nullable(),
  previousData: z.any().nullable(),
  newData: z.any(),
  changeDetails: z.any().nullable(),
  triggeredBy: z.string().uuid().nullable(),
  changeSource: z.string(),
  createdAt: z.date(),
});

export const updateEntityChangeLogSchema =
  insertEntityChangeLogSchema.partial();

// User Delta Cursors schemas
export const insertUserDeltaCursorSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().uuid(),
  lastELOSync: z.date().optional(),
  lastActivitySync: z.date().optional(),
  lastSkillRatingSync: z.date().optional(),
  lastConnectionSync: z.date().optional(),
  lastMatchmakingSync: z.date().optional(),
  lastActiveAt: z.date().optional(),
  clientType: z.enum(["web", "mobile"]).default("web"),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const selectUserDeltaCursorSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  lastELOSync: z.date().nullable(),
  lastActivitySync: z.date().nullable(),
  lastSkillRatingSync: z.date().nullable(),
  lastConnectionSync: z.date().nullable(),
  lastMatchmakingSync: z.date().nullable(),
  lastActiveAt: z.date().nullable(),
  clientType: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const updateUserDeltaCursorSchema =
  insertUserDeltaCursorSchema.partial();

// Delta Summaries schemas
export const insertDeltaSummarySchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().uuid(),
  summaryDate: z.date(),
  eloChanges: z.number().int().default(0),
  activityChanges: z.number().int().default(0),
  skillRatingChanges: z.number().int().default(0),
  connectionChanges: z.number().int().default(0),
  summaryData: z.record(z.string(), z.any()).default({}),
  createdAt: z.date().optional(),
});

export const selectDeltaSummarySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  summaryDate: z.date(),
  eloChanges: z.number().int(),
  activityChanges: z.number().int(),
  skillRatingChanges: z.number().int(),
  connectionChanges: z.number().int(),
  summaryData: z.record(z.string(), z.any()),
  createdAt: z.date(),
});

export const updateDeltaSummarySchema = insertDeltaSummarySchema.partial();

// Delta Query schemas
export const deltaQuerySchema = z.object({
  since: z.date().optional(),
  entityTypes: z
    .array(
      z.enum(["elo", "activity", "skill_rating", "connection", "matchmaking"])
    )
    .optional(),
  clientType: z.enum(["web", "mobile"]).default("web"),
  limit: z.number().int().min(1).max(100).default(50),
});

// Delta Change Input schema (for service methods)
export const deltaChangeInputSchema = z.object({
  entityType: z.enum([
    "elo",
    "activity",
    "skill_rating",
    "connection",
    "matchmaking",
    "user",
    "activity_chat_message",
    "team_member",
    'team',
    'test'
  ]),
  entityId: z.string().min(1, "Entity ID is required"),
  changeType: z.enum(["create", "update", "delete"]),
  affectedUserId: z.string().uuid().optional(),
  relatedEntityId: z.string().optional(),
  previousData: z.any().optional(),
  newData: z.any(),
  changeDetails: z.any().optional(),
  triggeredBy: z.string().uuid().optional(),
  changeSource: z.string().max(50).default("user_action").optional(), // Make optional with default
});

// User Delta Response schema
export const userDeltaResponseSchema = z.object({
  hasChanges: z.boolean(),
  changes: z.array(selectEntityChangeLogSchema),
  newCursors: z.object({
    lastELOSync: z.date(),
    lastActivitySync: z.date(),
    lastSkillRatingSync: z.date(),
    lastConnectionSync: z.date(),
    lastMatchmakingSync: z.date(),
  }),
  metadata: z.object({
    totalChanges: z.number().int(),
    changeTypes: z.record(z.string(), z.number().int()),
    oldestChange: z.date().optional(),
    newestChange: z.date().optional(),
  }),
  recommendedPollInterval: z.number().int(),
});

// ====================================
// TYPE EXPORTS
// ====================================

// Entity Change Log types
export type EntityChangeLog = z.infer<typeof selectEntityChangeLogSchema>;
export type InsertEntityChangeLog = z.infer<typeof insertEntityChangeLogSchema>;
export type UpdateEntityChangeLog = z.infer<typeof updateEntityChangeLogSchema>;

// User Delta Cursor types
export type UserDeltaCursor = z.infer<typeof selectUserDeltaCursorSchema>;
export type InsertUserDeltaCursor = z.infer<typeof insertUserDeltaCursorSchema>;
export type UpdateUserDeltaCursor = z.infer<typeof updateUserDeltaCursorSchema>;

// Delta Summary types
export type DeltaSummary = z.infer<typeof selectDeltaSummarySchema>;
export type InsertDeltaSummary = z.infer<typeof insertDeltaSummarySchema>;
export type UpdateDeltaSummary = z.infer<typeof updateDeltaSummarySchema>;

// Query and Response types
export type DeltaQuery = z.infer<typeof deltaQuerySchema>;
export type DeltaChangeInput = z.infer<typeof deltaChangeInputSchema>;
export type UserDeltaResponse = z.infer<typeof userDeltaResponseSchema>;
