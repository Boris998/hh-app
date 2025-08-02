// src/routes/skill-rating.router.ts - Skill Rating API Endpoints

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  userActivitySkillRatings,
  userActivityTypeSkillSummaries,
  skillDefinitions,
  users,
} from "../db/schema.js";
import { authenticateToken } from "../middleware/auth.js";
import { skillRatingService } from "../services/skill-raiting.service.js";

export const skillRatingRouter = new Hono();

// Request schemas
const submitSkillRatingsSchema = z.object({
  activityId: z.string().uuid("Invalid activity ID"),
  ratedUserId: z.string().uuid("Invalid user ID"),
  ratings: z
    .array(
      z.object({
        skillDefinitionId: z.string().uuid("Invalid skill ID"),
        ratingValue: z
          .number()
          .int()
          .min(1)
          .max(10, "Rating must be between 1-10"),
        confidence: z
          .number()
          .int()
          .min(1)
          .max(5, "Confidence must be between 1-5"),
        comment: z.string().max(500, "Comment too long").optional(),
      })
    )
    .min(1, "At least one rating required")
    .max(20, "Too many ratings"),
  isAnonymous: z.boolean().default(false),
});

const getUserSkillsQuerySchema = z.object({
  activityTypeId: z.string().uuid().optional(),
  includeDetails: z.enum(["true", "false"]).default("false"),
});

// POST /skill-ratings - Submit skill ratings for an activity participant
skillRatingRouter.post(
  "/",
  authenticateToken,
  zValidator("json", submitSkillRatingsSchema),
  async (c) => {
    try {
      const user = c.get("user");
      const ratingRequest = c.req.valid("json");

      console.log(
        `📊 User ${user.username} submitting ${ratingRequest.ratings.length} skill ratings`
      );

      const responses = await skillRatingService.submitSkillRatings(
        user.id,
        ratingRequest
      );

      return c.json(
        {
          status: "success",
          data: {
            ratings: responses,
            summary: {
              totalRatings: responses.length,
              ratedUser: ratingRequest.ratedUserId,
              isAnonymous: ratingRequest.isAnonymous,
            },
          },
          message: `Successfully submitted ${responses.length} skill ratings`,
        },
        201
      );
    } catch (error) {
      console.error("Error submitting skill ratings:", error);

      if (error instanceof Error) {
        return c.json(
          {
            error: error.message,
            code: "SKILL_RATING_ERROR",
          },
          400
        );
      }

      return c.json({ error: "Failed to submit skill ratings" }, 500);
    }
  }
);

// GET /skill-ratings/activity/:activityId/status - Get rating status for an activity
skillRatingRouter.get(
  "/activity/:activityId/status",
  authenticateToken,
  async (c) => {
    try {
      const activityId = c.req.param("activityId");
      const user = c.get("user");

      const status = await skillRatingService.getActivityRatingStatus(
        activityId,
        user.id
      );

      return c.json({
        status: "success",
        data: { ratingStatus: status },
      });
    } catch (error) {
      console.error("Error getting activity rating status:", error);
      return c.json({ error: "Failed to get rating status" }, 500);
    }
  }
);

// GET /skill-ratings/activity/:activityId/pending - Get pending ratings for user
skillRatingRouter.get(
  "/activity/:activityId/pending",
  authenticateToken,
  async (c) => {
    try {
      const activityId = c.req.param("activityId");
      const user = c.get("user");

      const pendingRatings = await skillRatingService.getPendingRatingsForUser(
        user.id,
        activityId
      );

      const totalPendingRatings = pendingRatings.reduce(
        (total, participant) =>
          total +
          participant.skillsToRate.filter((skill) => !skill.alreadyRated)
            .length,
        0
      );

      return c.json({
        status: "success",
        data: {
          pendingRatings,
          summary: {
            participantsToRate: pendingRatings.length,
            totalPendingRatings,
            activityId,
          },
        },
      });
    } catch (error) {
      console.error("Error getting pending ratings:", error);
      return c.json({ error: "Failed to get pending ratings" }, 500);
    }
  }
);

