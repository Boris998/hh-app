// packages/server/src/routes/team.router.ts
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { teams } from '../db/schema.js';
import { insertTeamSchema, updateTeamSchema, type CreateTeamRequest, type UpdateTeamRequest } from '../db/team-schema.js';
import { validateRequest } from '../middleware/validate-request.js';
import { authenticateToken } from '../middleware/auth.js';

export const teamRouter = new Hono();

// Get all teams
teamRouter.get('/', async (c) => {
  try {
    const allTeams = await db.select().from(teams);
    return c.json(allTeams);
  } catch (error) {
    return c.json({ error: 'Failed to fetch teams' }, 500);
  }
});

// Get team by public ID
teamRouter.get('/:publicId', async (c) => {
  try {
    const publicId = c.req.param('publicId');
    const team = await db
      .select()
      .from(teams)
      .where(eq(teams.publicId, publicId))
      .limit(1);
    
    if (team.length === 0) {
      return c.json({ error: 'Team not found' }, 404);
    }
    
    return c.json(team[0]);
  } catch (error) {
    return c.json({ error: 'Failed to fetch team' }, 500);
  }
});

// Create team
teamRouter.post(
  '/',
  authenticateToken,
  validateRequest(insertTeamSchema),
  async (c) => {
    try {
      const teamData: CreateTeamRequest = c.get('validatedBody');
      
      const [newTeam] = await db
        .insert(teams)
        .values(teamData)
        .returning();
      
      return c.json(newTeam, 201);
    } catch (error) {
      return c.json({ error: 'Failed to create team' }, 500);
    }
  }
);

// Update team
teamRouter.put(
  '/:publicId',
  authenticateToken,
  validateRequest(updateTeamSchema),
  async (c) => {
    try {
      const publicId = c.req.param('publicId');
      const updateData: UpdateTeamRequest = c.get('validatedBody');
      
      const [updatedTeam] = await db
        .update(teams)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(teams.publicId, publicId))
        .returning();
      
      if (!updatedTeam) {
        return c.json({ error: 'Team not found' }, 404);
      }
      
      return c.json(updatedTeam);
    } catch (error) {
      return c.json({ error: 'Failed to update team' }, 500);
    }
  }
);

// Delete team
teamRouter.delete('/:publicId', authenticateToken, async (c) => {
  try {
    const publicId = c.req.param('publicId');
    
    const [deletedTeam] = await db
      .delete(teams)
      .where(eq(teams.publicId, publicId))
      .returning();
    
    if (!deletedTeam) {
      return c.json({ error: 'Team not found' }, 404);
    }
    
    return c.json({ message: 'Team deleted successfully' });
  } catch (error) {
    return c.json({ error: 'Failed to delete team' }, 500);
  }
});