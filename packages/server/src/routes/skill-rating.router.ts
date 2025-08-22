// src/routes/skill-rating.router.ts - Complete implementation using existing service methods

import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/client.js';
import {
  activities,
  activityParticipants,
  activityTypes,
  skillDefinitions,
  userActivitySkillRatings,
  userActivityTypeSkillSummaries,
  userConnections
} from '../db/schema.js';
import { authenticateToken } from '../middleware/auth.js';
import { deltaTrackingService } from '../services/delta-tracking.service.js';
import { skillRatingService } from '../services/skill-raiting.service.js';

export const skillRatingRouter = new Hono();

// Validation schemas
const submitRatingSchema = z.object({
  activityId: z.string().uuid('Invalid activity ID'),
  ratedUserId: z.string().uuid('Invalid rated user ID'),
  skillDefinitionId: z.string().uuid('Invalid skill definition ID'),
  ratingValue: z.number().int().min(1).max(10),
  comment: z.string().max(500, 'Comment too long').optional(),
  confidence: z.number().min(1).max(10).optional(),
  isAnonymous: z.boolean().default(false),
});

const getUserRatingsSchema = z.object({
  activityTypeId: z.string().uuid('Invalid activity type ID').optional(),
  skillType: z.enum(['physical', 'technical', 'mental', 'tactical']).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(50).default(20),
});

const getActivityRatingsSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(50).default(20),
});

const getSkillLeaderboardSchema = z.object({
  skillDefinitionId: z.string().uuid('Invalid skill definition ID'),
  activityTypeId: z.string().uuid('Invalid activity type ID').optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(50).default(20),
});

// POST /skill-ratings/submit - Submit a skill rating
skillRatingRouter.post('/submit',
  authenticateToken,
  zValidator('json', submitRatingSchema),
  async (c) => {
    try {
      const user = c.get('user');
      const ratingData = c.req.valid('json');

      console.log(`📊 ${user.username} submitting rating for user ${ratingData.ratedUserId}`);

      // Prevent self-rating
      if (ratingData.ratedUserId === user.id) {
        return c.json({
          success: false,
          error: "You cannot rate yourself",
        }, 400);
      }

      // Check if user was participant in the activity
      const participation = await db.query.activityParticipants.findFirst({
        where: and(
          eq(activityParticipants.activityId, ratingData.activityId),
          eq(activityParticipants.userId, user.id),
          eq(activityParticipants.status, 'accepted')
        ),
      });

      if (!participation) {
        return c.json({
          success: false,
          error: "You must be a participant in this activity to submit ratings",
        }, 403);
      }

      // Check if rated user was also a participant
      const ratedUserParticipation = await db.query.activityParticipants.findFirst({
        where: and(
          eq(activityParticipants.activityId, ratingData.activityId),
          eq(activityParticipants.userId, ratingData.ratedUserId),
          eq(activityParticipants.status, 'accepted')
        ),
      });

      if (!ratedUserParticipation) {
        return c.json({
          success: false,
          error: "Rated user was not a participant in this activity",
        }, 400);
      }

      // Check for duplicate rating
      const existingRating = await db.query.userActivitySkillRatings.findFirst({
        where: and(
          eq(userActivitySkillRatings.activityId, ratingData.activityId),
          eq(userActivitySkillRatings.ratedUserId, ratingData.ratedUserId),
          eq(userActivitySkillRatings.ratingUserId, user.id),
          eq(userActivitySkillRatings.skillDefinitionId, ratingData.skillDefinitionId)
        ),
      });

      if (existingRating) {
        return c.json({
          success: false,
          error: "You have already rated this skill for this user in this activity",
        }, 400);
      }

      // Use the service method to submit rating
      const result = await skillRatingService.submitRating({
        activityId: ratingData.activityId,
        ratedUserId: ratingData.ratedUserId,
        ratingUserId: user.id,
        skillDefinitionId: ratingData.skillDefinitionId,
        ratingValue: ratingData.ratingValue,
        comment: ratingData.comment,
        confidence: ratingData.confidence,
        isAnonymous: ratingData.isAnonymous,
      });

      return c.json({
        success: true,
        data: result,
        message: "Skill rating submitted successfully",
      });
    } catch (error) {
      console.error("Error submitting skill rating:", error);
      return c.json({
        success: false,
        error: "Failed to submit skill rating",
      }, 500);
    }
  }
);

