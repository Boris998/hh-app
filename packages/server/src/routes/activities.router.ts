// src/routes/activities.router.ts
import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/client';
import { activities, activityParticipants } from '../db/schema';
import { 
  insertActivitySchema, 
  updateActivitySchema,
  type InsertActivity,
  type UpdateActivity
} from '../db/zod.schema';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../middleware/validate-request';

export const activitiesRouter = new Hono();

// Create activity
activitiesRouter.post(
  '/',
  authenticateToken,
  validateRequest(insertActivitySchema),
  async (c) => {
    try {
      const activityData: InsertActivity = c.get('validatedBody');
      const userId = c.get('user').id;
      
      const [newActivity] = await db
        .insert(activities)
        .values({
          ...activityData,
          creatorId: userId,
        })
        .returning();
      
      // Auto-add creator as participant
      await db.insert(activityParticipants).values({
        activityId: newActivity.id,
        userId: userId,
        status: 'accepted',
      });
      
      return c.json(newActivity, 201);
    } catch (error) {
      return c.json({ error: 'Failed to create activity' }, 500);
    }
  }
);

// Get activity by ID
activitiesRouter.get('/:id', async (c) => {
  try {
    const activityId = c.req.param('id');
    const activity = await db
      .select()
      .from(activities)
      .where(eq(activities.id, activityId))
      .leftJoin(
        activityParticipants,
        eq(activities.id, activityParticipants.activityId)
      )
      .limit(1);
    
    if (!activity[0]) {
      return c.json({ error: 'Activity not found' }, 404);
    }
    
    return c.json({
      ...activity[0].activities,
      participants: activity.map(a => a.activity_participants).filter(Boolean),
    });
  } catch (error) {
    return c.json({ error: 'Failed to fetch activity' }, 500);
  }
});

// Update activity
activitiesRouter.put(
  '/:id',
  authenticateToken,
  validateRequest(updateActivitySchema),
  async (c) => {
    try {
      const activityId = c.req.param('id');
      const updateData: UpdateActivity = c.get('validatedBody');
      const userId = c.get('user').id;
      
      // Verify user is creator
      const existingActivity = await db
        .select()
        .from(activities)
        .where(
          and(
            eq(activities.id, activityId),
            eq(activities.creatorId, userId)
          )
        )
        .limit(1);
      
      if (!existingActivity[0]) {
        return c.json({ error: 'Activity not found or unauthorized' }, 404);
      }
      
      const [updatedActivity] = await db
        .update(activities)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(activities.id, activityId))
        .returning();
      
      return c.json(updatedActivity);
    } catch (error) {
      return c.json({ error: 'Failed to update activity' }, 500);
    }
  }
);

// Delete activity
activitiesRouter.delete('/:id', authenticateToken, async (c) => {
  try {
    const activityId = c.req.param('id');
    const userId = c.get('user').id;
    
    // Verify user is creator
    const existingActivity = await db
      .select()
      .from(activities)
      .where(
        and(
          eq(activities.id, activityId),
          eq(activities.creatorId, userId)
        )
      )
      .limit(1);
    
    if (!existingActivity[0]) {
      return c.json({ error: 'Activity not found or unauthorized' }, 404);
    }
    
    await db.delete(activities).where(eq(activities.id, activityId));
    
    return c.json({ message: 'Activity deleted successfully' });
  } catch (error) {
    return c.json({ error: 'Failed to delete activity' }, 500);
  }
});