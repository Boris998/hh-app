// src/db/zod.schema.ts - Fixed Zod schema compatibility
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import {
  users,
  activityTypes, // NEW
  activities,
  activityParticipants,
} from './schema.js';

// Re-export ActivityTypes schemas from dedicated file
export * from './activity-types.schema.js';

// User Schemas - Fixed syntax
export const insertUserSchema = createInsertSchema(users, {
  email: (schema) => schema.email(),
  username: (schema) => schema.min(3).max(50),
  passwordHash: (schema) => schema.min(8).optional(),
  avatarUrl: (schema) => schema.url().optional(),
});
export const selectUserSchema = createSelectSchema(users);
export const updateUserSchema = insertUserSchema.partial();

// User Connection Schemas
export const insertUserConnectionSchema = createInsertSchema(userConnections);
export const selectUserConnectionSchema = createSelectSchema(userConnections);
export const updateUserConnectionSchema = insertUserConnectionSchema.partial();

// Activity Schemas - UPDATED to include new fields with fixed syntax
export const insertActivitySchema = createInsertSchema(activities, {
  description: (schema) => schema.max(1000).optional(),
  location: (schema) => schema.max(200).optional(),
  dateTime: () => z.union([z.date(), z.string().pipe(z.coerce.date())]),
  maxParticipants: (schema) => schema.int().positive().optional(),
  eloLevel: (schema) => schema.int().positive().optional(),
  skillRequirements: () => z.record(z.string(), z.number()).optional(), // skill_id -> minimum_rating
  isELORated: () => z.boolean().default(true),
  completionStatus: () => z.enum(['scheduled', 'active', 'completed', 'cancelled']).default('scheduled'),
});
export const selectActivitySchema = createSelectSchema(activities);
export const updateActivitySchema = insertActivitySchema.partial();

// Activity Participant Schemas - UPDATED with new fields and fixed syntax
export const insertActivityParticipantSchema = createInsertSchema(activityParticipants, {
  team: (schema) => schema.max(50).optional(),
  finalResult: () => z.enum(['win', 'loss', 'draw']).optional(),
  performanceNotes: (schema) => schema.max(1000).optional(),
});
export const selectActivityParticipantSchema = createSelectSchema(activityParticipants);
export const updateActivityParticipantSchema = insertActivityParticipantSchema.partial();

// Skill Definition Schemas (for future use)
export const insertSkillDefinitionSchema = createInsertSchema(skillDefinitions, {
  name: (schema) => schema.min(3).max(100),
});
export const selectSkillDefinitionSchema = createSelectSchema(skillDefinitions);
export const updateSkillDefinitionSchema = insertSkillDefinitionSchema.partial();

// Activity Type Skill Schemas (for future use)
export const insertActivityTypeSkillSchema = createInsertSchema(activityTypeSkills);
export const selectActivityTypeSkillSchema = createSelectSchema(activityTypeSkills);
export const updateActivityTypeSkillSchema = insertActivityTypeSkillSchema.partial();

// User Activity Skill Rating Schemas (for future use)
export const insertUserActivitySkillRatingSchema = createInsertSchema(userActivitySkillRatings, {
  ratingValue: (schema) => schema.int().min(1).max(10),
});
export const selectUserActivitySkillRatingSchema = createSelectSchema(userActivitySkillRatings);
export const updateUserActivitySkillRatingSchema = insertUserActivitySkillRatingSchema.partial();

// User Activity Type Skill Summary Schemas (for future use)
export const insertUserActivityTypeSkillSummarySchema = createInsertSchema(userActivityTypeSkillSummaries, {
  averageRating: (schema) => schema.min(1).max(10),
});
export const selectUserActivityTypeSkillSummarySchema = createSelectSchema(userActivityTypeSkillSummaries);
export const updateUserActivityTypeSkillSummarySchema = insertUserActivityTypeSkillSummarySchema.partial();

// User General Skill Summary Schemas (for future use)
export const insertUserGeneralSkillSummarySchema = createInsertSchema(userGeneralSkillSummaries, {
  overallAverageRating: (schema) => schema.min(1).max(10),
});
export const selectUserGeneralSkillSummarySchema = createSelectSchema(userGeneralSkillSummaries);
export const updateUserGeneralSkillSummarySchema = insertUserGeneralSkillSummarySchema.partial();

