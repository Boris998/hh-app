// src/routes/matchmaking.router.ts - Complete implementation with service integration

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, inArray, sql, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  userActivityTypeELOs,
  activities,
  activityParticipants,
  users,
  activityTypes,
} from "../db/schema.js";
import { authenticateToken } from "../middleware/auth.js";
import { matchmakingService } from "../services/matchmaking.service.js";
import { createActivitySchema } from "../db/zod.schema.js";

export const matchmakingRouter = new Hono();

// Request schemas
const findPlayersSchema = z.object({
  activityTypeId: z.string().uuid("Invalid activity type ID"),
  eloTolerance: z.number().int().min(50).max(500).default(200),
  maxResults: z.number().int().min(1).max(50).default(10),
  skillRequirements: z
    .record(
      z.object({
        min: z.number().min(1).max(10),
        weight: z.number().min(0.1).max(2),
      })
    )
    .optional(),
  includeConnections: z.boolean().default(true),
  avoidRecentOpponents: z.boolean().default(false),
});

const createOptimizedActivitySchema = z.object({
  activityTypeId: z.string().uuid("Invalid activity type ID"),
  description: z.string().min(1).max(1000),
  location: z.string().max(200),
  dateTime: z.string().pipe(z.coerce.date()),
  maxParticipants: z.number().int().min(2).max(50),
});

const balanceTeamsSchema = z.object({
  teamCount: z.number().int().min(2).max(8).default(2),
});

const getRecommendationsSchema = z.object({
  activityTypeId: z.string().uuid("Invalid activity type ID").optional(),
  maxResults: z.number().int().min(1).max(20).default(10),
  includeSkillMatch: z.boolean().default(true),
  includeTimePreference: z.boolean().default(true),
});

// POST /matchmaking/find-players - Find recommended players for an activity
matchmakingRouter.post(
  "/find-players",
  authenticateToken,
  zValidator("json", findPlayersSchema),
  async (c) => {
    try {
      const user = c.get("user");
      const criteria = c.req.valid("json");

      console.log(
        `🎯 Finding players for ${user.username} in activity type ${criteria.activityTypeId}`
      );

      // Get user's current ELO for this activity type
      const [userELO] = await db
        .select({ eloScore: userActivityTypeELOs.eloScore })
        .from(userActivityTypeELOs)
        .where(
          and(
            eq(userActivityTypeELOs.userId, user.id),
            eq(userActivityTypeELOs.activityTypeId, criteria.activityTypeId)
          )
        )
        .limit(1);

      if (!userELO) {
        return c.json(
          {
            success: false,
            error: "No ELO rating found for this activity type",
            suggestion:
              "Complete at least one activity in this sport to get ELO-based recommendations",
          },
          400
        );
      }

      // Use the matchmaking service to find players
      const matchmakingCriteria = {
        activityTypeId: criteria.activityTypeId,
        userELO: userELO.eloScore,
        eloTolerance: criteria.eloTolerance,
        skillRequirements: criteria.skillRequirements,
        maxParticipants: criteria.maxResults,
        includeConnections: criteria.includeConnections,
        avoidRecentOpponents: criteria.avoidRecentOpponents,
      };

      const recommendations = await matchmakingService.findRecommendedPlayers(
        user.id,
        matchmakingCriteria
      );

      // Calculate summary statistics
      const summary = {
        totalRecommendations: recommendations.length,
        averageELO:
          recommendations.length > 0
            ? Math.round(
                recommendations.reduce(
                  (sum: number, r: any) => sum + r.currentELO,
                  0
                ) / recommendations.length
              )
            : userELO.eloScore,
        eloRange: {
          min: Math.min(
            ...recommendations.map((r: any) => r.currentELO),
            userELO.eloScore
          ),
          max: Math.max(
            ...recommendations.map((r: any) => r.currentELO),
            userELO.eloScore
          ),
        },
        compatibilityBreakdown: {
          excellent: recommendations.filter((r: any) => r.overallScore >= 85)
            .length,
          good: recommendations.filter(
            (r: any) => r.overallScore >= 70 && r.overallScore < 85
          ).length,
          fair: recommendations.filter(
            (r: any) => r.overallScore >= 50 && r.overallScore < 70
          ).length,
          poor: recommendations.filter((r: any) => r.overallScore < 50).length,
        },
        connections: recommendations.filter(
          (r: any) => r.connectionType === "friend"
        ).length,
        newPlayers: recommendations.filter(
          (r: any) => r.connectionType === "new"
        ).length,
      };

      return c.json({
        success: true,
        data: {
          userELO: userELO.eloScore,
          eloTolerance: criteria.eloTolerance,
          recommendations,
          summary,
        },
        message: `Found ${recommendations.length} player recommendations`,
      });
    } catch (error) {
      console.error("Error finding player recommendations:", error);
      return c.json(
        {
          success: false,
          error: "Failed to find player recommendations",
        },
        500
      );
    }
  }
);