// GET /skill-ratings/user/:userId - Get skill ratings for a user
skillRatingRouter.get('/user/:userId',
  authenticateToken,
  zValidator('query', getUserRatingsSchema),
  async (c) => {
    try {
      const userId = c.req.param('userId');
      const { activityTypeId, skillType, page, limit } = c.req.valid('query');
      const offset = (page - 1) * limit;

      console.log(`📊 Getting skill ratings for user ${userId}`);

      // Use the service method to get user skill summaries
      const summaries = await skillRatingService.getUserSkillSummaries(
        userId,
        activityTypeId,
      );

      // Get recent ratings with comments using service method
      const recentRatings = await skillRatingService.getRecentRatingsWithComments(
        userId,
        5
      );

      return c.json({
        success: true,
        data: {
          skillSummaries: summaries,
          recentRatings,
          pagination: {
            page,
            limit,
            hasMore: summaries.length === limit,
          },
        },
      });
    } catch (error) {
      console.error("Error getting user skill ratings:", error);
      return c.json({
        success: false,
        error: "Failed to get skill ratings",
      }, 500);
    }
  }
);

// GET /skill-ratings/activity/:activityId - Get all ratings for an activity
skillRatingRouter.get('/activity/:activityId',
  authenticateToken,
  zValidator('query', getActivityRatingsSchema),
  async (c) => {
    try {
      const user = c.get('user');
      const activityId = c.req.param('activityId');
      const { page, limit } = c.req.valid('query');
      const offset = (page - 1) * limit;

      console.log(`📊 Getting activity ratings for activity ${activityId}`);

      // Check if user has access to view these ratings (participant or activity creator)
      const activity = await db.query.activities.findFirst({
        where: eq(activities.id, activityId),
      });

      if (!activity) {
        return c.json({
          success: false,
          error: "Activity not found",
        }, 404);
      }

      const participation = await db.query.activityParticipants.findFirst({
        where: and(
          eq(activityParticipants.activityId, activityId),
          eq(activityParticipants.userId, user.id)
        ),
      });

      const isCreator = activity.creatorId === user.id;
      const isParticipant = !!participation;

      if (!isCreator && !isParticipant) {
        return c.json({
          success: false,
          error: "Access denied. You must be a participant or creator of this activity.",
        }, 403);
      }

      // Get ratings for this activity
      const ratings = await db
        .select({
          id: userActivitySkillRatings.id,
          ratedUserId: userActivitySkillRatings.ratedUserId,
          ratingUserId: userActivitySkillRatings.ratingUserId,
          skillDefinitionId: userActivitySkillRatings.skillDefinitionId,
          ratingValue: userActivitySkillRatings.ratingValue,
          comment: userActivitySkillRatings.comment,
          confidence: userActivitySkillRatings.confidence,
          isAnonymous: userActivitySkillRatings.isAnonymous,
          createdAt: userActivitySkillRatings.createdAt,
          skillName: skillDefinitions.skillType,
        })
        .from(userActivitySkillRatings)
        .leftJoin(skillDefinitions, eq(userActivitySkillRatings.skillDefinitionId, skillDefinitions.id))
        .where(eq(userActivitySkillRatings.activityId, activityId))
        .orderBy(desc(userActivitySkillRatings.createdAt))
        .limit(limit)
        .offset(offset);

      // Get total count
      const totalCountResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(userActivitySkillRatings)
        .where(eq(userActivitySkillRatings.activityId, activityId));

      const totalCount = totalCountResult[0]?.count || 0;

      return c.json({
        success: true,
        data: {
          ratings,
          pagination: {
            page,
            limit,
            total: totalCount,
            totalPages: Math.ceil(totalCount / limit),
            hasMore: offset + limit < totalCount,
          },
        },
      });
    } catch (error) {
      console.error("Error getting activity ratings:", error);
      return c.json({
        success: false,
        error: "Failed to get activity ratings",
      }, 500);
    }
  }
);

