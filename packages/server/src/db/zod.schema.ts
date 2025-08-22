// src/db/zod.schema.ts - Fixed Zod validation schemas for sports activity tracking platform
import { z } from "zod";

// ====================================
// CORE USER SCHEMAS
// ====================================

export const insertUserSchema = z.object({
  id: z.string().uuid().optional(),
  publicId: z.string().uuid().optional(),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username too long"),
  email: z.string().email("Invalid email format"),
  passwordHash: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .optional(),
  avatarUrl: z.string().url("Invalid avatar URL").optional().nullable(),
  role: z.enum(["admin", "user", "moderator"]).default("user"),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const selectUserSchema = z.object({
  id: z.string().uuid(),
  publicId: z.string().uuid(),
  username: z.string(),
  email: z.string().email(),
  passwordHash: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  role: z.enum(["admin", "user", "moderator"]),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const updateUserSchema = insertUserSchema.partial();

export const loginUserSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const registerUserSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username too long")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters")
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password too long"),
  avatarUrl: z.string().url("Invalid avatar URL").optional(),
});

// ====================================
// USER CONNECTION SCHEMAS
// ====================================

export const insertUserConnectionSchema = z.object({
  id: z.string().uuid().optional(),
  user1Id: z.string().uuid(),
  user2Id: z.string().uuid(),
  status: z.enum(["pending", "accepted", "rejected"]).default("pending"),
  createdAt: z.date().optional(),
});

export const selectUserConnectionSchema = z.object({
  id: z.string().uuid(),
  user1Id: z.string().uuid(),
  user2Id: z.string().uuid(),
  status: z.enum(["pending", "accepted", "rejected"]),
  createdAt: z.date(),
});

export const updateUserConnectionSchema = insertUserConnectionSchema.partial();

export const createConnectionRequestSchema = z.object({
  targetUserId: z.string().uuid("Invalid user ID"),
});

// ====================================
// ACTIVITY TYPE SCHEMAS
// ====================================

export const insertActivityTypeSchema = z.object({
  id: z.string().uuid().optional(),
  publicId: z.string().uuid().optional(),
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  description: z.string().max(1000, "Description too long").optional(),
  category: z.enum(["team_sports", "individual_sports", "fitness", "mind_body", "combat_sports", "outdoor_activities"]),
  isSoloPerformable: z.boolean().default(false),
  iconUrl: z.string().url().max(500, "Icon URL too long").optional(),
  skillCategories: z.array(z.object({
    name: z.string(),
    skills: z.array(z.string()),
  })).default([]),
  defaultELOSettings: z.object({
    startingELO: z.number().int().min(0).default(1200),
    kFactor: z.object({
      new: z.number().int().min(1).default(40),
      established: z.number().int().min(1).default(20),
      expert: z.number().int().min(1).default(10),
    }).default({
      new: 40,
      established: 20,
      expert: 10,
    }),
    minGamesForEstablished: z.number().int().min(1).default(10),
    minGamesForExpert: z.number().int().min(1).default(50),
  }).default({
    startingELO: 1200,
    kFactor: {
      new: 40,
      established: 20,
      expert: 10,
    },
    minGamesForEstablished: 10,
    minGamesForExpert: 50,
  }),
  displayOrder: z.number().int().min(0).default(0),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const selectActivityTypeSchema = z.object({
  id: z.string().uuid(),
  publicId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  category: z.enum(["team_sports", "individual_sports", "fitness", "mind_body", "combat_sports", "outdoor_activities"]),
  isSoloPerformable: z.boolean(),
  iconUrl: z.string().nullable(),
  skillCategories: z.array(z.object({
    name: z.string(),
    skills: z.array(z.string()),
  })),
  defaultELOSettings: z.object({
    startingELO: z.number().int(),
    kFactor: z.object({
      new: z.number().int(),
      established: z.number().int(),
      expert: z.number().int(),
    }),
    minGamesForEstablished: z.number().int(),
    minGamesForExpert: z.number().int(),
  }),
  displayOrder: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const updateActivityTypeSchema = insertActivityTypeSchema.partial();

// ====================================
// ACTIVITY SCHEMAS
// ====================================

export const insertActivitySchema = z.object({
  id: z.string().uuid().optional(),
  publicId: z.string().uuid().optional(),
  activityTypeId: z.string().uuid(),
  creatorId: z.string().uuid(),
  description: z
    .string()
    .max(1000, "Description too long")
    .optional()
    .nullable(),
  location: z.string().max(200, "Location too long").optional().nullable(),
  dateTime: z.union([z.date(), z.string().pipe(z.coerce.date())]),
  maxParticipants: z
    .number()
    .int()
    .positive("Max participants must be positive")
    .optional()
    .nullable(),
  eloLevel: z
    .number()
    .int()
    .positive("ELO level must be positive")
    .optional()
    .nullable(),
  skillRequirements: z.record(z.string(), z.number()).default({}),
  isELORated: z.boolean().default(true),
  completionStatus: z
    .enum(["scheduled", "active", "completed", "cancelled"])
    .default("scheduled"),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const selectActivitySchema = z.object({
  id: z.string().uuid(),
  publicId: z.string().uuid(),
  activityTypeId: z.string().uuid(),
  creatorId: z.string().uuid(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  dateTime: z.date(),
  maxParticipants: z.number().int().nullable(),
  eloLevel: z.number().int().nullable(),
  skillRequirements: z.record(z.string(), z.number()),
  isELORated: z.boolean(),
  completionStatus: z.enum(["scheduled", "active", "completed", "cancelled"]),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const updateActivitySchema = insertActivitySchema.partial();

export const createActivitySchema = z.object({
  activityTypeId: z.string().uuid("Invalid activity type ID"),
  description: z
    .string()
    .min(1, "Description is required")
    .max(1000, "Description too long"),
  location: z.string().max(255, "Location too long").optional(),
  dateTime: z.string().pipe(z.coerce.date()),
  maxParticipants: z.number().int().min(1).max(100).optional(),
  eloLevel: z.number().int().min(0).optional(),
  skillRequirements: z.record(z.string(), z.number()).default({}).optional(),
  isELORated: z.boolean().default(false),
  creatorTeam: z.string().max(50, "Team name too long").optional(),
});

// ====================================
// ACTIVITY PARTICIPANT SCHEMAS
// ====================================

export const insertActivityParticipantSchema = z.object({
  id: z.string().uuid().optional(),
  activityId: z.string().uuid(),
  userId: z.string().uuid(),
  status: z
    .enum(["pending", "accepted", "declined", "rated"])
    .default("pending"),
  team: z.string().max(50, "Team name too long").optional().nullable(),
  finalResult: z.enum(["win", "loss", "draw"]).optional().nullable(),
  performanceNotes: z
    .string()
    .max(1000, "Performance notes too long")
    .optional()
    .nullable(),
  joinedAt: z.date().optional(),
});

export const selectActivityParticipantSchema = z.object({
  id: z.string().uuid(),
  activityId: z.string().uuid(),
  userId: z.string().uuid(),
  status: z.enum(["pending", "accepted", "declined", "rated"]),
  team: z.string().nullable(),
  finalResult: z.enum(["win", "loss", "draw"]).nullable(),
  performanceNotes: z.string().nullable(),
  joinedAt: z.date(),
});

export const updateActivityParticipantSchema =
  insertActivityParticipantSchema.partial();

export const joinActivitySchema = z.object({
  team: z.string().max(50, "Team name too long").optional(),
  message: z.string().max(500, "Message too long").optional(),
});

export const completeActivitySchema = z.object({
  participantResults: z.array(
    z.object({
      userId: z.string().uuid("Invalid user ID"),
      finalResult: z.enum(["win", "loss", "draw"]),
      performanceNotes: z
        .string()
        .max(1000, "Performance notes too long")
        .optional(),
    })
  ),
  completionNotes: z.string().max(1000, "Completion notes too long").optional(),
  processELOImmediately: z.boolean().default(false),
});

// ====================================
// SKILL DEFINITION SCHEMAS
// ====================================

export const insertSkillDefinitionSchema = z.object({
  id: z.string().uuid().optional(),
  publicId: z.string().uuid().optional(),
  name: z
    .string()
    .min(1, "Skill name is required")
    .max(100, "Skill name too long"),
  skillType: z.enum(["physical", "technical", "mental", "tactical"]),
  isGeneral: z.boolean().default(false),
  description: z
    .string()
    .max(1000, "Description too long")
    .optional()
    .nullable(),
  ratingScaleMin: z
    .number()
    .int()
    .min(1, "Minimum rating must be at least 1")
    .default(1),
  ratingScaleMax: z
    .number()
    .int()
    .max(10, "Maximum rating cannot exceed 10")
    .default(10),
  category: z.string().max(50, "Category name too long").optional().nullable(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const selectSkillDefinitionSchema = z.object({
  id: z.string().uuid(),
  publicId: z.string().uuid(),
  name: z.string(),
  skillType: z.enum(["physical", "technical", "mental", "tactical"]),
  isGeneral: z.boolean(),
  description: z.string().nullable(),
  ratingScaleMin: z.number().int(),
  ratingScaleMax: z.number().int(),
  category: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const updateSkillDefinitionSchema =
  insertSkillDefinitionSchema.partial();

// ====================================
// ACTIVITY TYPE SKILL SCHEMAS
// ====================================

export const insertActivityTypeSkillSchema = z.object({
  id: z.string().uuid().optional(),
  activityTypeId: z.string().uuid(),
  skillDefinitionId: z.string().uuid(),
  isSpecificToActivityType: z.boolean().default(false),
  weight: z
    .number()
    .int()
    .min(0, "Weight cannot be negative")
    .max(100, "Weight cannot exceed 100")
    .default(100),
  displayOrder: z
    .number()
    .int()
    .min(0, "Display order cannot be negative")
    .default(0),
  createdAt: z.date().optional(),
});

export const selectActivityTypeSkillSchema = z.object({
  id: z.string().uuid(),
  activityTypeId: z.string().uuid(),
  skillDefinitionId: z.string().uuid(),
  isSpecificToActivityType: z.boolean(),
  weight: z.number().int(),
  displayOrder: z.number().int(),
  createdAt: z.date(),
});

export const updateActivityTypeSkillSchema =
  insertActivityTypeSkillSchema.partial();

// ====================================
// USER ACTIVITY SKILL RATING SCHEMAS
// ====================================

export const insertUserActivitySkillRatingSchema = z.object({
  id: z.string().uuid().optional(),
  activityId: z.string().uuid(),
  ratedUserId: z.string().uuid(),
  ratingUserId: z.string().uuid(),
  skillDefinitionId: z.string().uuid(),
  ratingValue: z
    .number()
    .int()
    .min(1, "Rating must be at least 1")
    .max(10, "Rating cannot exceed 10"),
  confidence: z
    .number()
    .int()
    .min(1, "Confidence must be at least 1")
    .max(5, "Confidence cannot exceed 5")
    .default(5),
  comment: z.string().max(500, "Comment too long").optional().nullable(),
  isAnonymous: z.boolean().default(false),
  createdAt: z.date().optional(),
});

export const selectUserActivitySkillRatingSchema = z.object({
  id: z.string().uuid(),
  activityId: z.string().uuid(),
  ratedUserId: z.string().uuid(),
  ratingUserId: z.string().uuid(),
  skillDefinitionId: z.string().uuid(),
  ratingValue: z.number().int(),
  confidence: z.number().int(),
  comment: z.string().nullable(),
  isAnonymous: z.boolean(),
  createdAt: z.date(),
});

export const updateUserActivitySkillRatingSchema =
  insertUserActivitySkillRatingSchema.partial();

export const submitSkillRatingsSchema = z.object({
  activityId: z.string().uuid("Invalid activity ID"),
  ratedUserId: z.string().uuid("Invalid rated user ID"),
  ratings: z
    .array(
      z.object({
        skillDefinitionId: z.string().uuid("Invalid skill definition ID"),
        ratingValue: z
          .number()
          .int()
          .min(1, "Rating must be at least 1")
          .max(10, "Rating cannot exceed 10"),
        confidence: z
          .number()
          .int()
          .min(1, "Confidence must be at least 1")
          .max(5, "Confidence cannot exceed 5")
          .default(3),
        comment: z.string().max(500, "Comment too long").optional(),
        isAnonymous: z.boolean().default(false),
      })
    )
    .min(1, "At least one rating is required"),
});

// ====================================
// SKILL SUMMARY SCHEMAS
// ====================================

export const insertUserActivityTypeSkillSummarySchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().uuid(),
  activityTypeId: z.string().uuid(),
  skillDefinitionId: z.string().uuid(),
  averageRating: z
    .number()
    .min(1, "Average rating must be at least 1")
    .max(10, "Average rating cannot exceed 10")
    .optional()
    .nullable(),
  totalRatings: z
    .number()
    .int()
    .min(0, "Total ratings cannot be negative")
    .default(0),
  lastCalculatedAt: z.date().optional(),
  trend: z.string().max(20, "Trend value too long").default("stable"),
});

export const selectUserActivityTypeSkillSummarySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  activityTypeId: z.string().uuid(),
  skillDefinitionId: z.string().uuid(),
  averageRating: z.number().nullable(),
  totalRatings: z.number().int(),
  lastCalculatedAt: z.date().nullable(),
  trend: z.string(),
});

export const updateUserActivityTypeSkillSummarySchema =
  insertUserActivityTypeSkillSummarySchema.partial();

export const insertUserGeneralSkillSummarySchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().uuid(),
  skillDefinitionId: z.string().uuid(),
  overallAverageRating: z
    .number()
    .min(1, "Overall average rating must be at least 1")
    .max(10, "Overall average rating cannot exceed 10")
    .optional()
    .nullable(),
  totalRatings: z
    .number()
    .int()
    .min(0, "Total ratings cannot be negative")
    .default(0),
  activityTypesCount: z
    .number()
    .int()
    .min(0, "Activity types count cannot be negative")
    .default(0),
  lastCalculatedAt: z.date().optional(),
});

export const selectUserGeneralSkillSummarySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  skillDefinitionId: z.string().uuid(),
  overallAverageRating: z.number().nullable(),
  totalRatings: z.number().int(),
  activityTypesCount: z.number().int(),
  lastCalculatedAt: z.date().nullable(),
});

export const updateUserGeneralSkillSummarySchema =
  insertUserGeneralSkillSummarySchema.partial();

// ====================================
// ELO SYSTEM SCHEMAS
// ====================================

export const insertUserActivityTypeELOSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().uuid(),
  activityTypeId: z.string().uuid(),
  eloScore: z
    .number()
    .int()
    .min(0, "ELO score cannot be negative")
    .default(1200),
  gamesPlayed: z
    .number()
    .int()
    .min(0, "Games played cannot be negative")
    .default(0),
  peakELO: z.number().int().min(0, "Peak ELO cannot be negative").default(1200),
  seasonELO: z
    .number()
    .int()
    .min(0, "Season ELO cannot be negative")
    .optional()
    .nullable(),
  volatility: z
    .number()
    .int()
    .min(0, "Volatility cannot be negative")
    .default(350),
  lastUpdated: z.date().optional(),
  version: z.number().int().min(1, "Version must be at least 1").default(1),
});

export const selectUserActivityTypeELOSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  activityTypeId: z.string().uuid(),
  eloScore: z.number().int(),
  gamesPlayed: z.number().int(),
  peakELO: z.number().int(),
  seasonELO: z.number().int().nullable(),
  volatility: z.number().int(),
  lastUpdated: z.date(),
  version: z.number().int(),
});

export const updateUserActivityTypeELOSchema =
  insertUserActivityTypeELOSchema.partial();

export const insertActivityELOStatusSchema = z.object({
  activityId: z.string().uuid(),
  status: z
    .enum(["pending", "calculating", "completed", "error"])
    .default("pending"),
  lockedBy: z
    .string()
    .max(255, "Locked by field too long")
    .optional()
    .nullable(),
  lockedAt: z.date().optional().nullable(),
  completedAt: z.date().optional().nullable(),
  errorMessage: z
    .string()
    .max(1000, "Error message too long")
    .optional()
    .nullable(),
  retryCount: z
    .number()
    .int()
    .min(0, "Retry count cannot be negative")
    .default(0),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const selectActivityELOStatusSchema = z.object({
  activityId: z.string().uuid(),
  status: z.enum(["pending", "calculating", "completed", "error"]),
  lockedBy: z.string().nullable(),
  lockedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  errorMessage: z.string().nullable(),
  retryCount: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const updateActivityELOStatusSchema =
  insertActivityELOStatusSchema.partial();

// ====================================
// POST SCHEMAS
// ====================================

export const insertPostSchema = z.object({
  id: z.string().uuid().optional(),
  publicId: z.string().uuid().optional(),
  activityId: z.string().uuid().optional().nullable(),
  userId: z.string().uuid(),
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title too long")
    .optional()
    .nullable(),
  content: z
    .string()
    .min(1, "Content is required")
    .max(5000, "Content too long"),
  postType: z
    .enum(["activity_recap", "skill_milestone", "general"])
    .default("general"),
  skillHighlights: z.record(z.string(), z.any()).optional().nullable(),
  visibility: z.enum(["public", "friends", "private"]).default("public"),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const selectPostSchema = z.object({
  id: z.string().uuid(),
  publicId: z.string().uuid(),
  activityId: z.string().uuid().nullable(),
  userId: z.string().uuid(),
  title: z.string().nullable(),
  content: z.string(),
  postType: z.enum(["activity_recap", "skill_milestone", "general"]),
  skillHighlights: z.record(z.string(), z.any()).nullable(),
  visibility: z.enum(["public", "friends", "private"]),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const updatePostSchema = insertPostSchema.partial();

export const createPostSchema = z.object({
  activityId: z.string().uuid("Invalid activity ID").optional(),
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title too long")
    .optional(),
  content: z
    .string()
    .min(1, "Content is required")
    .max(5000, "Content too long"),
  postType: z
    .enum(["activity_recap", "skill_milestone", "general"])
    .default("general"),
  skillHighlights: z.record(z.string(), z.any()).optional(),
  visibility: z.enum(["public", "friends", "private"]).default("public"),
});

// ====================================
// TEAM SCHEMAS
// ====================================

export const insertTeamSchema = z.object({
  id: z.string().uuid().optional(),
  publicId: z.string().uuid().optional(),
  name: z
    .string()
    .min(1, "Team name is required")
    .max(100, "Team name too long"),
  logoUrl: z
    .string()
    .url("Invalid logo URL")
    .max(500, "Logo URL too long")
    .optional()
    .nullable(),
  description: z
    .string()
    .max(1000, "Description too long")
    .optional()
    .nullable(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const selectTeamSchema = z.object({
  id: z.string().uuid(),
  publicId: z.string().uuid(),
  name: z.string(),
  logoUrl: z.string().nullable(),
  description: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const updateTeamSchema = insertTeamSchema.partial();

export const insertTeamMemberSchema = z.object({
  id: z.string().uuid().optional(),
  teamId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.string().max(50, "Role name too long").default("member"),
  joinedAt: z.date().optional(),
});

export const selectTeamMemberSchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.string(),
  joinedAt: z.date(),
});

export const updateTeamMemberSchema = insertTeamMemberSchema.partial();

export const addTeamMemberSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  role: z.string().max(50, "Role name too long").default("member"),
});

// ====================================
// CHAT SYSTEM SCHEMAS
// ====================================

export const insertChatRoomSchema = z.object({
  id: z.string().uuid().optional(),
  publicId: z.string().uuid().optional(),
  name: z
    .string()
    .min(1, "Room name is required")
    .max(100, "Room name too long"),
  description: z
    .string()
    .max(1000, "Description too long")
    .optional()
    .nullable(),
  isPrivate: z.boolean().default(false),
  createdById: z.string().uuid(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const selectChatRoomSchema = z.object({
  id: z.string().uuid(),
  publicId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  isPrivate: z.boolean(),
  createdById: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const updateChatRoomSchema = insertChatRoomSchema.partial();

export const insertMessageSchema = z.object({
  id: z.string().uuid().optional(),
  publicId: z.string().uuid().optional(),
  roomId: z.string().uuid(),
  senderId: z.string().uuid(),
  content: z
    .string()
    .min(1, "Message content is required")
    .max(5000, "Message too long"),
  messageType: z.string().max(50, "Message type too long").default("text"),
  metadata: z.record(z.string(), z.any()).optional().nullable(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const selectMessageSchema = z.object({
  id: z.string().uuid(),
  publicId: z.string().uuid(),
  roomId: z.string().uuid(),
  senderId: z.string().uuid(),
  content: z.string(),
  messageType: z.string(),
  metadata: z.record(z.string(), z.any()).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const updateMessageSchema = insertMessageSchema.partial();

export const insertRoomMemberSchema = z.object({
  id: z.string().uuid().optional(),
  roomId: z.string().uuid(),
  userId: z.string().uuid(),
  joinedAt: z.date().optional(),
  isAdmin: z.boolean().default(false),
});

export const selectRoomMemberSchema = z.object({
  id: z.string().uuid(),
  roomId: z.string().uuid(),
  userId: z.string().uuid(),
  joinedAt: z.date(),
  isAdmin: z.boolean(),
});

export const updateRoomMemberSchema = insertRoomMemberSchema.partial();

// ====================================
// ACTIVITY CHAT SCHEMAS
// ====================================

export const insertActivityChatRoomSchema = z.object({
  id: z.string().uuid().optional(),
  publicId: z.string().uuid().optional(),
  activityId: z.string().uuid(),
  name: z
    .string()
    .min(1, "Chat room name is required")
    .max(200, "Chat room name too long"),
  description: z
    .string()
    .max(1000, "Description too long")
    .optional()
    .nullable(),
  isActive: z.boolean().default(true),
  autoDeleteAfterHours: z
    .number()
    .int()
    .positive("Auto delete hours must be positive")
    .optional()
    .nullable(),
  deletedAt: z.date().optional().nullable(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const selectActivityChatRoomSchema = z.object({
  id: z.string().uuid(),
  publicId: z.string().uuid(),
  activityId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  autoDeleteAfterHours: z.number().int().nullable(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const updateActivityChatRoomSchema =
  insertActivityChatRoomSchema.partial();

export const insertActivityChatMessageSchema = z.object({
  id: z.string().uuid().optional(),
  publicId: z.string().uuid().optional(),
  chatRoomId: z.string().uuid(),
  senderId: z.string().uuid(),
  content: z
    .string()
    .min(1, "Message content is required")
    .max(5000, "Message too long"),
  messageType: z.enum(["text", "system", "image", "file"]).default("text"),
  metadata: z.record(z.string(), z.any()).optional().nullable(),
  isEdited: z.boolean().default(false),
  editedAt: z.date().optional().nullable(),
  deletedAt: z.date().optional().nullable(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const selectActivityChatMessageSchema = z.object({
  id: z.string().uuid(),
  publicId: z.string().uuid(),
  chatRoomId: z.string().uuid(),
  senderId: z.string().uuid(),
  content: z.string(),
  messageType: z.enum(["text", "system", "image", "file"]),
  metadata: z.record(z.string(), z.any()).nullable(),
  isEdited: z.boolean(),
  editedAt: z.date().nullable(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const updateActivityChatMessageSchema =
  insertActivityChatMessageSchema.partial();

export const sendActivityChatMessageSchema = z.object({
  content: z
    .string()
    .min(1, "Message content is required")
    .max(5000, "Message too long"),
  messageType: z.enum(["text", "system", "image", "file"]).default("text"),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const insertActivityChatReadStatusSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().uuid(),
  chatRoomId: z.string().uuid(),
  lastReadMessageId: z.string().uuid().optional().nullable(),
  unreadCount: z
    .number()
    .int()
    .min(0, "Unread count cannot be negative")
    .default(0),
  lastReadAt: z.date().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const selectActivityChatReadStatusSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  chatRoomId: z.string().uuid(),
  lastReadMessageId: z.string().uuid().nullable(),
  unreadCount: z.number().int(),
  lastReadAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const updateActivityChatReadStatusSchema =
  insertActivityChatReadStatusSchema.partial();

// ====================================
// API REQUEST/RESPONSE SCHEMAS
// ====================================

// Delta polling schema
export const deltaQuerySchema = z.object({
  since: z.string().pipe(z.coerce.date()).optional(),
  entityTypes: z
    .array(
      z.enum(["elo", "activity", "skill_rating", "connection", "matchmaking"])
    )
    .optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

// Pagination schema
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Search schema
export const searchActivitiesSchema = z.object({
  ...paginationSchema.shape,
  activityTypeId: z.string().uuid().optional(),
  location: z.string().max(100).optional(),
  dateFrom: z.string().pipe(z.coerce.date()).optional(),
  dateTo: z.string().pipe(z.coerce.date()).optional(),
  creatorId: z.string().uuid().optional(),
  status: z.enum(['scheduled', 'active', 'completed', 'cancelled']).optional(),
  participationStatus: z
    .enum(["pending", "accepted", "declined", "rated"])
    .optional(),
  search: z.string().max(100).optional(),
  sortBy: z.enum(["date", "created", "elo", "participants"]).default("date"), // Added missing property
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  eloRange: z
    .object({
      min: z.number().int().min(0).optional(),
      max: z.number().int().min(0).optional(),
    })
    .optional(),
    includeParticipants: z.boolean().default(false),
  includeCreator: z.boolean().default(false),
  myActivities: z.boolean().default(false),
  myParticipation: z.boolean().default(false)
});

// Leaderboard schema
export const leaderboardQuerySchema = z
  .object({
    activityTypeId: z.string().uuid("Invalid activity type ID").optional(),
    skillDefinitionId: z
      .string()
      .uuid("Invalid skill definition ID")
      .optional(),
    period: z
      .enum(["all_time", "season", "monthly", "weekly"])
      .default("all_time"),
    minGamesPlayed: z.number().int().min(0).default(5),
  })
  .merge(paginationSchema);

// User profile query schema
export const userProfileQuerySchema = z.object({
  includeELO: z.boolean().default(true),
  includeSkills: z.boolean().default(true),
  includeRecentActivities: z.boolean().default(true),
  includeConnections: z.boolean().default(false),
  activityTypeId: z.string().uuid("Invalid activity type ID").optional(),
});

// ====================================
// TYPE EXPORTS
// ====================================

// Core Types
export type User = z.infer<typeof selectUserSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type LoginUser = z.infer<typeof loginUserSchema>;
export type RegisterUser = z.infer<typeof registerUserSchema>;

export type UserConnection = z.infer<typeof selectUserConnectionSchema>;
export type InsertUserConnection = z.infer<typeof insertUserConnectionSchema>;
export type UpdateUserConnection = z.infer<typeof updateUserConnectionSchema>;
export type CreateConnectionRequest = z.infer<
  typeof createConnectionRequestSchema
>;

export type ActivityType = z.infer<typeof selectActivityTypeSchema>;
export type InsertActivityType = z.infer<typeof insertActivityTypeSchema>;
export type UpdateActivityType = z.infer<typeof updateActivityTypeSchema>;

export type Activity = z.infer<typeof selectActivitySchema>;
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type UpdateActivity = z.infer<typeof updateActivitySchema>;
export type CreateActivity = z.infer<typeof createActivitySchema>;

export type ActivityParticipant = z.infer<
  typeof selectActivityParticipantSchema
>;
export type InsertActivityParticipant = z.infer<
  typeof insertActivityParticipantSchema
>;
export type UpdateActivityParticipant = z.infer<
  typeof updateActivityParticipantSchema
>;
export type JoinActivity = z.infer<typeof joinActivitySchema>;
export type CompleteActivity = z.infer<typeof completeActivitySchema>;

// Skill Types
export type SkillDefinition = z.infer<typeof selectSkillDefinitionSchema>;
export type InsertSkillDefinition = z.infer<typeof insertSkillDefinitionSchema>;
export type UpdateSkillDefinition = z.infer<typeof updateSkillDefinitionSchema>;

export type ActivityTypeSkill = z.infer<typeof selectActivityTypeSkillSchema>;
export type InsertActivityTypeSkill = z.infer<
  typeof insertActivityTypeSkillSchema
>;
export type UpdateActivityTypeSkill = z.infer<
  typeof updateActivityTypeSkillSchema
>;

export type UserActivitySkillRating = z.infer<
  typeof selectUserActivitySkillRatingSchema
>;
export type InsertUserActivitySkillRating = z.infer<
  typeof insertUserActivitySkillRatingSchema
>;
export type UpdateUserActivitySkillRating = z.infer<
  typeof updateUserActivitySkillRatingSchema
>;
export type SubmitSkillRatings = z.infer<typeof submitSkillRatingsSchema>;

export type UserActivityTypeSkillSummary = z.infer<
  typeof selectUserActivityTypeSkillSummarySchema
>;
export type InsertUserActivityTypeSkillSummary = z.infer<
  typeof insertUserActivityTypeSkillSummarySchema
>;
export type UpdateUserActivityTypeSkillSummary = z.infer<
  typeof updateUserActivityTypeSkillSummarySchema
>;

export type UserGeneralSkillSummary = z.infer<
  typeof selectUserGeneralSkillSummarySchema
>;
export type InsertUserGeneralSkillSummary = z.infer<
  typeof insertUserGeneralSkillSummarySchema
>;
export type UpdateUserGeneralSkillSummary = z.infer<
  typeof updateUserGeneralSkillSummarySchema
>;

// ELO Types
export type UserActivityTypeELO = z.infer<
  typeof selectUserActivityTypeELOSchema
>;
export type InsertUserActivityTypeELO = z.infer<
  typeof insertUserActivityTypeELOSchema
>;
export type UpdateUserActivityTypeELO = z.infer<
  typeof updateUserActivityTypeELOSchema
>;

export type ActivityELOStatus = z.infer<typeof selectActivityELOStatusSchema>;
export type InsertActivityELOStatus = z.infer<
  typeof insertActivityELOStatusSchema
>;
export type UpdateActivityELOStatus = z.infer<
  typeof updateActivityELOStatusSchema
>;

// Social Types
export type Post = z.infer<typeof selectPostSchema>;
export type InsertPost = z.infer<typeof insertPostSchema>;
export type UpdatePost = z.infer<typeof updatePostSchema>;
export type CreatePost = z.infer<typeof createPostSchema>;

// Team Types
export type Team = z.infer<typeof selectTeamSchema>;
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type UpdateTeam = z.infer<typeof updateTeamSchema>;

export type TeamMember = z.infer<typeof selectTeamMemberSchema>;
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type UpdateTeamMember = z.infer<typeof updateTeamMemberSchema>;
export type AddTeamMember = z.infer<typeof addTeamMemberSchema>;

// Chat Types
export type ChatRoom = z.infer<typeof selectChatRoomSchema>;
export type InsertChatRoom = z.infer<typeof insertChatRoomSchema>;
export type UpdateChatRoom = z.infer<typeof updateChatRoomSchema>;

export type Message = z.infer<typeof selectMessageSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type UpdateMessage = z.infer<typeof updateMessageSchema>;

export type RoomMember = z.infer<typeof selectRoomMemberSchema>;
export type InsertRoomMember = z.infer<typeof insertRoomMemberSchema>;
export type UpdateRoomMember = z.infer<typeof updateRoomMemberSchema>;

export type ActivityChatRoom = z.infer<typeof selectActivityChatRoomSchema>;
export type InsertActivityChatRoom = z.infer<
  typeof insertActivityChatRoomSchema
>;
export type UpdateActivityChatRoom = z.infer<
  typeof updateActivityChatRoomSchema
>;

export type ActivityChatMessage = z.infer<
  typeof selectActivityChatMessageSchema
>;
export type InsertActivityChatMessage = z.infer<
  typeof insertActivityChatMessageSchema
>;
export type UpdateActivityChatMessage = z.infer<
  typeof updateActivityChatMessageSchema
>;
export type SendActivityChatMessage = z.infer<
  typeof sendActivityChatMessageSchema
>;

export type ActivityChatReadStatus = z.infer<
  typeof selectActivityChatReadStatusSchema
>;
export type InsertActivityChatReadStatus = z.infer<
  typeof insertActivityChatReadStatusSchema
>;
export type UpdateActivityChatReadStatus = z.infer<
  typeof updateActivityChatReadStatusSchema
>;

// API Types
export type DeltaQuery = z.infer<typeof deltaQuerySchema>;
export type Pagination = z.infer<typeof paginationSchema>;
export type SearchActivities = z.infer<typeof searchActivitiesSchema>;
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;
export type UserProfileQuery = z.infer<typeof userProfileQuerySchema>;

// ====================================
// UTILITY SCHEMAS
// ====================================

// Common response wrapper
export const apiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
    message: z.string().optional(),
    pagination: z
      .object({
        page: z.number().int(),
        limit: z.number().int(),
        total: z.number().int(),
        totalPages: z.number().int(),
      })
      .optional(),
  });

// Error response schema
export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  message: z.string().optional(),
  details: z.record(z.string(), z.any()).optional(),
});

// Success response schema
export const successResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    message: z.string().optional(),
  });

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type SuccessResponse<T> = {
  success: true;
  data: T;
  message?: string;
};

// ====================================
// VALIDATION HELPERS
// ====================================

// Helper function to validate and parse data
export function validateSchema<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return { success: false, error: errorMessage };
    }
    return { success: false, error: "Unknown validation error" };
  }
}

// Helper function to safely parse data with fallback
export function safeParseSchema<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  fallback: T
): T {
  try {
    return schema.parse(data);
  } catch {
    return fallback;
  }
}

// ====================================
// SHARED CONSTANTS
// ====================================

export const USER_ROLES = [
  "admin",
  "user",
  "moderator",
  "deactivated",
] as const;
export const CONNECTION_STATUSES = ["pending", "accepted", "rejected"] as const;
export const PARTICIPANT_STATUSES = [
  "pending",
  "accepted",
  "declined",
  "rated",
] as const;
export const SKILL_TYPES = [
  "physical",
  "technical",
  "mental",
  "tactical",
] as const;
export const ACTIVITY_CATEGORIES = [
  "team_sports",
  "individual_sports",
  "fitness",
  "mind_body",
  "combat_sports",
  "outdoor_activities",
] as const;
export const COMPLETION_STATUSES = [
  "scheduled",
  "active",
  "completed",
  "cancelled",
] as const;
export const FINAL_RESULTS = ["win", "loss", "draw"] as const;
export const ELO_STATUSES = [
  "pending",
  "calculating",
  "completed",
  "error",
] as const;
export const POST_TYPES = [
  "activity_recap",
  "skill_milestone",
  "general",
] as const;
export const VISIBILITY_LEVELS = ["public", "friends", "private"] as const;
export const MESSAGE_TYPES = ["text", "system", "image", "file"] as const;

// Rating scales
export const RATING_SCALE_MIN = 1;
export const RATING_SCALE_MAX = 10;
export const CONFIDENCE_SCALE_MIN = 1;
export const CONFIDENCE_SCALE_MAX = 5;

// ELO constants
export const DEFAULT_ELO_SCORE = 1200;
export const DEFAULT_VOLATILITY = 350;
export const MIN_ELO_SCORE = 0;

// Limits
export const MAX_USERNAME_LENGTH = 50;
export const MAX_ACTIVITY_DESCRIPTION_LENGTH = 1000;
export const MAX_LOCATION_LENGTH = 200;
export const MAX_POST_CONTENT_LENGTH = 5000;
export const MAX_COMMENT_LENGTH = 500;
export const MAX_TEAM_NAME_LENGTH = 50;
export const MAX_MESSAGE_LENGTH = 5000;

// Default pagination
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
