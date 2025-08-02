// src/routes/team.router.ts - Updated to use fixed schemas
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { teams } from '../db/schema.js';
import { authenticateToken } from '../middleware/auth.js';
import { insertTeamSchema, updateTeamSchema } from '../db/team-schema.js';

export const teamRouter = new Hono();

// GET /teams - List all teams
teamRouter.get('/', async (c) => {
  try {
    const allTeams = await db.select().from(teams);
    
    return c.json({
      status: 'success',
      data: { teams: allTeams },
    });
  } catch (error) {
    console.error('Error fetching teams:', error);
    return c.json({ error: 'Failed to fetch teams' }, 500);
  }
});

// POST /teams - Create new team
teamRouter.post('/',
  authenticateToken,
  zValidator('json', insertTeamSchema),
  async (c) => {
    try {
      const teamData = c.req.valid('json');
      
      const [newTeam] = await db
        .insert(teams)
        .values({
          name: teamData.name,
          logoUrl: teamData.logoUrl || null,
          description: teamData.description || null,
        })
        .returning();

      return c.json({
        status: 'success',
        data: { team: newTeam },
        message: 'Team created successfully',
      }, 201);
    } catch (error) {
      console.error('Error creating team:', error);
      return c.json({ error: 'Failed to create team' }, 500);
    }
  }
);

// GET /teams/:id - Get specific team
teamRouter.get('/:id', async (c) => {
  try {
    const teamId = c.req.param('id');
    
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (!team) {
      return c.json({ error: 'Team not found' }, 404);
    }

    return c.json({
      status: 'success',
      data: { team },
    });
  } catch (error) {
    console.error('Error fetching team:', error);
    return c.json({ error: 'Failed to fetch team' }, 500);
  }
});

// PUT /teams/:id - Update team
teamRouter.put('/:id',
  authenticateToken,
  zValidator('json', updateTeamSchema),
  async (c) => {
    try {
      const teamId = c.req.param('id');
      const updateData = c.req.valid('json');

      // Check if team exists
      const [existingTeam] = await db
        .select()
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1);

      if (!existingTeam) {
        return c.json({ error: 'Team not found' }, 404);
      }

      // Build update object with only provided fields
      const updateFields: Record<string, any> = {
        updatedAt: new Date(),
      };

      if (updateData.name !== undefined) {
        updateFields.name = updateData.name;
      }
      if (updateData.logoUrl !== undefined) {
        updateFields.logoUrl = updateData.logoUrl;
      }
      if (updateData.description !== undefined) {
        updateFields.description = updateData.description;
      }

      // Update the team
      const [updatedTeam] = await db
        .update(teams)
        .set(updateFields)
        .where(eq(teams.id, teamId))
        .returning();

      return c.json({
        status: 'success',
        data: { team: updatedTeam },
        message: 'Team updated successfully',
      });
    } catch (error) {
      console.error('Error updating team:', error);
      return c.json({ error: 'Failed to update team' }, 500);
    }
  }
);

// DELETE /teams/:id - Delete team
teamRouter.delete('/:id',
  authenticateToken,
  async (c) => {
    try {
      const teamId = c.req.param('id');
      const user = c.get('user');

      // Only admins can delete teams
      if (user.role !== 'admin') {
        return c.json({ error: 'Admin access required' }, 403);
      }

      // Check if team exists
      const [existingTeam] = await db
        .select()
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1);

      if (!existingTeam) {
        return c.json({ error: 'Team not found' }, 404);
      }

      // Delete the team
      await db
        .delete(teams)
        .where(eq(teams.id, teamId));

      return c.json({
        status: 'success',
        message: 'Team deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting team:', error);
      return c.json({ error: 'Failed to delete team' }, 500);
    }
  }
);