// GET /skill-ratings/leaderboard - Get skill leaderboard
skillRatingRouter.get('/leaderboard',
  authenticateToken,
  zValidator('query', getSkillLeaderboardSchema),
  async (c) => {
    try {
      const { skillDefinitionId, activityTypeId, page, limit } = c.req.valid('query');
      const offset = (page - 1) * limit;

      console.log(`🏆 Getting skill leaderboard for skill ${skillDefinitionId}`);

      // Use the service method for getting skill leaderboard
      const leaderboard = await skillRatingService.getSkillLeaderboard(
        skillDefinitionId,
        activityTypeId,
        limit,
        offset
      );

      // Get skill definition details
      const skillDefinition = await db.query.skillDefinitions.findFirst({
        where: eq(skillDefinitions.id, skillDefinitionId),
      });

      return c.json({
        success: true,
        data: {
          skill: skillDefinition,
          leaderboard,
          pagination: {
            page,
            limit,
            hasMore: leaderboard.length === limit,
          },
        },
      });
    } catch (error) {
      console.error("Error getting skill leaderboard:", error);
      return c.json({
        success: false,
        error: "Failed to get skill leaderboard",
      }, 500);
    }
  }
);

// GET /skill-ratings/my-pending - Get activities where user needs to submit ratings
skillRatingRouter.get('/my-pending', authenticateToken, async (c) => {
  try {
    const user = c.get('user');

    console.log(`📊 Getting pending ratings for ${user.username}`);

    // Get completed activities where user participated but hasn't rated all other participants
    const completedActivities = await db
      .select({
        id: activities.id,
        description: activities.description,
        activityTypeName: activityTypes.name,
        completedAt: activities.updatedAt,
      })
      .from(activities)
      .leftJoin(activityTypes, eq(activities.activityTypeId, activityTypes.id))
      .leftJoin(activityParticipants, eq(activities.id, activityParticipants.activityId))
      .where(
        and(
          eq(activityParticipants.userId, user.id),
          eq(activityParticipants.status, 'accepted'),
          sql`${activities.dateTime} < NOW() - INTERVAL '1 hour'` // Activity completed at least 1 hour ago
        )
      )
      .orderBy(desc(activities.updatedAt))
      .limit(10);

    // For each activity, check if there are participants the user hasn't rated
    const pendingActivities = [];

    for (const activity of completedActivities) {
      // Get other participants in this activity
      const otherParticipants = await db
        .select({
          userId: activityParticipants.userId,
        })
        .from(activityParticipants)
        .where(
          and(
            eq(activityParticipants.activityId, activity.id),
            eq(activityParticipants.status, 'accepted'),
            sql`${activityParticipants.userId} != ${user.id}`
          )
        );

      // Check if user has rated all other participants
      const ratedParticipants = await db
        .select({
          ratedUserId: userActivitySkillRatings.ratedUserId,
        })
        .from(userActivitySkillRatings)
        .where(
          and(
            eq(userActivitySkillRatings.activityId, activity.id),
            eq(userActivitySkillRatings.ratingUserId, user.id)
          )
        );

      const ratedUserIds = new Set(ratedParticipants.map(r => r.ratedUserId));
      const unratedParticipants = otherParticipants.filter(p => !ratedUserIds.has(p.userId));

      if (unratedParticipants.length > 0) {
        pendingActivities.push({
          ...activity,
          pendingRatingsCount: unratedParticipants.length,
        });
      }
    }

    return c.json({
      success: true,
      data: {
        pendingActivities,
        totalPending: pendingActivities.length,
      },
    });
  } catch (error) {
    console.error("Error getting pending ratings:", error);
    return c.json({
      success: false,
      error: "Failed to get pending ratings",
    }, 500);
  }
});

