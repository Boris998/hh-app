// packages/server/src/repository/team.repo.ts
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { teams } from '../db/schema.js';
import type { InsertTeam, UpdateTeam } from '../db/zod.schema.js';

export const getTeams = async () => {
  return db.select().from(teams);
};

export const getTeam = async (id: string) => {
  return db.query.teams.findFirst({
    where: eq(teams.publicId, id),
    with: {
      players: true,
      homeMatches: true,
      awayMatches: true,
    },
  });
};

export const createTeam = async (team: InsertTeam) => {
  return db.insert(teams)
    .values(team)
    .returning()
    .then(res => res[0]);
};

export const updateTeam = async (id: string, team: UpdateTeam) => {
  return db.update(teams)
    .set(team)
    .where(eq(teams.publicId, id))
    .returning()
    .then(res => res[0]);
};

export const deleteTeam = async (id: string) => {
  return db.delete(teams)
    .where(eq(teams.publicId, id))
    .returning({ id: teams.publicId })
    .then(res => res[0]);
};