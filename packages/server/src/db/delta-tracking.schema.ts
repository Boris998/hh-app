// src/db/delta-tracking.schema.ts - Delta polling database schema

import {
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./schema";

// Entity change tracking table
export const entityChangeLog = pgTable(
  "entity_change_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // What changed
    entityType: varchar("entity_type", { length: 50 }).notNull(), // 'elo', 'activity', 'skill_rating', 'connection'
    entityId: varchar("entity_id", {length: 255}).notNull(), // ID of the changed entity
    changeType: varchar("change_type", { length: 20 }).notNull(), // 'create', 'update', 'delete'

    // Who is affected (for filtering)
    affectedUserId: uuid("affected_user_id").references(() => users.id),
    relatedEntityId: varchar("related_entity_id", { length: 255 }), // e.g., activityId for ELO changes

    // Change details
    previousData: jsonb("previous_data"), // Old values (for updates)
    newData: jsonb("new_data").notNull(), // New values
    changeDetails: jsonb("change_details"), // Additional context

    // Metadata
    triggeredBy: uuid("triggered_by").references(() => users.id), // Who caused the change
    changeSource: varchar("change_source", { length: 50 }).default("system"), // 'user_action', 'system', 'admin'

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    // Indexes for efficient delta queries
    userTimestampIdx: index("entity_change_user_timestamp_idx").on(
      table.affectedUserId,
      table.createdAt
    ),
    entityTypeTimestampIdx: index("entity_change_type_timestamp_idx").on(
      table.entityType,
      table.createdAt
    ),
    relatedEntityIdx: index("entity_change_related_idx").on(
      table.relatedEntityId,
      table.createdAt
    ),
  })
);

// User-specific delta cursors (tracks last seen timestamp per user)
export const userDeltaCursors = pgTable(
  "user_delta_cursors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),

    // Entity-specific cursors
    lastELOSync: timestamp("last_elo_sync").defaultNow(),
    lastActivitySync: timestamp("last_activity_sync").defaultNow(),
    lastSkillRatingSync: timestamp("last_skill_rating_sync").defaultNow(),
    lastConnectionSync: timestamp("last_connection_sync").defaultNow(),
    lastMatchmakingSync: timestamp("last_matchmaking_sync").defaultNow(),

    // Client info for adaptive polling
    clientType: varchar("client_type", { length: 20 }).default("web"), // 'web', 'mobile'
    lastActiveAt: timestamp("last_active_at").defaultNow(),
    preferredPollInterval: integer("preferred_poll_interval").default(5000), // ms

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("user_delta_cursor_idx").on(table.userId),
  })
);

// Aggregated delta summaries (for performance)
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
  (table) => ({
    userDateIdx: index("delta_summary_user_date_idx").on(
      table.userId,
      table.summaryDate
    ),
  })
);

// Types for delta responses
export interface DeltaChange {
  id: string;
  entityType:
    | "elo"
    | "activity"
    | "skill_rating"
    | "connection"
    | "matchmaking";
  entityId: string;
  changeType: "create" | "update" | "delete";
  affectedUserId?: string;
  relatedEntityId?: string;
  previousData?: any;
  newData: any;
  changeDetails?: any;
  triggeredBy?: string;
  changeSource: string;
  createdAt: Date;
}

export interface UserDeltaResponse {
  hasChanges: boolean;
  changes: DeltaChange[];
  newCursors: {
    lastELOSync: Date;
    lastActivitySync: Date;
    lastSkillRatingSync: Date;
    lastConnectionSync: Date;
    lastMatchmakingSync: Date;
  };
  metadata: {
    totalChanges: number;
    changeTypes: Record<string, number>;
    oldestChange?: Date;
    newestChange?: Date;
  };
  recommendedPollInterval: number; // Adaptive polling
}
