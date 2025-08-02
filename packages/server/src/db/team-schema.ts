// src/db/team-schema.ts - Fixed version without drizzle-zod conflicts
import { z } from 'zod';

// Manual Zod schemas (avoiding drizzle-zod compatibility issues)
export const insertTeamSchema = z.object({
  name: z.string().min(1, 'Team name is required').max(100, 'Team name too long'),
  logoUrl: z.string().url('Invalid logo URL').max(500, 'Logo URL too long').nullable().optional(),
  description: z.string().max(1000, 'Description too long').optional(),
});

export const selectTeamSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  logoUrl: z.string().nullable(),
  description: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const updateTeamSchema = z.object({
  name: z.string().min(1, 'Team name is required').max(100, 'Team name too long').optional(),
  logoUrl: z.string().url('Invalid logo URL').max(500, 'Logo URL too long').nullable().optional(),
  description: z.string().max(1000, 'Description too long').optional(),
});

// API request/response types
export type CreateTeamRequest = z.infer<typeof insertTeamSchema>;
export type UpdateTeamRequest = z.infer<typeof updateTeamSchema>;
export type Team = z.infer<typeof selectTeamSchema>;