// GET /matchmaking/recommended-activities - Get activity recommendations for user
matchmakingRouter.get(
  "/recommended-activities",
  authenticateToken,
  zValidator("query", getRecommendationsSchema),
  async (c) => {
    try {
      const user = c.get("user");
      const options = c.req.valid("query");

      console.log(`🎯 Getting activity recommendations for ${user.username}`);

      // Use the matchmaking service
      const recommendations =
        await matchmakingService.getActivityRecommendations(
          user.id,
          options.activityTypeId,
          options.maxResults,
          {
            includeSkillMatch: options.includeSkillMatch,
            includeTimePreference: options.includeTimePreference,
          }
        );

      // Organize recommendations by tiers
      const tiers = {
        perfect: recommendations.filter((r: any) => r.matchScore >= 90),
        excellent: recommendations.filter(
          (r: any) => r.matchScore >= 75 && r.matchScore < 90
        ),
        good: recommendations.filter(
          (r: any) => r.matchScore >= 60 && r.matchScore < 75
        ),
        fair: recommendations.filter((r: any) => r.matchScore < 60),
      };

      const summary = {
        totalRecommendations: recommendations.length,
        averageMatchScore:
          recommendations.length > 0
            ? Math.round(
                recommendations.reduce(
                  (sum: number, r: any) => sum + r.matchScore,
                  0
                ) / recommendations.length
              )
            : 0,
        upcomingCount: recommendations.filter(
          (r: any) => new Date(r.dateTime) > new Date()
        ).length,
        friendsActivities: recommendations.filter(
          (r: any) => r.hasConnectedParticipants
        ).length,
      };

      return c.json({
        success: true,
        data: {
          recommendations,
          summary,
          tiers,
        },
      });
    } catch (error) {
      console.error("Error getting activity recommendations:", error);
      return c.json(
        {
          success: false,
          error: "Failed to get activity recommendations",
        },
        500
      );
    }
  }
);

// POST /matchmaking/create-optimized-activity - Create activity with optimal ELO targeting
matchmakingRouter.post(
  "/create-optimized-activity",
  authenticateToken,
  zValidator("json", createOptimizedActivitySchema),
  async (c) => {
    try {
      const user = c.get("user");
      const activityData = c.req.valid("json");

      console.log(`🎯 Creating optimized activity for ${user.username}`);

      // Use the matchmaking service to create optimized activity
      const result = await matchmakingService.createOptimizedActivity(
        user.id,
        activityData.activityTypeId,
        activityData.description,
        activityData.location,
        activityData.dateTime,
        activityData.maxParticipants
      );

      return c.json({
        success: true,
        data: {
          activity: {
            id: result.activityId,
            eloLevel: result.suggestedELOLevel,
            difficultyTier: result.difficultyTier,
            estimatedParticipants: result.estimatedParticipants,
          },
          optimization: {
            eloTargeting: `Activity set to ${result.suggestedELOLevel} ELO (${result.difficultyTier} level)`,
            participantPool: `${result.estimatedParticipants} potential participants in ELO range`,
            recommendations:
              result.estimatedParticipants < 5
                ? [
                    "Consider widening ELO tolerance",
                    "Try different time slots",
                    "Invite friends directly",
                  ]
                : ["Great participant pool!", "Activity should fill quickly"],
          },
        },
        message: `Created optimized ${result.difficultyTier} level activity`,
      });
    } catch (error) {
      console.error("Error creating optimized activity:", error);
      return c.json(
        {
          success: false,
          error: "Failed to create optimized activity",
        },
        500
      );
    }
  }
);

