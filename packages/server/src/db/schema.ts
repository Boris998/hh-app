import { relations } from "drizzle-orm";
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
  unique,
} from "drizzle-orm/pg-core";

export * from './delta-tracking.schema';

// Enums
export const userRoleEnum = pgEnum("user_role", ["admin", "user", "moderator"]);
export const connectionStatusEnum = pgEnum("connection_status", [
  "pending",
  "accepted",
  "rejected",
]);
export const participantStatusEnum = pgEnum("participant_status", [
  "pending",
  "accepted",
  "declined",
]);
export const skillTypeEnum = pgEnum("skill_type", [
  "physical",
  "technical",
  "mental",
  "tactical",
]);

// Activity category enum
export const activityCategoryEnum = pgEnum("activity_category", [
  "team_sports",
  "individual_sports",
  "fitness",
  "mind_body",
  "combat_sports",
  "outdoor_activities",
]);

//enums for chat system
export const chatMessageTypeEnum = pgEnum("chat_message_type", [
  "text",
  "system",
  "image",
  "file",
]);

// Tables
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  publicId: uuid("public_id").defaultRandom().notNull().unique(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  avatarUrl: varchar("avatar_url", { length: 500 }),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// NEW: ActivityTypes table
export const activityTypes = pgTable("activity_types", {
  id: uuid("id").defaultRandom().primaryKey(),
  publicId: uuid("public_id").defaultRandom().notNull().unique(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  category: activityCategoryEnum("category").notNull(),
  isSoloPerformable: boolean("is_solo_performable").default(false).notNull(),

  // JSON fields for flexible configuration
  skillCategories: jsonb("skill_categories").notNull().default("[]"),
  defaultELOSettings: jsonb("default_elo_settings").notNull().default("{}"),

  // Metadata
  isActive: boolean("is_active").default(true).notNull(),
  displayOrder: integer("display_order").default(0),
  iconUrl: varchar("icon_url", { length: 500 }),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Updated activities table
export const activities = pgTable("activities", {
  id: uuid("id").defaultRandom().primaryKey(),
  publicId: uuid("public_id").defaultRandom().notNull().unique(),
  activityTypeId: uuid("activity_type_id")
    .references(() => activityTypes.id, { onDelete: "restrict" })
    .notNull(),
  creatorId: uuid("creator_id")
    .references(() => users.id)
    .notNull(),
  description: text("description"),
  location: varchar("location", { length: 200 }),
  dateTime: timestamp("date_time").notNull(),

  // NEW: Enhanced fields
  maxParticipants: integer("max_participants"),
  eloLevel: integer("elo_level"),
  skillRequirements: jsonb("skill_requirements").default("{}"),
  isELORated: boolean("is_elo_rated").default(true).notNull(),
  completionStatus: varchar("completion_status", { length: 20 })
    .default("scheduled")
    .notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const activityParticipants = pgTable("activity_participants", {
  id: uuid("id").defaultRandom().primaryKey(),
  activityId: uuid("activity_id")
    .references(() => activities.id)
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  status: participantStatusEnum("status").default("pending").notNull(),

  // NEW: Enhanced fields for team activities
  team: varchar("team", { length: 50 }),
  finalResult: varchar("final_result", { length: 20 }),
  performanceNotes: text("performance_notes"),

  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

export const skillDefinitions = pgTable("skill_definitions", {
  id: uuid("id").defaultRandom().primaryKey(),
  publicId: uuid("public_id").defaultRandom().notNull().unique(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  skillType: skillTypeEnum("skill_type").notNull(), // physical/technical/mental/tactical
  isGeneral: boolean("is_general").default(false).notNull(),
  description: text("description"),
  ratingScaleMin: integer("rating_scale_min").default(1),
  ratingScaleMax: integer("rating_scale_max").default(10),
  category: varchar("category", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const activityTypeSkills = pgTable(
  "activity_type_skills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    activityTypeId: uuid("activity_type_id")
      .references(() => activityTypes.id)
      .notNull(),
    skillDefinitionId: uuid("skill_definition_id")
      .references(() => skillDefinitions.id)
      .notNull(),
    isSpecificToActivityType: boolean("is_specific_to_activity_type").default(
      false
    ),
    weight: integer("weight").default(100), // 0-100 importance percentage
    displayOrder: integer("display_order").default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    unique: unique().on(table.activityTypeId, table.skillDefinitionId),
  })
);

export const userConnections = pgTable("user_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  user1Id: uuid("user1_id")
    .references(() => users.id)
    .notNull(),
  user2Id: uuid("user2_id")
    .references(() => users.id)
    .notNull(),
  status: connectionStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userActivityTypeELOs = pgTable(
  "user_activity_type_elos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    activityTypeId: uuid("activity_type_id")
      .references(() => activityTypes.id)
      .notNull(),
    eloScore: integer("elo_score").default(1200).notNull(),
    gamesPlayed: integer("games_played").default(0),
    peakELO: integer("peak_elo").default(1200),
    volatility: integer("volatility").default(300), // stored as integer (3.00 * 100)
    lastUpdated: timestamp("last_updated").defaultNow().notNull(),
    version: integer("version").default(1), // optimistic locking
  },
  (table) => ({
    unique: unique().on(table.userId, table.activityTypeId),
  })
);

export const activityELOStatus = pgTable("activity_elo_status", {
  activityId: uuid("activity_id")
    .references(() => activities.id)
    .primaryKey(),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  lockedBy: varchar("locked_by", { length: 100 }),
  lockedAt: timestamp("locked_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
});

export const userActivitySkillRatings = pgTable(
  "user_activity_skill_ratings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    activityId: uuid("activity_id")
      .references(() => activities.id)
      .notNull(),
    ratedUserId: uuid("rated_user_id")
      .references(() => users.id)
      .notNull(),
    ratingUserId: uuid("rating_user_id")
      .references(() => users.id)
      .notNull(),
    skillDefinitionId: uuid("skill_definition_id")
      .references(() => skillDefinitions.id)
      .notNull(),
    ratingValue: integer("rating_value").notNull(), // 1-10
    confidence: integer("confidence").default(5), // 1-5
    comment: text("comment"),
    isAnonymous: boolean("is_anonymous").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    unique: unique().on(
      table.activityId,
      table.ratedUserId,
      table.ratingUserId,
      table.skillDefinitionId
    ),
  })
);

export const userActivityTypeSkillSummaries = pgTable(
  "user_activity_type_skill_summaries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    activityTypeId: uuid("activity_type_id")
      .references(() => activityTypes.id)
      .notNull(),
    skillDefinitionId: uuid("skill_definition_id")
      .references(() => skillDefinitions.id)
      .notNull(),
    averageRating: integer("average_rating"), // stored as integer (7.50 * 100 = 750)
    totalRatings: integer("total_ratings").default(0),
    lastCalculatedAt: timestamp("last_calculated_at").defaultNow(),
    trend: varchar("trend", { length: 20 }).default("stable"),
  },
  (table) => ({
    unique: unique().on(
      table.userId,
      table.activityTypeId,
      table.skillDefinitionId
    ),
  })
);

export const teams = pgTable('teams', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  logoUrl: varchar('logo_url', { length: 500 }),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const teamMembers = pgTable('team_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  teamId: uuid('team_id').references(() => teams.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role: varchar('role', { length: 50 }).default('member'), // 'captain', 'member', etc.
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
});

export const chatRooms = pgTable("chat_rooms", {
  id: uuid("id").defaultRandom().primaryKey(),
  publicId: uuid("public_id").defaultRandom().notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  isPrivate: boolean("is_private").default(false).notNull(),
  createdById: uuid("created_by_id")
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  publicId: uuid("public_id").defaultRandom().notNull().unique(),
  roomId: uuid("room_id")
    .references(() => chatRooms.id)
    .notNull(),
  senderId: uuid("sender_id")
    .references(() => users.id)
    .notNull(),
  content: text("content").notNull(),
  messageType: varchar("message_type", { length: 50 })
    .default("text")
    .notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const roomMembers = pgTable("room_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id")
    .references(() => chatRooms.id)
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  isAdmin: boolean("is_admin").default(false).notNull(),
});

// Activity Chat System Tables

export const activityChatRooms = pgTable("activity_chat_rooms", {
  id: uuid("id").defaultRandom().primaryKey(),
  publicId: uuid("public_id").defaultRandom().notNull().unique(),
  activityId: uuid("activity_id")
    .references(() => activities.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  autoDeleteAfterHours: integer("auto_delete_after_hours"), // null = persist forever
  deletedAt: timestamp("deleted_at"), // soft delete
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const activityChatMessages = pgTable("activity_chat_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  publicId: uuid("public_id").defaultRandom().notNull().unique(),
  chatRoomId: uuid("chat_room_id")
    .references(() => activityChatRooms.id, { onDelete: "cascade" })
    .notNull(),
  senderId: uuid("sender_id")
    .references(() => users.id)
    .notNull(),
  content: text("content").notNull(),
  messageType: chatMessageTypeEnum("message_type").default("text").notNull(),
  metadata: jsonb("metadata"), // for attachments, reactions, etc.
  isEdited: boolean("is_edited").default(false).notNull(),
  editedAt: timestamp("edited_at"),
  deletedAt: timestamp("deleted_at"), // soft delete
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const activityChatReadStatus = pgTable(
  "activity_chat_read_status",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    chatRoomId: uuid("chat_room_id")
      .references(() => activityChatRooms.id, { onDelete: "cascade" })
      .notNull(),
    lastReadMessageId: uuid("last_read_message_id").references(
      () => activityChatMessages.id
    ),
    unreadCount: integer("unread_count").default(0).notNull(),
    lastReadAt: timestamp("last_read_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    unique: unique().on(table.userId, table.chatRoomId),
  })
);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  createdActivities: many(activities),
  activityParticipants: many(activityParticipants),
  sentChatMessages: many(activityChatMessages),
  chatReadStatuses: many(activityChatReadStatus),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
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
  chatRoom: one(activityChatRooms),
}));

export const activityChatRoomsRelations = relations(
  activityChatRooms,
  ({ one, many }) => ({
    activity: one(activities, {
      fields: [activityChatRooms.activityId],
      references: [activities.id],
    }),
    messages: many(activityChatMessages),
    readStatuses: many(activityChatReadStatus),
  })
);

export const activityChatMessagesRelations = relations(
  activityChatMessages,
  ({ one }) => ({
    chatRoom: one(activityChatRooms, {
      fields: [activityChatMessages.chatRoomId],
      references: [activityChatRooms.id],
    }),
    sender: one(users, {
      fields: [activityChatMessages.senderId],
      references: [users.id],
    }),
  })
);

export const activityChatReadStatusRelations = relations(
  activityChatReadStatus,
  ({ one }) => ({
    user: one(users, {
      fields: [activityChatReadStatus.userId],
      references: [users.id],
    }),
    chatRoom: one(activityChatRooms, {
      fields: [activityChatReadStatus.chatRoomId],
      references: [activityChatRooms.id],
    }),
    lastReadMessage: one(activityChatMessages, {
      fields: [activityChatReadStatus.lastReadMessageId],
      references: [activityChatMessages.id],
    }),
  })
);

export const activityParticipantsRelations = relations(
  activityParticipants,
  ({ one }) => ({
    activity: one(activities, {
      fields: [activityParticipants.activityId],
      references: [activities.id],
    }),
    user: one(users, {
      fields: [activityParticipants.userId],
      references: [users.id],
    }),
  })
);

export const chatRoomsRelations = relations(chatRooms, ({ one, many }) => ({
  creator: one(users, {
    fields: [chatRooms.createdById],
    references: [users.id],
  }),
  messages: many(messages),
  members: many(roomMembers),
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
