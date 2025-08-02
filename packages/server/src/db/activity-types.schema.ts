// src/db/activity-types.schema.ts - Simplified version
import { z } from 'zod';

// Skill Category Schema
export const skillCategorySchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Category name is required'),
  description: z.string().optional(),
  skills: z.array(z.string()).min(1, 'At least one skill required per category'),
  weight: z.number().min(0).max(1).default(1),
  displayOrder: z.number().default(0)
});

// Default ELO Settings Schema
export const defaultELOSettingsSchema = z.object({
  startingELO: z.number().min(800).max(2000).default(1200),
  kFactor: z.object({
    new: z.number().min(16).max(64).default(40),
    established: z.number().min(8).max(32).default(20),
    expert: z.number().min(4).max(24).default(16)
  }),
  provisionalGames: z.number().min(5).max(50).default(30),
  minimumParticipants: z.number().min(1).max(20).default(2),
  skillInfluence: z.number().min(0).max(1),
  teamBased: z.boolean().default(false),
  eloRanges: z.object({
    beginner: z.object({ min: z.number(), max: z.number() }),
    intermediate: z.object({ min: z.number(), max: z.number() }),
    advanced: z.object({ min: z.number(), max: z.number() }),
    expert: z.object({ min: z.number(), max: z.number() })
  }).optional(),
  allowDraws: z.boolean().default(false),
  specialRules: z.record(z.any()).optional()
});

// Activity Category enum
export const activityCategoryEnum = z.enum([
  'team_sports', 
  'individual_sports', 
  'fitness', 
  'mind_body', 
  'combat_sports',
  'outdoor_activities'
]);

// Manual ActivityType schemas (avoiding drizzle-zod compatibility issues)
export const createActivityTypeRequestSchema = z.object({
  name: z.string()
    .min(3, 'Activity name must be at least 3 characters')
    .max(100, 'Activity name too long')
    .regex(/^[a-zA-Z0-9\s\-]+$/, 'Activity name contains invalid characters'),
  
  description: z.string()
    .max(500, 'Description too long')
    .optional(),
  
  category: activityCategoryEnum,
  
  isSoloPerformable: z.boolean().default(false),
  
  skillCategories: z.array(skillCategorySchema)
    .min(1, 'At least one skill category required')
    .max(10, 'Too many skill categories'),
  
  defaultELOSettings: defaultELOSettingsSchema,
  
  iconUrl: z.string()
    .url('Invalid icon URL')
    .max(500, 'Icon URL too long')
    .optional(),
  
  displayOrder: z.number()
    .int('Display order must be integer')
    .min(0)
    .default(0)
});

export const updateActivityTypeRequestSchema = createActivityTypeRequestSchema.partial();

// Type exports for TypeScript
export type CreateActivityTypeRequest = z.infer<typeof createActivityTypeRequestSchema>;
export type UpdateActivityTypeRequest = z.infer<typeof updateActivityTypeRequestSchema>;
export type SkillCategory = z.infer<typeof skillCategorySchema>;
export type DefaultELOSettings = z.infer<typeof defaultELOSettingsSchema>;
export type ActivityCategory = z.infer<typeof activityCategoryEnum>;

// Validation helper functions
export const validateSkillCategories = (categories: unknown) => {
  try {
    return z.array(skillCategorySchema).parse(categories);
  } catch (error) {
    throw new Error(`Invalid skill categories: ${error}`);
  }
};

export const validateELOSettings = (settings: unknown) => {
  try {
    return defaultELOSettingsSchema.parse(settings);
  } catch (error) {
    throw new Error(`Invalid ELO settings: ${error}`);
  }
};