// src/routes/activity-types.router.ts - Working version with simplified validation
import { Hono } from 'hono';
import { eq, and, desc, asc } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { db } from '../db/client.js';
import { activityTypes } from '../db/schema.js';
import { 
  createActivityTypeRequestSchema,
  updateActivityTypeRequestSchema,
  type CreateActivityTypeRequest,
  type UpdateActivityTypeRequest
} from '../db/activity-types.schema.js';
import { authenticateToken } from '../middleware/auth.js';

export const activityTypesRouter = new Hono();

// GET /activity-types - Get all active activity types
activityTypesRouter.get('/', async (c) => {
  try {
    const includeInactive = c.req.query('include_inactive') === 'true';
    const category = c.req.query('category');
    
    // Build where conditions
    let whereConditions = [];
    
    if (!includeInactive) {
      whereConditions.push(eq(activityTypes.isActive, true));
    }
    
    if (category) {
      whereConditions.push(eq(activityTypes.category, category as any));
    }
    
    // Build and execute query
    let allActivityTypes;
    
    if (whereConditions.length > 0) {
      allActivityTypes = await db
        .select()
        .from(activityTypes)
        .where(and(...whereConditions))
        .orderBy(asc(activityTypes.displayOrder), asc(activityTypes.name));
    } else {
      allActivityTypes = await db
        .select()
        .from(activityTypes)
        .orderBy(asc(activityTypes.displayOrder), asc(activityTypes.name));
    }

    return c.json({
      status: 'success',
      data: {
        activityTypes: allActivityTypes,
        total: allActivityTypes.length
      }
    });
  } catch (error) {
    console.error('Error fetching activity types:', error);
    return c.json({ error: 'Failed to fetch activity types' }, 500);
  }
});

// GET /activity-types/:publicId - Get specific activity type
activityTypesRouter.get('/:publicId', async (c) => {
  try {
    const publicId = c.req.param('publicId');
    
    const activityType = await db
      .select()
      .from(activityTypes)
      .where(eq(activityTypes.publicId, publicId))
      .limit(1);
    
    if (activityType.length === 0) {
      return c.json({ error: 'Activity type not found' }, 404);
    }
    
    return c.json({
      status: 'success',
      data: { activityType: activityType[0] }
    });
  } catch (error) {
    console.error('Error fetching activity type:', error);
    return c.json({ error: 'Failed to fetch activity type' }, 500);
  }
});

// GET /activity-types/category/:category - Get activity types by category
activityTypesRouter.get('/category/:category', async (c) => {
  try {
    const category = c.req.param('category');
    
    const categoryActivityTypes = await db
      .select()
      .from(activityTypes)
      .where(and(
        eq(activityTypes.category, category as any),
        eq(activityTypes.isActive, true)
      ))
      .orderBy(asc(activityTypes.displayOrder), asc(activityTypes.name));
    
    return c.json({
      status: 'success',
      data: {
        category,
        activityTypes: categoryActivityTypes,
        total: categoryActivityTypes.length
      }
    });
  } catch (error) {
    console.error('Error fetching activity types by category:', error);
    return c.json({ error: 'Failed to fetch activity types by category' }, 500);
  }
});

// POST /activity-types - Create new activity type (Admin only)
activityTypesRouter.post(
  '/',
  authenticateToken,
  zValidator('json', createActivityTypeRequestSchema),
  async (c) => {
    try {
      const user = c.get('user');
      
      // Check if user has admin role
      if (user.role !== 'admin') {
        return c.json({ error: 'Only administrators can create activity types' }, 403);
      }
      
      const activityTypeData = c.req.valid('json') as CreateActivityTypeRequest;
      
      // Check for duplicate names
      const existingActivityType = await db
        .select({ id: activityTypes.id })
        .from(activityTypes)
        .where(eq(activityTypes.name, activityTypeData.name))
        .limit(1);
      
      if (existingActivityType.length > 0) {
        return c.json({ error: 'Activity type with this name already exists' }, 409);
      }
      
      const [newActivityType] = await db
        .insert(activityTypes)
        .values({
          ...activityTypeData,
          isActive: true
        })
        .returning();
      
      return c.json({
        status: 'success',
        data: { activityType: newActivityType },
        message: 'Activity type created successfully'
      }, 201);
    } catch (error) {
      console.error('Error creating activity type:', error);
      return c.json({ error: 'Failed to create activity type' }, 500);
    }
  }
);