// packages/server/src/db/zod.schema.ts
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

import { teams, users, tournaments, matches } from '../db/schema.js';
import { NANO_ID_LENGTH } from '../utils/security.js';

export const insertTeamSchema = createInsertSchema(teams);
export const insertPlayerSchema = createInsertSchema(users);
export const insertTournamentSchema = createInsertSchema(tournaments);
export const insertMatchSchema = createInsertSchema(matches);

export const updateTeamSchema = insertTeamSchema.pick({
  name: true,
  logoUrl: true,
}).partial();

export const updatePlayerSchema = insertPlayerSchema.pick({
  name: true,
  position: true,
  teamId: true,
}).partial();

export const updateTournamentSchema = insertTournamentSchema.pick({
  name: true,
  startDate: true,
  endDate: true,
}).partial();

export const updateMatchSchema = insertMatchSchema.pick({
  tournamentId: true,
  homeTeamId: true,
  awayTeamId: true,
  date: true,
  location: true,
  status: true,
}).partial();

export const nanoIdSchema = z.string().length(NANO_ID_LENGTH);

export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type UpdateTeam = z.infer<typeof updateTeamSchema>;
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type UpdatePlayer = z.infer<typeof updatePlayerSchema>;
export type InsertTournament = z.infer<typeof insertTournamentSchema>;
export type UpdateTournament = z.infer<typeof updateTournamentSchema>;
export type InsertMatch = z.infer<typeof insertMatchSchema>;
export type UpdateMatch = z.infer<typeof updateMatchSchema>;