// POST /matchmaking/balance-teams/:activityId - Balance teams for an activity
matchmakingRouter.post(
  "/balance-teams/:activityId",
  authenticateToken,
  zValidator("json", balanceTeamsSchema),
  async (c) => {
    try {
      const activityId = c.req.param("activityId");
      const user = c.get("user");
      const { teamCount } = c.req.valid("json");

      console.log(
        `⚖️ ${user.username} balancing teams for activity ${activityId}`
      );

      // Verify user is the activity creator or admin
      const [activity] = await db
        .select({
          id: activities.id,
          creatorId: activities.creatorId,
          activityTypeId: activities.activityTypeId,
        })
        .from(activities)
        .where(eq(activities.id, activityId))
        .limit(1);

      if (!activity) {
        return c.json(
          {
            success: false,
            error: "Activity not found",
          },
          404
        );
      }

      if (activity.creatorId !== user.id && user.role !== "admin") {
        return c.json(
          {
            success: false,
            error: "Only activity creator or admin can balance teams",
          },
          403
        );
      }

      // Get accepted participants with ELO scores
      const participants = await db
        .select({
          id: activityParticipants.id,
          userId: activityParticipants.userId,
          username: users.username, // Handle potential null?
          currentTeam: activityParticipants.team,
          eloScore: userActivityTypeELOs.eloScore,
        })
        .from(activityParticipants)
        .innerJoin(users, eq(users.id, activityParticipants.userId))
        .leftJoin(
          userActivityTypeELOs,
          and(
            eq(userActivityTypeELOs.userId, activityParticipants.userId),
            eq(userActivityTypeELOs.activityTypeId, activity.activityTypeId) // Use activityTypeId from activity
          )
        )
        .where(
          and(
            eq(activityParticipants.activityId, activityId),
            eq(activityParticipants.status, "accepted")
          )
        );

      if (participants.length < 2) {
        return c.json(
          {
            success: false,
            error: "Need at least 2 participants to balance teams",
          },
          400
        );
      }

      // Prepare data for the service
      const balanceParams = {
        participants: participants.map((p) => ({
          id: p.id, // If needed by the service
          userId: p.userId,
          username: p.username ?? "UnknownUser", // Handle potential null username
          currentTeam: p.currentTeam,
          eloScore: p.eloScore || 1200, // Default ELO if null
        })),
        teamCount: teamCount,
      };

      // Use the matchmaking service to balance teams
      const balanceResult = await matchmakingService.balanceTeams(
        balanceParams
      );

      if (!balanceResult.success) {
        return c.json(
          {
            success: false,
            error: balanceResult.error || "Failed to balance teams",
          },
          400
        );
      }

      const balancePercentage = Math.round(
        (balanceResult.metrics?.balance ?? 0) * 100
      );

      try {
        for (const teamAssignment of balanceResult.teams) {
          for (const member of teamAssignment.members) {
            await db
              .update(activityParticipants)
              .set({ team: teamAssignment.name })
              .where(
                and(
                  eq(activityParticipants.activityId, activityId),
                  eq(activityParticipants.userId, member.userId)
                )
              );
          }
        }
      } catch (dbError) {
        console.error("Error updating participant teams in DB:", dbError);
      }

      return c.json({
        success: true,
        data: balanceResult,
        message: `Teams balanced with ${balancePercentage}% balance score`,
      });
    } catch (error) {
      console.error("Error balancing teams:", error);

      if (error instanceof Error) {
        return c.json(
          {
            success: false,
            error: error.message,
          },
          400
        );
      }

      return c.json(
        {
          success: false,
          error: "Failed to balance teams",
        },
        500
      );
    }
  }
);