// User Activity Type ELO Schemas (for future use)
export const insertUserActivityTypeELOSchema = createInsertSchema(userActivityTypeELOs, {
  eloScore: (schema) => schema.int().min(0),
});
export const selectUserActivityTypeELOSchema = createSelectSchema(userActivityTypeELOs);
export const updateUserActivityTypeELOSchema = insertUserActivityTypeELOSchema.partial();

// Post Schemas
export const insertPostSchema = createInsertSchema(posts, {
  title: (schema) => schema.min(3).max(100),
  content: (schema) => schema.min(10).max(5000),
});
export const selectPostSchema = createSelectSchema(posts);
export const updatePostSchema = insertPostSchema.partial();

// Enhanced Activity Creation Schema with ActivityType validation
export const createActivityWithTypeSchema = insertActivitySchema.extend({
  activityTypeId: z.string().uuid('Invalid activity type ID'),
});

// Enhanced Activity Participant Schema with Team assignment
export const joinActivitySchema = z.object({
  team: z.string().max(50).optional(),
  message: z.string().max(500).optional(), // Optional message when joining
});

// Activity Completion Schema for updating results
export const completeActivitySchema = z.object({
  participantResults: z.array(z.object({
    userId: z.string().uuid(),
    finalResult: z.enum(['win', 'loss', 'draw']),
    performanceNotes: z.string().max(1000).optional(),
  })),
  completionNotes: z.string().max(1000).optional(),
});

// Type exports
export type User = z.infer<typeof selectUserSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;

export type UserConnection = z.infer<typeof selectUserConnectionSchema>;
export type InsertUserConnection = z.infer<typeof insertUserConnectionSchema>;
export type UpdateUserConnection = z.infer<typeof updateUserConnectionSchema>;

export type Activity = z.infer<typeof selectActivitySchema>;
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type UpdateActivity = z.infer<typeof updateActivitySchema>;
export type CreateActivityWithType = z.infer<typeof createActivityWithTypeSchema>;

export type ActivityParticipant = z.infer<typeof selectActivityParticipantSchema>;
export type InsertActivityParticipant = z.infer<typeof insertActivityParticipantSchema>;
export type UpdateActivityParticipant = z.infer<typeof updateActivityParticipantSchema>;
export type JoinActivity = z.infer<typeof joinActivitySchema>;
export type CompleteActivity = z.infer<typeof completeActivitySchema>;

export type SkillDefinition = z.infer<typeof selectSkillDefinitionSchema>;
export type InsertSkillDefinition = z.infer<typeof insertSkillDefinitionSchema>;
export type UpdateSkillDefinition = z.infer<typeof updateSkillDefinitionSchema>;

export type ActivityTypeSkill = z.infer<typeof selectActivityTypeSkillSchema>;
export type InsertActivityTypeSkill = z.infer<typeof insertActivityTypeSkillSchema>;
export type UpdateActivityTypeSkill = z.infer<typeof updateActivityTypeSkillSchema>;

export type UserActivitySkillRating = z.infer<typeof selectUserActivitySkillRatingSchema>;
export type InsertUserActivitySkillRating = z.infer<typeof insertUserActivitySkillRatingSchema>;
export type UpdateUserActivitySkillRating = z.infer<typeof updateUserActivitySkillRatingSchema>;

export type UserActivityTypeSkillSummary = z.infer<typeof selectUserActivityTypeSkillSummarySchema>;
export type InsertUserActivityTypeSkillSummary = z.infer<typeof insertUserActivityTypeSkillSummarySchema>;
export type UpdateUserActivityTypeSkillSummary = z.infer<typeof updateUserActivityTypeSkillSummarySchema>;

export type UserGeneralSkillSummary = z.infer<typeof selectUserGeneralSkillSummarySchema>;
export type InsertUserGeneralSkillSummary = z.infer<typeof insertUserGeneralSkillSummarySchema>;
export type UpdateUserGeneralSkillSummary = z.infer<typeof updateUserGeneralSkillSummarySchema>;

export type UserActivityTypeELO = z.infer<typeof selectUserActivityTypeELOSchema>;
export type InsertUserActivityTypeELO = z.infer<typeof insertUserActivityTypeELOSchema>;
export type UpdateUserActivityTypeELO = z.infer<typeof updateUserActivityTypeELOSchema>;

export type Post = z.infer<typeof selectPostSchema>;
export type InsertPost = z.infer<typeof insertPostSchema>;
export type UpdatePost = z.infer<typeof updatePostSchema>;