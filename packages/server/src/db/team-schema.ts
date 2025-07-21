// packages/server/src/db/team-schema.ts
import { z } from 'zod';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { teams } from './schema.js';

// Team schemas
export const insertTeamSchema = createInsertSchema(teams, {
  name: z.string().min(1, 'Team name is required').max(100, 'Team name too long'),
  logoUrl: z.string().url('Invalid logo URL').max(500, 'Logo URL too long').nullable().optional(),
});

export const selectTeamSchema = createSelectSchema(teams);

export const updateTeamSchema = insertTeamSchema
  .pick({
    name: true,
    logoUrl: true,
  })
  .partial();

// API request/response types
export type CreateTeamRequest = z.infer<typeof insertTeamSchema>;
export type UpdateTeamRequest = z.infer<typeof updateTeamSchema>;
export type Team = z.infer<typeof selectTeamSchema>;