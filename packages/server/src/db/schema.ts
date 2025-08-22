// src/db/schema.ts - Corrected schema with updated pgTable syntax and missing properties
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
  index,
  decimal,
  type PgTableWithColumns,
} from "drizzle-orm/pg-core";

// Re-export delta tracking tables
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
  "rated"
]);
export const skillTypeEnum = pgEnum("skill_type", [
  "physical",
  "technical",
  "mental",
  "tactical",
]);
export const activityCategoryEnum = pgEnum("activity_category", [
  "team_sports",
  "individual_sports",
  "fitness",
  "mind_body",
  "combat_sports",
  "outdoor_activities",
]);
export const chatMessageTypeEnum = pgEnum("chat_message_type", [
  "text",
  "system",
  "image",
  "file",
]);
export const completionStatusEnum = pgEnum("completion_status", [
  "scheduled",
  "active",
  "completed",
  "cancelled"
]);
export const finalResultEnum = pgEnum("final_result", [
  "win",
  "loss", 
  "draw"
]);
export const eloStatusEnum = pgEnum("elo_status", [
  "pending",
  "calculating",
  "completed",
  "error"
]);
export const postTypeEnum = pgEnum("post_type", [
  "activity_recap",
  "skill_milestone", 
  "general"
]);
export const visibilityEnum = pgEnum("visibility", [
  "public",
  "friends",
  "private"
]);

// Core Tables
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  publicId: uuid("public_id").defaultRandom().notNull().unique(),
  username: varchar("username", { length: 50 }).unique(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  avatarUrl: varchar("avatar_url", { length: 500 }),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userConnections = pgTable(
  "user_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user1Id: uuid("user1_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    user2Id: uuid("user2_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    status: connectionStatusEnum("status").default("pending").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.user1Id, table.user2Id),
  ]
);

export const activityTypes = pgTable("activity_types", {
  id: uuid("id").defaultRandom().primaryKey(),
  publicId: uuid("public_id").defaultRandom().notNull().unique(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  category: activityCategoryEnum("category").notNull(),
  isSoloPerformable: boolean("is_solo_performable").default(false).notNull(),
  iconUrl: varchar("icon_url", { length: 500 }),
  skillCategories: jsonb("skill_categories").default([]),
  defaultELOSettings: jsonb("default_elo_settings").default({}),
  displayOrder: integer("display_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const activities = pgTable("activities", {
  id: uuid("id").defaultRandom().primaryKey(),
  publicId: uuid("public_id").defaultRandom().notNull().unique(),
  activityTypeId: uuid("activity_type_id")
    .references(() => activityTypes.id, { onDelete: "cascade" })
    .notNull(),
  creatorId: uuid("creator_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  description: text("description").notNull(),
  location: varchar("location", { length: 255 }),
  dateTime: timestamp("date_time").notNull(),
  maxParticipants: integer("max_participants"),
  eloLevel: integer("elo_level"),
  skillRequirements: jsonb("skill_requirements").default({}),
  isELORated: boolean("is_elo_rated").default(false).notNull(),
  completionStatus: completionStatusEnum("completion_status").default("scheduled").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const activityParticipants = pgTable(
  "activity_participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    activityId: uuid("activity_id")
      .references(() => activities.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),    
    status: participantStatusEnum("status").default("pending").notNull(),
    team: varchar("team", { length: 50 }),
    finalResult: finalResultEnum("final_result"),
    performanceNotes: text("performance_notes"),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.activityId, table.userId),
  ]
);

// Skill System
export const skillDefinitions = pgTable("skill_definitions", {
  id: uuid("id").defaultRandom().primaryKey(),
  publicId: uuid("public_id").defaultRandom().notNull().unique(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  skillType: skillTypeEnum("skill_type").notNull(),
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
      .references(() => activityTypes.id, { onDelete: "cascade" })
      .notNull(),
    skillDefinitionId: uuid("skill_definition_id")
      .references(() => skillDefinitions.id, { onDelete: "cascade" })
      .notNull(),
    isSpecificToActivityType: boolean("is_specific_to_activity_type").default(false),
    weight: integer("weight").default(100),
    displayOrder: integer("display_order").default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.activityTypeId, table.skillDefinitionId),
  ]
);

export const userActivitySkillRatings = pgTable(
  "user_activity_skill_ratings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    activityId: uuid("activity_id")
      .references(() => activities.id, { onDelete: "cascade" })
      .notNull(),
    ratedUserId: uuid("rated_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    ratingUserId: uuid("rating_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    skillDefinitionId: uuid("skill_definition_id")
      .references(() => skillDefinitions.id, { onDelete: "cascade" })
      .notNull(),
    ratingValue: integer("rating_value").notNull(),
    confidence: integer("confidence").default(5),
    comment: text("comment"),
    isAnonymous: boolean("is_anonymous").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.activityId, table.ratedUserId, table.ratingUserId, table.skillDefinitionId),
  ]
);

export const userActivityTypeSkillSummaries = pgTable(
  "user_activity_type_skill_summaries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    activityTypeId: uuid("activity_type_id")
      .references(() => activityTypes.id, { onDelete: "cascade" })
      .notNull(),
    skillDefinitionId: uuid("skill_definition_id")
      .references(() => skillDefinitions.id, { onDelete: "cascade" })
      .notNull(),
    averageRating: integer("average_rating"),
    totalRatings: integer("total_ratings").default(0),
    lastCalculatedAt: timestamp("last_calculated_at").defaultNow(),
    trend: varchar("trend", { length: 20 }).default("stable"),
  },
  (table) => [
    unique().on(table.userId, table.activityTypeId, table.skillDefinitionId),
  ]
);

export const userGeneralSkillSummaries = pgTable(
  "user_general_skill_summaries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    skillDefinitionId: uuid("skill_definition_id")
      .references(() => skillDefinitions.id, { onDelete: "cascade" })
      .notNull(),
    overallAverageRating: decimal("overall_average_rating", { precision: 4, scale: 2 }),
    totalRatings: integer("total_ratings").default(0),
    activityTypesCount: integer("activity_types_count").default(0),
    lastCalculatedAt: timestamp("last_calculated_at").defaultNow(),
  },
  (table) => [
    unique().on(table.userId, table.skillDefinitionId),
  ]
);

// ELO System
export const userActivityTypeELOs = pgTable(
  "user_activity_type_elos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    activityTypeId: uuid("activity_type_id")
      .references(() => activityTypes.id, { onDelete: "cascade" })
      .notNull(),
    eloScore: integer("elo_score").default(1200).notNull(),
    gamesPlayed: integer("games_played").default(0).notNull(),
    peakELO: integer("peak_elo").default(1200),
    seasonELO: integer("season_elo"),
    volatility: integer("volatility").default(350),
    lastUpdated: timestamp("last_updated").defaultNow().notNull(),
    version: integer("version").default(1),
  },
  (table) => [
    unique().on(table.userId, table.activityTypeId),
    index("elo_score_idx").on(table.activityTypeId, table.eloScore),
  ]
);

