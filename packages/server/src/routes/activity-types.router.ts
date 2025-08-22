// src/routes/activity-types.router.ts - Complete implementation with service integration

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth.js';
import { db } from '../db/client.js';
import {
  activityTypes,
  skillDefinitions,
  activityTypeSkills,
  userActivityTypeELOs,
  activities,
  activityParticipants,
  users,
} from '../db/schema.js';
import { eq, desc, asc, sql, count, avg, and } from 'drizzle-orm';
import {
  insertActivityTypeSchema,
  updateActivityTypeSchema,
  type InsertActivityType,
  type UpdateActivityType,
} from '../db/zod.schema.js';

export const activityTypesRouter = new Hono();

// Validation schemas
const getActivityTypesSchema = z.object({
  includeSkills: z.boolean().default(false),
  includeStats: z.boolean().default(false),
  sortBy: z.enum(['name', 'popularity', 'created']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

const createSkillMappingSchema = z.object({
  skillDefinitionId: z.string().uuid('Invalid skill definition ID'),
  isSpecificToActivityType: z.boolean().default(false),
  weight: z.number().min(0.1).max(2).default(1),
  displayOrder: z.number().int().min(0).default(0),
});

// GET /activity-types - Get all activity types
activityTypesRouter.get('/',
  zValidator('query', getActivityTypesSchema),
  async (c) => {
    try {
      const options = c.req.valid('query');

      console.log(`📋 Getting activity types with options:`, options);

      let orderByClause: any = undefined; // Use 'any' for simplicity, or derive the correct Drizzle type
      if (options.sortBy === 'name') {
        orderByClause = options.order === 'asc' 
          ? asc(activityTypes.name)
          : desc(activityTypes.name);
      } else if (options.sortBy === 'created') {
        orderByClause = options.order === 'asc'
          ? asc(activityTypes.createdAt)
          : desc(activityTypes.createdAt);
      }

      // Build base query
      let query = db
        .select({
          id: activityTypes.id,
          name: activityTypes.name,
          description: activityTypes.description,
          isSoloPerformable: activityTypes.isSoloPerformable,
          skillCategories: activityTypes.skillCategories,
          defaultELOSettings: activityTypes.defaultELOSettings,
          createdAt: activityTypes.createdAt,
          updatedAt: activityTypes.updatedAt,
        })
        .from(activityTypes);

      // Apply sorting
      if (orderByClause && options.sortBy !== 'popularity') {
         // @ts-ignore - Workaround for complex Drizzle type inference
         query = query.orderBy(orderByClause);
      }

      const activityTypesList = await query;

      // Add popularity sorting if requested (requires additional query)
      if (options.sortBy === 'popularity') {
        const popularityData = await db
          .select({
            activityTypeId: activities.activityTypeId,
            totalActivities: count(activities.id),
          })
          .from(activities)
          .groupBy(activities.activityTypeId);

        const popularityMap = new Map(
          popularityData.map(p => [p.activityTypeId, p.totalActivities])
        );

        activityTypesList.sort((a, b) => {
          const aCount = popularityMap.get(a.id) || 0;
          const bCount = popularityMap.get(b.id) || 0;
          return options.order === 'asc' ? aCount - bCount : bCount - aCount;
        });
      }

      // Enhance with additional data if requested
      const enhancedActivityTypes = await Promise.all(
        activityTypesList.map(async (activityType) => {
          const enhanced: any = { ...activityType };

          // Add skills if requested
          if (options.includeSkills) {
            const skills = await db
              .select({
                skillDefinitionId: activityTypeSkills.skillDefinitionId,
                skillName: skillDefinitions.skillType,
                isGeneral: skillDefinitions.isGeneral,
                isSpecificToActivityType: activityTypeSkills.isSpecificToActivityType,
                weight: activityTypeSkills.weight,
                displayOrder: activityTypeSkills.displayOrder,
              })
              .from(activityTypeSkills)
              .leftJoin(skillDefinitions, eq(activityTypeSkills.skillDefinitionId, skillDefinitions.id))
              .where(eq(activityTypeSkills.activityTypeId, activityType.id))
              .orderBy(asc(activityTypeSkills.displayOrder), asc(skillDefinitions.skillType));

            enhanced.skills = skills;
          }

          // Add statistics if requested
          if (options.includeStats) {
            const stats = await db
              .select({
                totalActivities: count(activities.id),
                averageParticipants: avg(sql<number>`(
                  SELECT COUNT(*) FROM ${activityParticipants} ap 
                  WHERE ap.activity_id = ${activities.id} AND ap.status = 'accepted'
                )`),
                activePlayersCount: sql<number>`COUNT(DISTINCT ${userActivityTypeELOs.userId})`,
                averageELO: avg(userActivityTypeELOs.eloScore),
              })
              .from(activities)
              .leftJoin(userActivityTypeELOs, eq(activities.activityTypeId, userActivityTypeELOs.activityTypeId))
              .where(eq(activities.activityTypeId, activityType.id));

            enhanced.statistics = stats[0];
          }

          return enhanced;
        })
      );

      return c.json({
        success: true,
        data: {
          activityTypes: enhancedActivityTypes,
          totalCount: enhancedActivityTypes.length,
        },
      });
    } catch (error) {
      console.error('Error getting activity types:', error);
      return c.json({
        success: false,
        error: 'Failed to get activity types',
      }, 500);
    }
  }
);

// GET /activity-types/:id - Get specific activity type
activityTypesRouter.get('/:id', async (c) => {
  try {
    const activityTypeId = c.req.param('id');

    console.log(`📋 Getting activity type: ${activityTypeId}`);

    // Get activity type
    const activityType = await db.query.activityTypes.findFirst({
      where: eq(activityTypes.id, activityTypeId),
    });

    if (!activityType) {
      return c.json({
        success: false,
        error: 'Activity type not found',
      }, 404);
    }

    // Get associated skills
    const skills = await db
      .select({
        skillDefinitionId: activityTypeSkills.skillDefinitionId,
        skillName: skillDefinitions.skillType,
        skillCategory: skillDefinitions.category,
        isGeneral: skillDefinitions.isGeneral,
        isSpecificToActivityType: activityTypeSkills.isSpecificToActivityType,
        weight: activityTypeSkills.weight,
        displayOrder: activityTypeSkills.displayOrder,
        description: skillDefinitions.description,
        ratingScale: skillDefinitions.ratingScaleMax,
      })
      .from(activityTypeSkills)
      .leftJoin(skillDefinitions, eq(activityTypeSkills.skillDefinitionId, skillDefinitions.id))
      .where(eq(activityTypeSkills.activityTypeId, activityTypeId))
      .orderBy(asc(activityTypeSkills.displayOrder), asc(skillDefinitions.skillType));

    // Get activity statistics
    const stats = await db
      .select({
        totalActivities: count(activities.id),
        upcomingActivities: sql<number>`COUNT(CASE WHEN ${activities.dateTime} > NOW() THEN 1 END)`,
        completedActivities: sql<number>`COUNT(CASE WHEN ${activities.dateTime} < NOW() THEN 1 END)`,
        averageParticipants: avg(sql<number>`(
          SELECT COUNT(*) FROM ${activityParticipants} ap 
          WHERE ap.activity_id = ${activities.id} AND ap.status = 'accepted'
        )`),
        activePlayersCount: sql<number>`COUNT(DISTINCT ${userActivityTypeELOs.userId})`,
        averageELO: avg(userActivityTypeELOs.eloScore),
        highestELO: sql<number>`MAX(${userActivityTypeELOs.eloScore})`,
        lowestELO: sql<number>`MIN(${userActivityTypeELOs.eloScore})`,
      })
      .from(activities)
      .leftJoin(userActivityTypeELOs, eq(activities.activityTypeId, userActivityTypeELOs.activityTypeId))
      .where(eq(activities.activityTypeId, activityTypeId));

    return c.json({
      success: true,
      data: {
        ...activityType,
        skills,
        statistics: stats[0],
      },
    });
  } catch (error) {
    console.error('Error getting activity type:', error);
    return c.json({
      success: false,
      error: 'Failed to get activity type',
    }, 500);
  }
});

// POST /activity-types - Create new activity type (admin only)
activityTypesRouter.post('/',
  authenticateToken,
  zValidator('json', insertActivityTypeSchema),
  async (c) => {
    try {
      const user = c.get('user');
      const activityTypeData = c.req.valid('json');

      // Check admin permission
      if (user.role !== 'admin') {
        return c.json({
          success: false,
          error: 'Admin access required',
        }, 403);
      }

      console.log(`✏️ Admin ${user.username} updating activity type: ${activityTypeData}`);

      // Check if name is being changed and if it conflicts
      const nameConflict = await db.query.activityTypes.findFirst({
        where: eq(activityTypes.name, activityTypeData.name)
      });

      if (nameConflict) {
        return c.json({
          success: false,
          error: 'Activity type with this name already exists',
        }, 400);
      }

      // Update activity type
      const [newActivityType] = await db
        .insert(activityTypes)
        .values({
          // id, publicId, createdAt will be auto-generated
          name: activityTypeData.name,
          description: activityTypeData.description,
          category: activityTypeData.category,
          isSoloPerformable: activityTypeData.isSoloPerformable,
          iconUrl: activityTypeData.iconUrl,
          skillCategories: activityTypeData.skillCategories,
          defaultELOSettings: activityTypeData.defaultELOSettings,
          displayOrder: activityTypeData.displayOrder,
          // updatedAt will be set by the .defaultNow() or the database trigger
        })
        .returning();

      return c.json({
        success: true,
        data: newActivityType,
        message: `Activity type "${newActivityType.name}" created successfully`,
      }, 201); 
    } catch (error) {
      console.error('Error creating activity type:', error);
      // Differentiate between validation errors and server errors if possible
      if (error instanceof z.ZodError) {
         return c.json({
            success: false,
            error: "Invalid activity type data",
            details: error.errors.map(err => ({ field: err.path.join('.'), message: err.message }))
         }, 400);
      }
      // Handle potential database errors like unique constraint violation more specifically if needed
      // For now, a generic 500 is returned for unexpected errors
      return c.json({
        success: false,
        error: 'Failed to create activity type',
      }, 500);
    }
  }
);

// PUT /activity-types/:id - Update activity type (admin only)
activityTypesRouter.put('/:id',
  authenticateToken,
  zValidator('json', updateActivityTypeSchema),
  async (c) => {
    try {
      const user = c.get('user');
      const activityTypeId = c.req.param('id');
      const updateData = c.req.valid('json');

      // Check admin permission
      if (user.role !== 'admin') {
        return c.json({
          success: false,
          error: 'Admin access required',
        }, 403);
      }

      console.log(`✏️ Admin ${user.username} updating activity type: ${activityTypeId}`);

      // Check if activity type exists
      const existingActivityType = await db.query.activityTypes.findFirst({
        where: eq(activityTypes.id, activityTypeId),
      });

      if (!existingActivityType) {
        return c.json({
          success: false,
          error: 'Activity type not found',
        }, 404);
      }

      // Check if name is being changed and if it conflicts
      if (updateData.name && updateData.name !== existingActivityType.name) {
        const nameConflict = await db.query.activityTypes.findFirst({
          where: eq(activityTypes.name, updateData.name),
        });

        if (nameConflict) {
          return c.json({
            success: false,
            error: 'Activity type with this name already exists',
          }, 400);
        }
      }

      // Update activity type
      const [updatedActivityType] = await db
        .update(activityTypes)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(activityTypes.id, activityTypeId))
        .returning();

      return c.json({
        success: true,
        data: updatedActivityType,
        message: `Activity type "${updatedActivityType.name}" updated successfully`,
      });
    } catch (error) {
      console.error('Error updating activity type:', error);
      return c.json({
        success: false,
        error: 'Failed to update activity type',
      }, 500);
    }
  }
);

// DELETE /activity-types/:id - Delete activity type (admin only)
activityTypesRouter.delete('/:id', authenticateToken, async (c) => {
  try {
    const user = c.get('user');
    const activityTypeId = c.req.param('id');

    // Check admin permission
    if (user.role !== 'admin') {
      return c.json({
        success: false,
        error: 'Admin access required',
      }, 403);
    }

    console.log(`🗑️ Admin ${user.username} deleting activity type: ${activityTypeId}`);

    // Check if activity type exists
    const existingActivityType = await db.query.activityTypes.findFirst({
      where: eq(activityTypes.id, activityTypeId),
    });

    if (!existingActivityType) {
      return c.json({
        success: false,
        error: 'Activity type not found',
      }, 404);
    }

    // Check if there are existing activities of this type
    const existingActivities = await db
      .select({ count: count(activities.id) })
      .from(activities)
      .where(eq(activities.activityTypeId, activityTypeId));

    if (existingActivities[0].count > 0) {
      return c.json({
        success: false,
        error: 'Cannot delete activity type that has existing activities',
      }, 400);
    }

    // Delete activity type (cascade will handle related records)
    await db
      .delete(activityTypes)
      .where(eq(activityTypes.id, activityTypeId));

    return c.json({
      success: true,
      message: `Activity type "${existingActivityType.name}" deleted successfully`,
    });
  } catch (error) {
    console.error('Error deleting activity type:', error);
    return c.json({
      success: false,
      error: 'Failed to delete activity type',
    }, 500);
  }
});

// POST /activity-types/:id/skills - Add skill to activity type (admin only)
activityTypesRouter.post('/:id/skills',
  authenticateToken,
  zValidator('json', createSkillMappingSchema),
  async (c) => {
    try {
      const user = c.get('user');
      const activityTypeId = c.req.param('id');
      const skillData = c.req.valid('json');

      // Check admin permission
      if (user.role !== 'admin') {
        return c.json({
          success: false,
          error: 'Admin access required',
        }, 403);
      }

      console.log(`➕ Admin ${user.username} adding skill to activity type: ${activityTypeId}`);

      // Verify activity type exists
      const activityType = await db.query.activityTypes.findFirst({
        where: eq(activityTypes.id, activityTypeId),
      });

      if (!activityType) {
        return c.json({
          success: false,
          error: 'Activity type not found',
        }, 404);
      }

      // Verify skill definition exists
      const skillDefinition = await db.query.skillDefinitions.findFirst({
        where: eq(skillDefinitions.id, skillData.skillDefinitionId),
      });

      if (!skillDefinition) {
        return c.json({
          success: false,
          error: 'Skill definition not found',
        }, 404);
      }

      // Check if mapping already exists
      const existingMapping = await db.query.activityTypeSkills.findFirst({
        where: and(
          eq(activityTypeSkills.activityTypeId, activityTypeId),
          eq(activityTypeSkills.skillDefinitionId, skillData.skillDefinitionId)
        ),
      });

      if (existingMapping) {
        return c.json({
          success: false,
          error: 'Skill is already mapped to this activity type',
        }, 400);
      }

      // Create skill mapping
      const [newMapping] = await db
        .insert(activityTypeSkills)
        .values({
          activityTypeId,
          skillDefinitionId: skillData.skillDefinitionId,
          isSpecificToActivityType: skillData.isSpecificToActivityType,
          weight: skillData.weight,
          displayOrder: skillData.displayOrder,
        })
        .returning();

      return c.json({
        success: true,
        data: {
          ...newMapping,
          skillName: skillDefinition.skillType,
          activityTypeName: activityType.name,
        },
        message: `Skill "${skillDefinition.skillType}" added to activity type "${activityType.name}"`,
      });
    } catch (error) {
      console.error('Error adding skill to activity type:', error);
      return c.json({
        success: false,
        error: 'Failed to add skill to activity type',
      }, 500);
    }
  }
);

// DELETE /activity-types/:id/skills/:skillId - Remove skill from activity type (admin only)
activityTypesRouter.delete('/:id/skills/:skillId', authenticateToken, async (c) => {
  try {
    const user = c.get('user');
    const activityTypeId = c.req.param('id');
    const skillDefinitionId = c.req.param('skillId');

    // Check admin permission
    if (user.role !== 'admin') {
      return c.json({
        success: false,
        error: 'Admin access required',
      }, 403);
    }

    console.log(`❌ Admin ${user.username} removing skill from activity type: ${activityTypeId}`);

    // Find the mapping
    const mapping = await db.query.activityTypeSkills.findFirst({
      where: and(
        eq(activityTypeSkills.activityTypeId, activityTypeId),
        eq(activityTypeSkills.skillDefinitionId, skillDefinitionId)
      ),
    });

    if (!mapping) {
      return c.json({
        success: false,
        error: 'Skill mapping not found',
      }, 404);
    }

    // Delete the mapping
    await db
      .delete(activityTypeSkills)
      .where(eq(activityTypeSkills.id, mapping.id));

    return c.json({
      success: true,
      message: 'Skill removed from activity type successfully',
    });
  } catch (error) {
    console.error('Error removing skill from activity type:', error);
    return c.json({
      success: false,
      error: 'Failed to remove skill from activity type',
    }, 500);
  }
});

// GET /activity-types/:id/leaderboard - Get ELO leaderboard for activity type
activityTypesRouter.get('/:id/leaderboard', async (c) => {
  try {
    const activityTypeId = c.req.param('id');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    console.log(`🏆 Getting leaderboard for activity type: ${activityTypeId}`);

    // Verify activity type exists
    const activityType = await db.query.activityTypes.findFirst({
      where: eq(activityTypes.id, activityTypeId),
    });

    if (!activityType) {
      return c.json({
        success: false,
        error: 'Activity type not found',
      }, 404);
    }

    // Get leaderboard data
    const leaderboard = await db
      .select({
        userId: userActivityTypeELOs.userId,
        username: sql<string>`${users.username}`,
        avatarUrl: sql<string>`${users.avatarUrl}`,
        eloScore: userActivityTypeELOs.eloScore,
        gamesPlayed: userActivityTypeELOs.gamesPlayed,
        peakELO: userActivityTypeELOs.peakELO,
        lastUpdated: userActivityTypeELOs.lastUpdated,
      })
      .from(userActivityTypeELOs)
      .leftJoin(users, eq(userActivityTypeELOs.userId, users.id))
      .where(eq(userActivityTypeELOs.activityTypeId, activityTypeId))
      .orderBy(desc(userActivityTypeELOs.eloScore))
      .limit(limit)
      .offset(offset);

    // Add ranking
    const rankedLeaderboard = leaderboard.map((entry, index) => ({
      ...entry,
      rank: offset + index + 1,
    }));

    // Get total count
    const totalCountResult = await db
      .select({ count: count(userActivityTypeELOs.userId) })
      .from(userActivityTypeELOs)
      .where(eq(userActivityTypeELOs.activityTypeId, activityTypeId));

    const totalCount = totalCountResult[0]?.count || 0;

    return c.json({
      success: true,
      data: {
        activityType: {
          id: activityType.id,
          name: activityType.name,
        },
        leaderboard: rankedLeaderboard,
        pagination: {
          limit,
          offset,
          total: totalCount,
          hasMore: offset + limit < totalCount,
        },
      },
    });
  } catch (error) {
    console.error('Error getting activity type leaderboard:', error);
    return c.json({
      success: false,
      error: 'Failed to get leaderboard',
    }, 500);
  }
});

// GET /activity-types/:id/popular-times - Get popular activity times for this type
activityTypesRouter.get('/:id/popular-times', async (c) => {
  try {
    const activityTypeId = c.req.param('id');
    const period = c.req.query('period') || 'week'; // week, month, season

    console.log(`📊 Getting popular times for activity type: ${activityTypeId}`);

    // Calculate date range
    let dateFilter = sql`true`;
    const now = new Date();
    
    if (period === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      dateFilter = sql`${activities.dateTime} >= ${weekAgo}`;
    } else if (period === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      dateFilter = sql`${activities.dateTime} >= ${monthAgo}`;
    } else if (period === 'season') {
      const seasonAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      dateFilter = sql`${activities.dateTime} >= ${seasonAgo}`;
    }

    // Get activity time patterns
    const timePatterns = await db
      .select({
        dayOfWeek: sql<number>`EXTRACT(DOW FROM ${activities.dateTime})`,
        hour: sql<number>`EXTRACT(HOUR FROM ${activities.dateTime})`,
        activityCount: count(activities.id),
        averageParticipants: avg(sql<number>`(
          SELECT COUNT(*) FROM ${activityParticipants} ap 
          WHERE ap.activity_id = ${activities.id} AND ap.status = 'accepted'
        )`),
      })
      .from(activities)
      .where(and(
        eq(activities.activityTypeId, activityTypeId),
        dateFilter
      ))
      .groupBy(
        sql`EXTRACT(DOW FROM ${activities.dateTime})`,
        sql`EXTRACT(HOUR FROM ${activities.dateTime})`
      )
      .orderBy(desc(count(activities.id)));

    // Convert day numbers to names
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const formattedPatterns = timePatterns.map(pattern => ({
      ...pattern,
      dayName: dayNames[pattern.dayOfWeek],
      timeSlot: `${pattern.hour}:00`,
    }));

    return c.json({
      success: true,
      data: {
        period,
        timePatterns: formattedPatterns,
        summary: {
          totalActivities: timePatterns.reduce((sum, p) => sum + p.activityCount, 0),
          mostPopularDay: formattedPatterns[0]?.dayName || null,
          mostPopularHour: formattedPatterns[0]?.hour || null,
        },
      },
    });
  } catch (error) {
    console.error('Error getting popular times:', error);
    return c.json({
      success: false,
      error: 'Failed to get popular times',
    }, 500);
  }
});