// GET /skill-ratings/user/:userId/summary - Get skill summary for a user
skillRatingRouter.get(
  "/user/:userId/summary",
  authenticateToken,
  zValidator("query", getUserSkillsQuerySchema),
  async (c) => {
    try {
      const userId = c.req.param("userId");
      const query = c.req.valid("query");
      const requestingUser = c.get("user");

      // Users can view their own detailed summaries, others get basic info
      const isOwnProfile = userId === requestingUser.id;
      const includeDetails = query.includeDetails === "true" && isOwnProfile;

      const skillSummary = await skillRatingService.getUserSkillSummary(
        userId,
        query.activityTypeId
      );

      // Filter sensitive information for other users' profiles
      const publicSkillSummary = skillSummary.map((skill) => ({
        skillName: skill.skillName,
        skillType: skill.skillType,
        averageRating: Math.round(skill.averageRating * 10) / 10, // Round to 1 decimal
        totalRatings: skill.totalRatings,
        trend: skill.trend,
        // Only include detailed info for own profile
        ...(includeDetails && {
          confidence: skill.confidence,
          lastRated: skill.lastRated,
        }),
      }));

      // Calculate overall statistics
      const overallStats = {
        totalSkills: skillSummary.length,
        averageRating:
          skillSummary.length > 0
            ? skillSummary.reduce(
                (sum, skill) => sum + skill.averageRating,
                0
              ) / skillSummary.length
            : 0,
        totalRatingsReceived: skillSummary.reduce(
          (sum, skill) => sum + skill.totalRatings,
          0
        ),
        strongestSkills: skillSummary
          .filter((skill) => skill.totalRatings >= 3) // Only skills with enough ratings
          .sort((a, b) => b.averageRating - a.averageRating)
          .slice(0, 5)
          .map((skill) => ({
            skillName: skill.skillName,
            averageRating: Math.round(skill.averageRating * 10) / 10,
          })),
        improvingSkills: skillSummary
          .filter((skill) => skill.trend === "improving")
          .map((skill) => skill.skillName),
      };

      return c.json({
        status: "success",
        data: {
          userId,
          isOwnProfile,
          overallStats,
          skills: publicSkillSummary,
          activityTypeFilter: query.activityTypeId,
        },
      });
    } catch (error) {
      console.error("Error getting user skill summary:", error);
      return c.json({ error: "Failed to get skill summary" }, 500);
    }
  }
);

// GET /skill-ratings/my-skills - Get current user's skill summary (convenience endpoint)
skillRatingRouter.get(
  "/my-skills",
  authenticateToken,
  zValidator("query", getUserSkillsQuerySchema),
  async (c) => {
    try {
      const user = c.get("user");
      const query = c.req.valid("query");

      const skillSummary = await skillRatingService.getUserSkillSummary(
        user.id,
        query.activityTypeId
      );

      // Group skills by type for better organization
      const skillsByType = skillSummary.reduce((groups, skill) => {
        const type = skill.skillType;
        if (!groups[type]) groups[type] = [];
        groups[type].push(skill);
        return groups;
      }, {} as Record<string, typeof skillSummary>);

      // Calculate personal statistics
      const personalStats = {
        totalSkillsRated: skillSummary.length,
        averageRating:
          skillSummary.length > 0
            ? skillSummary.reduce(
                (sum, skill) => sum + skill.averageRating,
                0
              ) / skillSummary.length
            : 0,
        totalRatingsReceived: skillSummary.reduce(
          (sum, skill) => sum + skill.totalRatings,
          0
        ),
        skillTypeBreakdown: Object.entries(skillsByType).map(
          ([type, skills]) => ({
            skillType: type,
            skillCount: skills.length,
            averageRating:
              skills.reduce((sum, skill) => sum + skill.averageRating, 0) /
              skills.length,
          })
        ),
        recentTrends: {
          improving: skillSummary.filter((skill) => skill.trend === "improving")
            .length,
          stable: skillSummary.filter((skill) => skill.trend === "stable")
            .length,
          declining: skillSummary.filter((skill) => skill.trend === "declining")
            .length,
        },
      };

      return c.json({
        status: "success",
        data: {
          personalStats,
          skillsByType,
          allSkills: skillSummary,
        },
      });
    } catch (error) {
      console.error("Error getting user skills:", error);
      return c.json({ error: "Failed to get your skills" }, 500);
    }
  }
);

// GET /skill-ratings/activity/:activityId/participant/:userId - Get activity-specific ratings for a participant
skillRatingRouter.get(
  "/activity/:activityId/participant/:userId",
  authenticateToken,
  async (c) => {
    try {
      const activityId = c.req.param("activityId");
      const userId = c.req.param("userId");
      const requestingUser = c.get("user");

      // Users can see detailed ratings for activities they participated in
      // For others, show limited information
      const includeComments = requestingUser.id === userId;

      const activityRatings = await skillRatingService.getActivitySkillRatings(
        activityId,
        userId,
        includeComments
      );

      return c.json({
        status: "success",
        data: {
          activityId,
          participantId: userId,
          skillRatings: activityRatings,
          summary: {
            totalSkillsRated: activityRatings.length,
            averageRating:
              activityRatings.length > 0
                ? activityRatings.reduce(
                    (sum, skill) => sum + skill.averageRating,
                    0
                  ) / activityRatings.length
                : 0,
            totalRatingsReceived: activityRatings.reduce(
              (sum, skill) => sum + skill.totalRatings,
              0
            ),
          },
          includesComments: includeComments,
        },
      });
    } catch (error) {
      console.error("Error getting activity skill ratings:", error);
      return c.json({ error: "Failed to get activity skill ratings" }, 500);
    }
  }
);