export const activityELOStatus = pgTable("activity_elo_status", {
  activityId: uuid("activity_id")
    .references(() => activities.id, { onDelete: "cascade" })
    .primaryKey(),
  status: eloStatusEnum("status").default("pending").notNull(),
  lockedBy: varchar("locked_by", { length: 255 }),
  lockedAt: timestamp("locked_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Teams and Messaging System
export const teams = pgTable("teams", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  creatorId: uuid("creator_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  isPrivate: boolean("is_private").default(false),
  maxMembers: integer("max_members"),
  activityTypeId: uuid("activity_type_id")
    .references(() => activityTypes.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    teamId: uuid("team_id")
      .references(() => teams.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: varchar("role", { length: 50 }).default("member"),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.teamId, table.userId),
  ]
);

export const chatRooms = pgTable("chat_rooms", {
  id: uuid("id").defaultRandom().primaryKey(),
  publicId: uuid("public_id").defaultRandom().notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  isPrivate: boolean("is_private").default(false),
  creatorId: uuid("creator_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const roomMembers = pgTable(
  "room_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roomId: uuid("room_id")
      .references(() => chatRooms.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    isAdmin: boolean("is_admin").default(false).notNull(),
  },
  (table) => [
    unique().on(table.roomId, table.userId),
  ]
);

export const messages : PgTableWithColumns<any> = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  publicId: uuid("public_id").defaultRandom().notNull().unique(),
  roomId: uuid("room_id")
    .references(() => chatRooms.id, { onDelete: "cascade" })
    .notNull(),
  senderId: uuid("sender_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  content: text("content").notNull(),
  messageType: chatMessageTypeEnum("message_type").default("text").notNull(),
  replyToId: uuid("reply_to_id")
    .references(() => messages.id, { onDelete: "set null" }),
  editedAt: timestamp("edited_at"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Activity Chat System
export const activityChatRooms = pgTable("activity_chat_rooms", {
  id: uuid("id").defaultRandom().primaryKey(),
  publicId: uuid("public_id").defaultRandom().notNull().unique(),
  activityId: uuid("activity_id")
    .references(() => activities.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const activityChatMessages: PgTableWithColumns<any> = pgTable(
  "activity_chat_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    publicId: uuid("public_id").defaultRandom().notNull().unique(),
    roomId: uuid("room_id")
      .references(() => activityChatRooms.id, { onDelete: "cascade" })
      .notNull(),
    senderId: uuid("sender_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    content: text("content").notNull(),
    messageType: chatMessageTypeEnum("message_type").default("text").notNull(),
    replyToId: uuid("reply_to_id")
      .references(() => activityChatMessages.id, { onDelete: "set null" }),
    attachmentUrl: varchar("attachment_url", { length: 500 }),
    metadata: jsonb("metadata"),
    editedAt: timestamp("edited_at"),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("activity_chat_messages_room_created_idx").on(table.roomId, table.createdAt),
  ]
);

export const activityChatReadStatus = pgTable(
  "activity_chat_read_status",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    roomId: uuid("room_id")
      .references(() => activityChatRooms.id, { onDelete: "cascade" })
      .notNull(),
    lastReadMessageId: uuid("last_read_message_id")
      .references(() => activityChatMessages.id, { onDelete: "set null" }),
    lastReadAt: timestamp("last_read_at").defaultNow().notNull(),
    unreadCount: integer("unread_count").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.userId, table.roomId),
  ]
);

// Posts System
export const posts = pgTable("posts", {
  id: uuid("id").defaultRandom().primaryKey(),
  publicId: uuid("public_id").defaultRandom().notNull().unique(),
  activityId: uuid("activity_id")
    .references(() => activities.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  title: varchar("title", { length: 255 }),
  content: text("content").notNull(),
  postType: postTypeEnum("post_type").default("general").notNull(),
  skillHighlights: jsonb("skill_highlights"),
  visibility: visibilityEnum("visibility").default("public").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Define relationships
export const usersRelations = relations(users, ({ many }) => ({
  createdActivities: many(activities),
  participations: many(activityParticipants),
  givenRatings: many(userActivitySkillRatings, { relationName: "ratingUser" }),
  receivedRatings: many(userActivitySkillRatings, { relationName: "ratedUser" }),
  eloScores: many(userActivityTypeELOs),
  skillSummaries: many(userActivityTypeSkillSummaries),
  generalSkillSummaries: many(userGeneralSkillSummaries),
  connections1: many(userConnections, { relationName: "user1" }),
  connections2: many(userConnections, { relationName: "user2" }),
  posts: many(posts),
  sentMessages: many(messages),
  sentActivityMessages: many(activityChatMessages),
  roomMemberships: many(roomMembers),
  teamMemberships: many(teamMembers),
  createdTeams: many(teams),
  readStatuses: many(activityChatReadStatus),
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
  skillRatings: many(userActivitySkillRatings),
  eloStatus: one(activityELOStatus),
  chatRoom: one(activityChatRooms),
  posts: many(posts),
}));

export const activityTypesRelations = relations(activityTypes, ({ many }) => ({
  activities: many(activities),
  skills: many(activityTypeSkills),
  eloScores: many(userActivityTypeELOs),
  skillSummaries: many(userActivityTypeSkillSummaries),
  teams: many(teams),
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

export const skillDefinitionsRelations = relations(skillDefinitions, ({ many }) => ({
  activityTypeSkills: many(activityTypeSkills),
  userRatings: many(userActivitySkillRatings),
  activityTypeSummaries: many(userActivityTypeSkillSummaries),
  generalSummaries: many(userGeneralSkillSummaries),
}));

export const userActivitySkillRatingsRelations = relations(userActivitySkillRatings, ({ one }) => ({
  activity: one(activities, {
    fields: [userActivitySkillRatings.activityId],
    references: [activities.id],
  }),
  ratedUser: one(users, {
    fields: [userActivitySkillRatings.ratedUserId],
    references: [users.id],
    relationName: "ratedUser",
  }),
  ratingUser: one(users, {
    fields: [userActivitySkillRatings.ratingUserId],
    references: [users.id],
    relationName: "ratingUser",
  }),
  skill: one(skillDefinitions, {
    fields: [userActivitySkillRatings.skillDefinitionId],
    references: [skillDefinitions.id],
  }),
}));

export const userConnectionsRelations = relations(userConnections, ({ one }) => ({
  user1: one(users, {
    fields: [userConnections.user1Id],
    references: [users.id],
    relationName: "user1",
  }),
  user2: one(users, {
    fields: [userConnections.user2Id],
    references: [users.id],
    relationName: "user2",
  }),
}));

export const activityChatRoomsRelations = relations(activityChatRooms, ({ one, many }) => ({
  activity: one(activities, {
    fields: [activityChatRooms.activityId],
    references: [activities.id],
  }),
  messages: many(activityChatMessages),
  readStatuses: many(activityChatReadStatus),
}));

export const activityChatMessagesRelations = relations(activityChatMessages, ({ one }) => ({
  room: one(activityChatRooms, {
    fields: [activityChatMessages.roomId],
    references: [activityChatRooms.id],
  }),
  sender: one(users, {
    fields: [activityChatMessages.senderId],
    references: [users.id],
  }),
  replyTo: one(activityChatMessages, {
    fields: [activityChatMessages.replyToId],
    references: [activityChatMessages.id],
  }),
}));