// GET /matchmaking/preview-teams/:activityId - Preview team balance without applying
matchmakingRouter.get(
  "/preview-teams/:activityId",
  authenticateToken,
  zValidator(
    "query",
    z.object({
      teamCount: z.number().int().min(2).max(8).default(2),
    })
  ),
  async (c) => {
    try {
      const activityId = c.req.param("activityId");
      const user = c.get("user");
      const { teamCount } = c.req.valid("query");

      console.log(
        `👁️ ${user.username} previewing team balance for activity ${activityId}`
      );

      // Get activity and verify access
      const [activity] = await db
        .select({
          id: activities.id,
          creatorId: activities.creatorId,
          activityTypeId: activities.activityTypeId,
        })
        .from(activities)
        .where(eq(activities.id, activityId))
        .limit(1);

      if (!activity) {
        return c.json(
          {
            success: false,
            error: "Activity not found",
          },
          404
        );
      }

      // Check if user is participant, creator, or admin
      const [participation] = await db
        .select()
        .from(activityParticipants)
        .where(
          and(
            eq(activityParticipants.activityId, activityId),
            eq(activityParticipants.userId, user.id)
          )
        )
        .limit(1);

      const hasAccess =
        participation ||
        activity.creatorId === user.id ||
        user.role === "admin";

      if (!hasAccess) {
        return c.json(
          {
            success: false,
            error: "Access denied",
          },
          403
        );
      }

      if (!hasAccess) {
        return c.json(
          {
            success: false,
            error: "Access denied",
          },
          403
        );
      }

      const participants = await db
        .select({
          id: activityParticipants.id,
          userId: activityParticipants.userId,
          username: users.username,
          currentTeam: activityParticipants.team,
          eloScore: userActivityTypeELOs.eloScore,
        })
        .from(activityParticipants)
        .innerJoin(users, eq(users.id, activityParticipants.userId))
        .leftJoin(
          userActivityTypeELOs,
          and(
            eq(userActivityTypeELOs.userId, activityParticipants.userId),
            eq(userActivityTypeELOs.activityTypeId, activity.activityTypeId)
          )
        )
        .where(
          and(
            eq(activityParticipants.activityId, activityId),
            eq(activityParticipants.status, "accepted")
          )
        );

      // Prepare data for the service
      const balanceParams = {
        participants: participants.map((p) => ({
          id: p.id,
          userId: p.userId,
          username: p.username ?? "UnknownUser",
          currentTeam: p.currentTeam,
          eloScore: p.eloScore || 1200,
        })),
        teamCount: teamCount,
      };

      const balanceResult = await matchmakingService.balanceTeams(
        balanceParams
      );

      return c.json({
        success: true,
        data: {
          preview: balanceResult,
          applied: false,
          canApply: activity.creatorId === user.id || user.role === "admin",
          message: `Team balance preview: ${balanceResult.metrics?.balance}% balance score`,
        },
      });
    } catch (error) {
      console.error("Error previewing team balance:", error);

      if (error instanceof Error) {
        return c.json(
          {
            success: false,
            error: error.message,
          },
          400
        );
      }

      return c.json(
        {
          success: false,
          error: "Failed to preview team balance",
        },
        500
      );
    }
  }
);

// GET /matchmaking/compatibility/:userId - Check compatibility with another user
matchmakingRouter.get(
  "/compatibility/:userId",
  authenticateToken,
  zValidator(
    "query",
    z.object({
      activityTypeId: z.string().uuid(),
    })
  ),
  async (c) => {
    try {
      const targetUserId = c.req.param("userId");
      const user = c.get("user");
      const { activityTypeId } = c.req.valid("query");

      console.log(
        `🤝 ${user.username} checking compatibility with ${targetUserId}`
      );

      if (targetUserId === user.id) {
        return c.json(
          {
            success: false,
            error: "Cannot check compatibility with yourself",
          },
          400
        );
      }

      // Verify target user exists
      const targetUser = await db.query.users.findFirst({
        where: eq(users.id, targetUserId),
      });

      if (!targetUser) {
        return c.json(
          {
            success: false,
            error: "User not found",
          },
          404
        );
      }

      // Get ELO scores for both users
      const [userELO, targetELO] = await Promise.all([
        db
          .select({ eloScore: userActivityTypeELOs.eloScore })
          .from(userActivityTypeELOs)
          .where(
            and(
              eq(userActivityTypeELOs.userId, user.id),
              eq(userActivityTypeELOs.activityTypeId, activityTypeId)
            )
          )
          .limit(1),
        db
          .select({ eloScore: userActivityTypeELOs.eloScore })
          .from(userActivityTypeELOs)
          .where(
            and(
              eq(userActivityTypeELOs.userId, targetUserId),
              eq(userActivityTypeELOs.activityTypeId, activityTypeId)
            )
          )
          .limit(1),
      ]);

      if (!userELO[0] || !targetELO[0]) {
        return c.json(
          {
            success: false,
            error: "ELO ratings not found for this activity type",
          },
          400
        );
      }

      // Calculate compatibility using matchmaking service
      const compatibility =
        await matchmakingService.calculatePlayerCompatibility(
          user.id,
          targetUserId,
          activityTypeId
        );

      const eloDifference = Math.abs(
        userELO[0].eloScore - targetELO[0].eloScore
      );
      const compatibilityLevel =
        eloDifference <= 100
          ? "Excellent"
          : eloDifference <= 200
          ? "Good"
          : eloDifference <= 300
          ? "Fair"
          : "Poor";

      return c.json({
        success: true,
        data: {
          targetUser: {
            id: targetUser.id,
            username: targetUser.username,
            avatarUrl: targetUser.avatarUrl,
          },
          compatibility: {
            score: compatibility.overallScore,
            level: compatibilityLevel,
            eloComparison: {
              yourELO: userELO[0].eloScore,
              theirELO: targetELO[0].eloScore,
              difference: eloDifference,
            },
            factors: compatibility.factors,
            recommendation: compatibility.recommendation,
          },
        },
      });
    } catch (error) {
      console.error("Error checking compatibility:", error);
      return c.json(
        {
          success: false,
          error: "Failed to check compatibility",
        },
        500
      );
    }
  }
);