// GET /skill-ratings/statistics - Get system-wide skill rating statistics (admin)
skillRatingRouter.get("/statistics", authenticateToken, async (c) => {
  try {
    const user = c.get("user");

    // Only admins can view system statistics
    if (user.role !== "admin") {
      return c.json({ error: "Admin access required" }, 403);
    }

    const statistics = await skillRatingService.getSkillRatingStatistics();

    return c.json({
      status: "success",
      data: { statistics },
    });
  } catch (error) {
    console.error("Error getting skill rating statistics:", error);
    return c.json({ error: "Failed to get statistics" }, 500);
  }
});

// GET /skill-ratings/suspicious-patterns - Detect suspicious rating patterns (admin)
skillRatingRouter.get("/suspicious-patterns", authenticateToken, async (c) => {
  try {
    const user = c.get("user");

    // Only admins can view suspicious patterns
    if (user.role !== "admin") {
      return c.json({ error: "Admin access required" }, 403);
    }

    const suspiciousPatterns =
      await skillRatingService.detectSuspiciousRatingPatterns();

    return c.json({
      status: "success",
      data: {
        suspiciousPatterns,
        summary: {
          totalPatterns: suspiciousPatterns.length,
          highSeverity: suspiciousPatterns.filter((p) => p.severity === "high")
            .length,
          mediumSeverity: suspiciousPatterns.filter(
            (p) => p.severity === "medium"
          ).length,
          lowSeverity: suspiciousPatterns.filter((p) => p.severity === "low")
            .length,
        },
      },
    });
  } catch (error) {
    console.error("Error detecting suspicious patterns:", error);
    return c.json({ error: "Failed to detect suspicious patterns" }, 500);
  }
});

// DELETE /skill-ratings/activity/:activityId/user/:ratedUserId - Delete ratings (admin or within time limit)
skillRatingRouter.delete(
  "/activity/:activityId/user/:ratedUserId",
  authenticateToken,
  async (c) => {
    try {
      const activityId = c.req.param("activityId");
      const ratedUserId = c.req.param("ratedUserId");
      const user = c.get("user");

      // Only allow deletion by admin or the original rater within 24 hours
      const isAdmin = user.role === "admin";

      if (!isAdmin) {
        // Check if user is the original rater and within time limit
        // Implementation would check creation time and allow deletion within 24 hours
        return c.json(
          {
            error:
              "Can only delete your own ratings within 24 hours of submission",
          },
          403
        );
      }

      // For this implementation, we'll keep it simple and only allow admin deletion
      // In production, you'd implement the time-based deletion logic

      const deletedCount = await db
        .delete(userActivitySkillRatings)
        .where(
          and(
            eq(userActivitySkillRatings.activityId, activityId),
            eq(userActivitySkillRatings.ratedUserId, ratedUserId),
            // Only delete ratings from the requesting user if not admin
            isAdmin
              ? undefined
              : eq(userActivitySkillRatings.ratingUserId, user.id)
          )
        )
        .returning({ id: userActivitySkillRatings.id });

      // Recalculate summaries after deletion
      if (deletedCount.length > 0) {
        await skillRatingService.recalculateUserSkillSummaries(
          ratedUserId,
          activityId
        );
      }

      return c.json({
        status: "success",
        data: {
          deletedRatings: deletedCount.length,
          message: `Deleted ${deletedCount.length} skill ratings`,
        },
      });
    } catch (error) {
      console.error("Error deleting skill ratings:", error);
      return c.json({ error: "Failed to delete skill ratings" }, 500);
    }
  }
);