// GET /skill-ratings/analytics/:userId - Get skill analytics for a user
skillRatingRouter.get('/analytics/:userId', authenticateToken, async (c) => {
  try {
    const currentUser = c.get('user');
    const userId = c.req.param('userId');

    console.log(`📈 Getting skill analytics for user ${userId}`);

    // Check if user can view analytics (self or connected users)
    if (userId !== currentUser.id) {
      const connection = await db.query.userConnections.findFirst({
        where: and(
          or(
            and(eq(userConnections.user1Id, currentUser.id), eq(userConnections.user2Id, userId)),
            and(eq(userConnections.user1Id, userId), eq(userConnections.user2Id, currentUser.id))
          ),
          eq(userConnections.status, 'accepted')
        ),
      });

      if (!connection) {
        return c.json({
          success: false,
          error: "Access denied. You can only view analytics for connected users.",
        }, 403);
      }
    }

    // Get skill progression over time (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const skillProgression = await db
      .select({
        skillName: skillDefinitions.skillType,
        activityTypeName: activityTypes.name,
        averageRating: sql<number>`AVG(${userActivitySkillRatings.ratingValue})`,
        totalRatings: sql<number>`COUNT(${userActivitySkillRatings.id})`,
        month: sql<string>`DATE_TRUNC('month', ${userActivitySkillRatings.createdAt})`,
      })
      .from(userActivitySkillRatings)
      .leftJoin(skillDefinitions, eq(userActivitySkillRatings.skillDefinitionId, skillDefinitions.id))
      .leftJoin(activities, eq(userActivitySkillRatings.activityId, activities.id))
      .leftJoin(activityTypes, eq(activities.activityTypeId, activityTypes.id))
      .where(
        and(
          eq(userActivitySkillRatings.ratedUserId, userId),
          sql`${userActivitySkillRatings.createdAt} >= ${sixMonthsAgo}`
        )
      )
      .groupBy(
        skillDefinitions.skillType,
        activityTypes.name,
        sql`DATE_TRUNC('month', ${userActivitySkillRatings.createdAt})`
      )
      .orderBy(sql`DATE_TRUNC('month', ${userActivitySkillRatings.createdAt}) DESC`);

    // Get top skills across all activity types
    const topSkills = await db
      .select({
        skillName: skillDefinitions.skillType,
        averageRating: sql<number>`AVG(${userActivitySkillRatings.ratingValue})`,
        totalRatings: sql<number>`COUNT(${userActivitySkillRatings.id})`,
      })
      .from(userActivitySkillRatings)
      .leftJoin(skillDefinitions, eq(userActivitySkillRatings.skillDefinitionId, skillDefinitions.id))
      .where(eq(userActivitySkillRatings.ratedUserId, userId))
      .groupBy(skillDefinitions.skillType)
      .having(sql`COUNT(${userActivitySkillRatings.id}) >= 3`) // At least 3 ratings
      .orderBy(sql`AVG(${userActivitySkillRatings.ratingValue}) DESC`)
      .limit(10);

    // Get skill distribution by activity type
    const skillByActivityType = await db
      .select({
        activityTypeName: activityTypes.name,
        averageRating: sql<number>`AVG(${userActivitySkillRatings.ratingValue})`,
        totalRatings: sql<number>`COUNT(${userActivitySkillRatings.id})`,
        skillCount: sql<number>`COUNT(DISTINCT ${userActivitySkillRatings.skillDefinitionId})`,
      })
      .from(userActivitySkillRatings)
      .leftJoin(activities, eq(userActivitySkillRatings.activityId, activities.id))
      .leftJoin(activityTypes, eq(activities.activityTypeId, activityTypes.id))
      .where(eq(userActivitySkillRatings.ratedUserId, userId))
      .groupBy(activityTypes.name)
      .orderBy(sql`AVG(${userActivitySkillRatings.ratingValue}) DESC`);

    // Get recent improvements (skills with increasing trend)
    const recentImprovements = await db
      .select({
        skillName: skillDefinitions.skillType,
        activityTypeName: activityTypes.name,
        currentAverage: userActivityTypeSkillSummaries.averageRating,
        totalRatings: sql<number>`COUNT(${userActivitySkillRatings.id})`,
        recentAverage: sql<number>`AVG(CASE WHEN ${userActivitySkillRatings.createdAt} >= NOW() - INTERVAL '30 days' THEN ${userActivitySkillRatings.ratingValue} END)`,
      })
      .from(userActivityTypeSkillSummaries)
      .leftJoin(skillDefinitions, eq(userActivityTypeSkillSummaries.skillDefinitionId, skillDefinitions.id))
      .leftJoin(activityTypes, eq(userActivityTypeSkillSummaries.activityTypeId, activityTypes.id))
      .leftJoin(userActivitySkillRatings, and(
        eq(userActivitySkillRatings.ratedUserId, userActivityTypeSkillSummaries.userId),
        eq(userActivitySkillRatings.skillDefinitionId, userActivityTypeSkillSummaries.skillDefinitionId)
      ))
      .where(eq(userActivityTypeSkillSummaries.userId, userId))
      .groupBy(
        skillDefinitions.skillType,
        activityTypes.name,
        userActivityTypeSkillSummaries.averageRating
      )
      .having(sql`COUNT(${userActivitySkillRatings.id}) >= 5`) // At least 5 total ratings
      .orderBy(sql`AVG(CASE WHEN ${userActivitySkillRatings.createdAt} >= NOW() - INTERVAL '30 days' THEN ${userActivitySkillRatings.ratingValue} END) - ${userActivityTypeSkillSummaries.averageRating} DESC`)
      .limit(5);

    return c.json({
      success: true,
      data: {
        skillProgression,
        topSkills,
        skillByActivityType,
        recentImprovements,
        summary: {
          totalRatingsReceived: topSkills.reduce((sum, skill) => sum + skill.totalRatings, 0),
          averageOverallRating: topSkills.length > 0 
            ? topSkills.reduce((sum, skill) => sum + skill.averageRating, 0) / topSkills.length 
            : 0,
          skillsTracked: topSkills.length,
        },
      },
    });
  } catch (error) {
    console.error("Error getting skill analytics:", error);
    return c.json({
      success: false,
      error: "Failed to get skill analytics",
    }, 500);
  }
});