// GET /matchmaking/statistics - Get matchmaking system statistics
matchmakingRouter.get("/statistics", authenticateToken, async (c) => {
  try {
    const user = c.get("user");

    console.log(`📊 Getting matchmaking statistics for ${user.username}`);

    // Get user's activity participation stats
    const userStats = await db
      .select({
        totalActivities: sql<number>`COUNT(*)`,
        totalSports: sql<number>`COUNT(DISTINCT ${activities.activityTypeId})`,
        averageParticipants: sql<number>`AVG(
          (SELECT COUNT(*) FROM ${activityParticipants} ap2 
           WHERE ap2.activity_id = ${activities.id} AND ap2.status = 'accepted')
        )`,
      })
      .from(activityParticipants)
      .leftJoin(activities, eq(activityParticipants.activityId, activities.id))
      .where(
        and(
          eq(activityParticipants.userId, user.id),
          eq(activityParticipants.status, "accepted")
        )
      );

    // Get user's ELO distribution
    const eloDistribution = await db
      .select({
        activityTypeName: activityTypes.name,
        eloScore: userActivityTypeELOs.eloScore,
        activityTypeId: activityTypes.id,
        gamesPlayed: userActivityTypeELOs.gamesPlayed,
        peakELO: userActivityTypeELOs.peakELO,
      })
      .from(userActivityTypeELOs)
      .leftJoin(
        activityTypes,
        eq(userActivityTypeELOs.activityTypeId, activityTypes.id)
      )
      .where(eq(userActivityTypeELOs.userId, user.id))
      .orderBy(desc(userActivityTypeELOs.eloScore));

    // Calculate global rankings (simplified)
    const globalRankings = await Promise.all(
      eloDistribution.map(async (elo) => {
        const higherRanked = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(userActivityTypeELOs)
          .where(
            and(
              eq(
                userActivityTypeELOs.activityTypeId,
                eloDistribution.find(
                  (e) => e.activityTypeName === elo.activityTypeName
                )?.activityTypeId || ""
              ),
              sql`${userActivityTypeELOs.eloScore} > ${elo.eloScore}`
            )
          );

        return {
          activityType: elo.activityTypeName,
          rank: (higherRanked[0]?.count || 0) + 1,
          elo: elo.eloScore,
        };
      })
    );

    return c.json({
      success: true,
      data: {
        userStats: userStats[0],
        eloDistribution,
        globalRankings,
        summary: {
          totalSports: eloDistribution.length,
          averageELO:
            eloDistribution.length > 0
              ? Math.round(
                  eloDistribution.reduce((sum, e) => sum + e.eloScore, 0) /
                    eloDistribution.length
                )
              : 0,
          bestSport: eloDistribution[0]?.activityTypeName || null,
          totalGamesPlayed: eloDistribution.reduce(
            (sum, e) => sum + (e.gamesPlayed || 0),
            0
          ),
        },
      },
    });
  } catch (error) {
    console.error("Error getting matchmaking statistics:", error);
    return c.json(
      {
        success: false,
        error: "Failed to get statistics",
      },
      500
    );
  }
});