// PUT /skill-ratings/:ratingId - Update a specific skill rating (within time limit)
skillRatingRouter.put(
  "/:ratingId",
  authenticateToken,
  zValidator(
    "json",
    z.object({
      ratingValue: z.number().int().min(1).max(10),
      confidence: z.number().int().min(1).max(5),
      comment: z.string().max(500).optional(),
    })
  ),
  async (c) => {
    try {
      const ratingId = c.req.param("ratingId");
      const user = c.get("user");
      const updateData = c.req.valid("json");

      // Check if the rating exists and belongs to the user
      const [existingRating] = await db
        .select({
          id: userActivitySkillRatings.id,
          ratingUserId: userActivitySkillRatings.ratingUserId,
          ratedUserId: userActivitySkillRatings.ratedUserId,
          activityId: userActivitySkillRatings.activityId,
          createdAt: userActivitySkillRatings.createdAt,
        })
        .from(userActivitySkillRatings)
        .where(eq(userActivitySkillRatings.id, ratingId))
        .limit(1);

      if (!existingRating) {
        return c.json({ error: "Rating not found" }, 404);
      }

      if (existingRating.ratingUserId !== user.id) {
        return c.json({ error: "Can only update your own ratings" }, 403);
      }

      // Check if within edit time limit (24 hours)
      const timeLimit = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
      const timeSinceCreation = Date.now() - existingRating.createdAt.getTime();

      if (timeSinceCreation > timeLimit) {
        return c.json(
          {
            error: "Can only edit ratings within 24 hours of submission",
          },
          403
        );
      }

      // Update the rating
      const [updatedRating] = await db
        .update(userActivitySkillRatings)
        .set({
          ratingValue: updateData.ratingValue,
          confidence: updateData.confidence,
          comment: updateData.comment,
        })
        .where(eq(userActivitySkillRatings.id, ratingId))
        .returning();

      // Recalculate skill summaries
      await skillRatingService.recalculateUserSkillSummaries(
        existingRating.ratedUserId,
        existingRating.activityId
      );

      return c.json({
        status: "success",
        data: {
          updatedRating,
          message: "Rating updated successfully",
        },
      });
    } catch (error) {
      console.error("Error updating skill rating:", error);
      return c.json({ error: "Failed to update rating" }, 500);
    }
  }
);

// GET /skill-ratings/leaderboard/:skillDefinitionId - Get leaderboard for a specific skill
skillRatingRouter.get("/leaderboard/:skillDefinitionId", async (c) => {
  try {
    const skillDefinitionId = c.req.param("skillDefinitionId");
    const limit = parseInt(c.req.query("limit") || "50");
    const offset = parseInt(c.req.query("offset") || "0");
    const activityTypeId = c.req.query("activityTypeId"); // Optional filter

    let query = db
      .select({
        user: {
          id: users.id,
          username: users.username,
          avatarUrl: users.avatarUrl,
        },
        skillSummary: userActivityTypeSkillSummaries,
        skill: skillDefinitions,
      })
      .from(userActivityTypeSkillSummaries)
      .leftJoin(users, eq(userActivityTypeSkillSummaries.userId, users.id))
      .leftJoin(
        skillDefinitions,
        eq(
          userActivityTypeSkillSummaries.skillDefinitionId,
          skillDefinitions.id
        )
      )
      .where(
        eq(userActivityTypeSkillSummaries.skillDefinitionId, skillDefinitionId)
      );

    const conditions = [
      eq(userActivityTypeSkillSummaries.skillDefinitionId, skillDefinitionId),
    ];

    if (activityTypeId) {
      conditions.push(
        eq(userActivityTypeSkillSummaries.activityTypeId, activityTypeId)
      );
    }

    const leaderboard = await db
      .select({
        user: {
          id: users.id,
          username: users.username,
          avatarUrl: users.avatarUrl,
        },
        skillSummary: userActivityTypeSkillSummaries,
        skill: skillDefinitions,
      })
      .from(userActivityTypeSkillSummaries)
      .leftJoin(users, eq(userActivityTypeSkillSummaries.userId, users.id))
      .leftJoin(
        skillDefinitions,
        eq(
          userActivityTypeSkillSummaries.skillDefinitionId,
          skillDefinitions.id
        )
      )
      .where(and(...conditions))
      .orderBy(desc(userActivityTypeSkillSummaries.averageRating))
      .limit(limit)
      .offset(offset);

    // Get skill info
    const [skillInfo] = await db
      .select()
      .from(skillDefinitions)
      .where(eq(skillDefinitions.id, skillDefinitionId))
      .limit(1);

    return c.json({
      status: "success",
      data: {
        skill: skillInfo,
        leaderboard: leaderboard.map((entry, index) => ({
          rank: offset + index + 1,
          user: entry.user,
          averageRating: (entry.skillSummary?.averageRating || 0) / 100, // Convert from integer storage
          totalRatings: entry.skillSummary?.totalRatings || 0,
          trend: entry.skillSummary?.trend || "stable",
          lastCalculated: entry.skillSummary?.lastCalculatedAt,
        })),
        pagination: {
          limit,
          offset,
          total: leaderboard.length,
        },
      },
    });
  } catch (error) {
    console.error("Error getting skill leaderboard:", error);
    return c.json({ error: "Failed to get skill leaderboard" }, 500);
  }
});