// DELETE /skill-ratings/:id - Delete a skill rating (only by original rater or admin)
skillRatingRouter.delete('/:id', authenticateToken, async (c) => {
  try {
    const user = c.get('user');
    const ratingId = c.req.param('id');

    console.log(`🗑️ ${user.username} attempting to delete rating ${ratingId}`);

    // Get the rating
    const rating = await db.query.userActivitySkillRatings.findFirst({
      where: eq(userActivitySkillRatings.id, ratingId),
    });

    if (!rating) {
      return c.json({
        success: false,
        error: "Rating not found",
      }, 404);
    }

    // Check if user can delete this rating (original rater or admin)
    if (rating.ratingUserId !== user.id && user.role !== 'admin') {
      return c.json({
        success: false,
        error: "Access denied. You can only delete your own ratings.",
      }, 403);
    }

    // Check if rating is too old to delete (e.g., more than 24 hours)
    const ratingAge = Date.now() - rating.createdAt.getTime();
    const maxEditTime = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

    if (ratingAge > maxEditTime && user.role !== 'admin') {
      return c.json({
        success: false,
        error: "Cannot delete ratings older than 24 hours",
      }, 400);
    }

    // Delete the rating
    await db
      .delete(userActivitySkillRatings)
      .where(eq(userActivitySkillRatings.id, ratingId));

    // Track the change
    await deltaTrackingService.trackChange({
      entityType: 'skill_rating',
      entityId: ratingId,
      changeType: 'delete',
      previousData: rating,
      affectedUserId: rating.ratedUserId,
      relatedEntityId: rating.activityId,
      triggeredBy: user.id,
    });

    // Trigger skill summary recalculation
    await skillRatingService.recalculateSkillSummaries(
      rating.ratedUserId,
      rating.skillDefinitionId
    );

    return c.json({
      success: true,
      message: "Skill rating deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting skill rating:", error);
    return c.json({
      success: false,
      error: "Failed to delete skill rating",
    }, 500);
  }
});

// PUT /skill-ratings/:id - Update a skill rating (only by original rater within time limit)
skillRatingRouter.put('/:id',
  authenticateToken,
  zValidator('json', z.object({
    ratingValue: z.number().int().min(1).max(10),
    comment: z.string().max(500, 'Comment too long').optional(),
    confidence: z.number().min(1).max(10).optional(),
  })),
  async (c) => {
    try {
      const user = c.get('user');
      const ratingId = c.req.param('id');
      const updateData = c.req.valid('json');

      console.log(`✏️ ${user.username} updating rating ${ratingId}`);

      // Get the rating
      const rating = await db.query.userActivitySkillRatings.findFirst({
        where: eq(userActivitySkillRatings.id, ratingId),
      });

      if (!rating) {
        return c.json({
          success: false,
          error: "Rating not found",
        }, 404);
      }

      // Check if user can update this rating (only original rater)
      if (rating.ratingUserId !== user.id) {
        return c.json({
          success: false,
          error: "Access denied. You can only update your own ratings.",
        }, 403);
      }

      // Check if rating is too old to update (e.g., more than 1 hour)
      const ratingAge = Date.now() - rating.createdAt.getTime();
      const maxEditTime = 60 * 60 * 1000; // 1 hour in milliseconds

      if (ratingAge > maxEditTime) {
        return c.json({
          success: false,
          error: "Cannot update ratings older than 1 hour",
        }, 400);
      }

      // Update the rating
      const [updatedRating] = await db
        .update(userActivitySkillRatings)
        .set({
          ratingValue: updateData.ratingValue,
          comment: updateData.comment ?? rating.comment,
          confidence: updateData.confidence ?? rating.confidence,
        })
        .where(eq(userActivitySkillRatings.id, ratingId))
        .returning();

      // Track the change
      await deltaTrackingService.trackChange({
        entityType: 'skill_rating',
        entityId: ratingId,
        changeType: 'update',
        previousData: rating,
        newData: updatedRating,
        affectedUserId: rating.ratedUserId,
        relatedEntityId: rating.activityId,
        triggeredBy: user.id,
      });

      // Trigger skill summary recalculation
      await skillRatingService.recalculateSkillSummaries(
        rating.ratedUserId,
        rating.skillDefinitionId
      );

      return c.json({
        success: true,
        data: updatedRating,
        message: "Skill rating updated successfully",
      });
    } catch (error) {
      console.error("Error updating skill rating:", error);
      return c.json({
        success: false,
        error: "Failed to update skill rating",
      }, 500);
    }
  }
);

// GET /skill-ratings/stats - Get overall skill rating statistics
skillRatingRouter.get('/stats', authenticateToken, async (c) => {
  try {
    console.log('📈 Getting overall skill rating statistics');

    // Get total ratings count
    const totalRatingsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(userActivitySkillRatings);

    // Get average rating across all skills
    const averageRatingResult = await db
      .select({ 
        average: sql<number>`AVG(${userActivitySkillRatings.ratingValue})`,
      })
      .from(userActivitySkillRatings);

    // Get most rated skills
    const mostRatedSkills = await db
      .select({
        skillName: skillDefinitions.skillType,
        totalRatings: sql<number>`COUNT(${userActivitySkillRatings.id})`,
        averageRating: sql<number>`AVG(${userActivitySkillRatings.ratingValue})`,
      })
      .from(userActivitySkillRatings)
      .leftJoin(skillDefinitions, eq(userActivitySkillRatings.skillDefinitionId, skillDefinitions.id))
      .groupBy(skillDefinitions.skillType)
      .orderBy(sql`COUNT(${userActivitySkillRatings.id}) DESC`)
      .limit(10);

    // Get most active raters
    const mostActiveRaters = await db
      .select({
        ratingUserId: userActivitySkillRatings.ratingUserId,
        totalRatingsGiven: sql<number>`COUNT(${userActivitySkillRatings.id})`,
      })
      .from(userActivitySkillRatings)
      .groupBy(userActivitySkillRatings.ratingUserId)
      .orderBy(sql`COUNT(${userActivitySkillRatings.id}) DESC`)
      .limit(10);

    return c.json({
      success: true,
      data: {
        totalRatings: totalRatingsResult[0]?.count || 0,
        averageRating: Math.round((averageRatingResult[0]?.average || 0) * 100) / 100,
        mostRatedSkills,
        mostActiveRaters,
      },
    });
  } catch (error) {
    console.error("Error getting skill rating statistics:", error);
    return c.json({
      success: false,
      error: "Failed to get statistics",
    }, 500);
  }
});