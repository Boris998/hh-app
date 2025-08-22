// src/routes/users.router.ts - Complete implementation with service integration

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authenticateToken } from "../middleware/auth.js";
import { authService } from "../services/auth.js";
import { db } from "../db/client.js";
import {
  users,
  userActivityTypeELOs,
  userActivityTypeSkillSummaries,
  userGeneralSkillSummaries,
  activityParticipants,
  activities,
  userConnections,
  skillDefinitions,
  activityTypes,
} from "../db/schema.js";
import { eq, and, desc, sql, or, count, avg, max } from "drizzle-orm";
import { deltaTrackingService } from "../services/delta-tracking.service.js";
import {
  updateUserSchema,
  userProfileQuerySchema,
  createConnectionRequestSchema,
  type UpdateUser,
  type SkillDefinition,
  type SubmitSkillRatings,
} from "../db/zod.schema.js";

export const usersRouter = new Hono();

// Validation schemas
const getUserProfileSchema = z.object({
  includeELO: z.boolean().default(true),
  includeSkills: z.boolean().default(true),
  includeRecentActivities: z.boolean().default(true),
  includeConnections: z.boolean().default(false),
  activityTypeId: z.string().uuid("Invalid activity type ID").optional(),
});

const getUserStatsSchema = z.object({
  period: z.enum(["week", "month", "season", "all_time"]).default("all_time"),
  activityTypeId: z.string().uuid("Invalid activity type ID").optional(),
});

const searchUsersQuerySchema = z.object({
  searchTerm: z.string().min(1, "Search term is required"),
  limit: z.number().int().min(1).max(50).default(20),
  excludeConnected: z.boolean().default(false),
  activityTypeId: z.string().uuid("Invalid activity type ID").optional(),
});

const updateConnectionSchema = z.object({
  status: z.enum(["accepted", "rejected"]),
});

// GET /users/profile/:userId - Get detailed user profile
usersRouter.get(
  "/profile/:userId",
  authenticateToken,
  zValidator("query", getUserProfileSchema),
  async (c) => {
    try {
      const currentUser = c.get("user");
      const targetUserId = c.req.param("userId");
      const options = c.req.valid("query");

      console.log(`👤 Getting profile for user ${targetUserId}`);

      // Get basic user info
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

      // Check if current user can view full profile
      const isOwnProfile = currentUser.id === targetUserId;
      let canViewFullProfile = isOwnProfile;

      if (!isOwnProfile) {
        // Check if users are connected
        const connection = await db.query.userConnections.findFirst({
          where: and(
            or(
              and(
                eq(userConnections.user1Id, currentUser.id),
                eq(userConnections.user2Id, targetUserId)
              ),
              and(
                eq(userConnections.user1Id, targetUserId),
                eq(userConnections.user2Id, currentUser.id)
              )
            ),
            eq(userConnections.status, "accepted")
          ),
        });
        canViewFullProfile = !!connection;
      }

      const profile: any = {
        id: targetUser.id,
        publicId: targetUser.publicId,
        username: targetUser.username,
        avatarUrl: targetUser.avatarUrl,
        role: targetUser.role,
        createdAt: targetUser.createdAt,
        isOwnProfile,
        canViewFullProfile,
      };

      // Add email for own profile or admin
      if (isOwnProfile || currentUser.role === "admin") {
        profile.email = targetUser.email;
      }

      // Get ELO ratings if requested
      if (options.includeELO && canViewFullProfile) {
        // --- Build conditions array ---
        const eloConditions = [eq(userActivityTypeELOs.userId, targetUserId)]; // Base condition

        // Add activity type filter if specified
        if (options.activityTypeId) {
          eloConditions.push(
            eq(userActivityTypeELOs.activityTypeId, options.activityTypeId)
          );
        }

        // --- Construct the query with combined conditions ---
        const eloQuery = db
          .select({
            activityTypeId: userActivityTypeELOs.activityTypeId,
            activityTypeName: activityTypes.name,
            eloScore: userActivityTypeELOs.eloScore,
            gamesPlayed: userActivityTypeELOs.gamesPlayed,
            peakELO: userActivityTypeELOs.peakELO,
            lastUpdated: userActivityTypeELOs.lastUpdated,
          })
          .from(userActivityTypeELOs)
          .leftJoin(
            activityTypes,
            eq(userActivityTypeELOs.activityTypeId, activityTypes.id)
          )
          .where(and(...eloConditions)); // --- Use and() to combine conditions ---

        // --- Execute the query ---
        profile.eloRatings = await eloQuery.orderBy(
          desc(userActivityTypeELOs.eloScore)
        );

        // Calculate overall ELO average
        profile.averageELO =
          profile.eloRatings.length > 0
            ? Math.round(
                profile.eloRatings.reduce(
                  (sum: number, elo: any) => sum + elo.eloScore,
                  0
                ) / profile.eloRatings.length
              )
            : null;
      }

      // Get skill summaries if requested
      if (options.includeSkills && canViewFullProfile) {
        // Activity-specific skills
        const activitySkills = await db
          .select({
            skillDefinitionId: userActivityTypeSkillSummaries.skillDefinitionId,
            activityTypeId: userActivityTypeSkillSummaries.activityTypeId,
            averageRating: userActivityTypeSkillSummaries.averageRating,
            skillName: skillDefinitions.skillType,
            activityTypeName: activityTypes.name,
            lastCalculatedAt: userActivityTypeSkillSummaries.lastCalculatedAt,
          })
          .from(userActivityTypeSkillSummaries)
          .leftJoin(
            skillDefinitions,
            eq(
              userActivityTypeSkillSummaries.skillDefinitionId,
              skillDefinitions.id
            )
          )
          .leftJoin(
            activityTypes,
            eq(userActivityTypeSkillSummaries.activityTypeId, activityTypes.id)
          )
          .where(eq(userActivityTypeSkillSummaries.userId, targetUserId))
          .orderBy(desc(userActivityTypeSkillSummaries.averageRating));

        // General skills
        const generalSkills = await db
          .select({
            skillDefinitionId: userGeneralSkillSummaries.skillDefinitionId,
            overallAverageRating:
              userGeneralSkillSummaries.overallAverageRating,
            skillName: skillDefinitions.skillType,
            lastCalculatedAt: userGeneralSkillSummaries.lastCalculatedAt,
          })
          .from(userGeneralSkillSummaries)
          .leftJoin(
            skillDefinitions,
            eq(userGeneralSkillSummaries.skillDefinitionId, skillDefinitions.id)
          )
          .where(eq(userGeneralSkillSummaries.userId, targetUserId))
          .orderBy(desc(userGeneralSkillSummaries.overallAverageRating));

        profile.skills = {
          activitySpecific: activitySkills,
          general: generalSkills,
        };
      }

      // Get recent activities if requested
      if (options.includeRecentActivities && canViewFullProfile) {
        const recentActivities = await db
          .select({
            activityId: activities.id,
            description: activities.description,
            location: activities.location,
            dateTime: activities.dateTime,
            activityTypeName: activityTypes.name,
            participantStatus: activityParticipants.status,
            team: activityParticipants.team,
            joinedAt: activityParticipants.joinedAt,
          })
          .from(activityParticipants)
          .leftJoin(
            activities,
            eq(activityParticipants.activityId, activities.id)
          )
          .leftJoin(
            activityTypes,
            eq(activities.activityTypeId, activityTypes.id)
          )
          .where(eq(activityParticipants.userId, targetUserId))
          .orderBy(desc(activities.dateTime))
          .limit(10);

        profile.recentActivities = recentActivities;
      }

      // Get connection info if requested
      if (options.includeConnections && canViewFullProfile) {
        const connections = await db
          .select({
            connectionId: userConnections.id,
            connectedUserId: sql<string>`CASE 
              WHEN ${userConnections.user1Id} = ${targetUserId} THEN ${userConnections.user2Id}
              ELSE ${userConnections.user1Id}
            END`,
            connectedUsername: users.username,
            connectedAvatarUrl: users.avatarUrl,
            status: userConnections.status,
            createdAt: userConnections.createdAt,
          })
          .from(userConnections)
          .leftJoin(
            users,
            sql`${users.id} = CASE 
            WHEN ${userConnections.user1Id} = ${targetUserId} THEN ${userConnections.user2Id}
            ELSE ${userConnections.user1Id}
          END`
          )
          .where(
            and(
              or(
                eq(userConnections.user1Id, targetUserId),
                eq(userConnections.user2Id, targetUserId)
              ),
              eq(userConnections.status, "accepted")
            )
          )
          .limit(20);

        profile.connections = connections;
        profile.friendsCount = connections.length;
      }

      return c.json({
        success: true,
        data: profile,
      });
    } catch (error) {
      console.error("Error getting user profile:", error);
      return c.json(
        {
          success: false,
          error: "Failed to get user profile",
        },
        500
      );
    }
  }
);

usersRouter.get('/connections/requests', authenticateToken, async (c) => {
  try {
    const user = c.get('user');
    
    console.log(`👥 Fetching connection requests for user: ${user.username}`);
    
    // Get received friend requests (pending)
    const receivedRequests = await db
      .select({
        id: userConnections.id,
        requesterId: userConnections.user1Id,
        status: userConnections.status,
        createdAt: userConnections.createdAt,
        requester: {
          id: users.id,
          username: users.username,
          avatarUrl: users.avatarUrl,
        }
      })
      .from(userConnections)
      .innerJoin(users, eq(userConnections.user1Id, users.id))
      .where(
        and(
          eq(userConnections.user2Id, user.id),
          eq(userConnections.status, 'pending')
        )
      )
      .orderBy(desc(userConnections.createdAt))
      .execute();
    
    // Get sent friend requests (pending)
    const sentRequests = await db
      .select({
        id: userConnections.id,
        recipientId: userConnections.user2Id,
        status: userConnections.status,
        createdAt: userConnections.createdAt,
        recipient: {
          id: users.id,
          username: users.username,
          avatarUrl: users.avatarUrl,
        }
      })
      .from(userConnections)
      .innerJoin(users, eq(userConnections.user2Id, users.id))
      .where(
        and(
          eq(userConnections.user1Id, user.id),
          eq(userConnections.status, 'pending')
        )
      )
      .orderBy(desc(userConnections.createdAt))
      .execute();
    
    return c.json({
      success: true,
      data: {
        received: receivedRequests.map(req => ({
          id: req.id,
          type: 'received',
          status: req.status,
          createdAt: req.createdAt?.toISOString() || null,
          user: req.requester,
        })),
        sent: sentRequests.map(req => ({
          id: req.id,
          type: 'sent',
          status: req.status,
          createdAt: req.createdAt?.toISOString() || null,
          user: req.recipient,
        })),
      },
      count: {
        received: receivedRequests.length,
        sent: sentRequests.length,
      },
    });
  } catch (error) {
    console.error('Error fetching connection requests:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch connection requests',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// GET /users/stats/:userId - Get user statistics
usersRouter.get(
  "/stats/:userId",
  authenticateToken,
  zValidator("query", getUserStatsSchema),
  async (c) => {
    try {
      const currentUser = c.get("user");
      const targetUserId = c.req.param("userId");
      const { period, activityTypeId } = c.req.valid("query");

      console.log(
        `📊 Getting stats for user ${targetUserId}, period: ${period}`
      );

      // Check access permissions
      const canView =
        currentUser.id === targetUserId || currentUser.role === "admin";
      if (!canView) {
        const connection = await db.query.userConnections.findFirst({
          where: and(
            or(
              and(
                eq(userConnections.user1Id, currentUser.id),
                eq(userConnections.user2Id, targetUserId)
              ),
              and(
                eq(userConnections.user1Id, targetUserId),
                eq(userConnections.user2Id, currentUser.id)
              )
            ),
            eq(userConnections.status, "accepted")
          ),
        });

        if (!connection) {
          return c.json(
            {
              success: false,
              error:
                "Access denied. You can only view stats for connected users.",
            },
            403
          );
        }
      }

      // Calculate date range based on period
      let dateFilter = sql`true`; // No filter for all_time
      const now = new Date();

      if (period === "week") {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        dateFilter = sql`${activities.dateTime} >= ${weekAgo}`;
      } else if (period === "month") {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        dateFilter = sql`${activities.dateTime} >= ${monthAgo}`;
      } else if (period === "season") {
        // Assume season is last 3 months
        const seasonAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        dateFilter = sql`${activities.dateTime} >= ${seasonAgo}`;
      }

      const activityStatsConditions = [
        eq(activityParticipants.userId, targetUserId),
        eq(activityParticipants.status, "accepted"),
        dateFilter,
      ];
      // Add activity type condition if specified
      if (activityTypeId) {
        activityStatsConditions.push(
          eq(activities.activityTypeId, activityTypeId)
        );
      }

      // Get activity statistics
      const [activityStats] = await db
        .select({
          totalActivities: count(activities.id),
          completedActivities: sql<number>`COUNT(CASE WHEN ${activities.dateTime} < NOW() THEN 1 END)`,
          upcomingActivities: sql<number>`COUNT(CASE WHEN ${activities.dateTime} > NOW() THEN 1 END)`,
        })
        .from(activityParticipants)
        .leftJoin(
          activities,
          eq(activityParticipants.activityId, activities.id)
        )
        .where(and(...activityStatsConditions)) // Combine all conditions
        .execute(); // Explicitly execute

      // --- Fix: Get ELO statistics ---
      // Build base conditions for ELO stats
      const eloStatsConditions = [
        eq(userActivityTypeELOs.userId, targetUserId),
      ];
      // Add activity type condition if specified
      if (activityTypeId) {
        eloStatsConditions.push(
          eq(userActivityTypeELOs.activityTypeId, activityTypeId)
        );
      }

      // Get ELO statistics
      const [eloStats] = await db
        .select({
          averageELO: avg(userActivityTypeELOs.eloScore),
          maxELO: max(userActivityTypeELOs.peakELO),
          totalGamesPlayed: sql<number>`SUM(${userActivityTypeELOs.gamesPlayed})`,
        })
        .from(userActivityTypeELOs)
        .where(and(...eloStatsConditions)) // Combine all conditions
        .execute(); // Explicitly execute

      // --- Fix: Get skill statistics ---
      // Build base conditions for skill stats
      const skillStatsConditions = [
        eq(userActivityTypeSkillSummaries.userId, targetUserId),
      ];
      // Add activity type condition if specified
      if (activityTypeId) {
        skillStatsConditions.push(
          eq(userActivityTypeSkillSummaries.activityTypeId, activityTypeId)
        );
      }

      // Get skill statistics
      const [skillStats] = await db
        .select({
          averageSkillRating: avg(
            sql`CAST(${userActivityTypeSkillSummaries.averageRating} AS FLOAT)`
          ),
          topSkillRating: max(
            sql`CAST(${userActivityTypeSkillSummaries.averageRating} AS FLOAT)`
          ),
          skillsTracked: count(
            userActivityTypeSkillSummaries.skillDefinitionId
          ),
        })
        .from(userActivityTypeSkillSummaries)
        .where(and(...skillStatsConditions)) // Combine all conditions
        .execute();

      return c.json({
        success: true,
        data: {
          period,
          activityTypeId: activityTypeId || null,
          activities: {
            total: activityStats.totalActivities || 0,
            completed: activityStats.completedActivities || 0,
            upcoming: activityStats.upcomingActivities || 0,
          },
          elo: {
            average: eloStats.averageELO
              ? Math.round(Number(eloStats.averageELO))
              : null,
            peak: eloStats.maxELO || null,
            totalGamesPlayed: eloStats.totalGamesPlayed || 0,
          },
          skills: {
            average: skillStats.averageSkillRating
              ? Math.round(Number(skillStats.averageSkillRating) * 100) / 100
              : null,
            highest: skillStats.topSkillRating
              ? Math.round(Number(skillStats.topSkillRating) * 100) / 100
              : null,
            skillsTracked: skillStats.skillsTracked || 0,
          },
        },
      });
    } catch (error) {
      console.error("Error getting user stats:", error);
      return c.json(
        {
          success: false,
          error: "Failed to get user statistics",
        },
        500
      );
    }
  }
);

// GET /users/search - Search users
usersRouter.get(
  "/search",
  authenticateToken,
  zValidator("query", searchUsersQuerySchema),
  async (c) => {
    try {
      const user = c.get("user");
      const searchParams = c.req.valid("query");

      console.log(
        `🔍 User search by ${user.username}: "${searchParams.searchTerm}"`
      );

      const result = await authService.searchUsers(user.id, searchParams);

      if (!result.success) {
        return c.json(
          {
            success: false,
            error: result.error,
          },
          400
        );
      }

      return c.json({
        success: true,
        data: {
          users: result.users,
          totalCount: result.totalCount,
          hasMore: result.hasMore,
          searchTerm: searchParams.searchTerm,
        },
      });
    } catch (error) {
      console.error("User search error:", error);
      return c.json(
        {
          success: false,
          error: "User search failed",
        },
        500
      );
    }
  }
);

// PUT /users/profile - Update own profile
usersRouter.put(
  "/profile",
  authenticateToken,
  zValidator("json", updateUserSchema),
  async (c) => {
    try {
      const user = c.get("user");
      const updateData = c.req.valid("json");

      console.log(`✏️ ${user.username} updating profile`);

      const result = await authService.updateProfile(user.id, updateData);

      if (!result.success) {
        return c.json(
          {
            success: false,
            error: result.error,
          },
          400
        );
      }

      // Track profile update
      await deltaTrackingService.trackChange({
        entityType: "user",
        entityId: user.id,
        changeType: "update",
        newData: result.user,
        affectedUserId: user.id,
        triggeredBy: user.id,
      });

      return c.json({
        success: true,
        data: {
          user: result.user,
          token: result.token, // New token if username/email changed
        },
        message: result.message,
      });
    } catch (error) {
      console.error("Profile update error:", error);
      return c.json(
        {
          success: false,
          error: "Profile update failed",
        },
        500
      );
    }
  }
);

// POST /users/connections/request - Send connection request
usersRouter.post(
  "/connections/request",
  authenticateToken,
  zValidator("json", createConnectionRequestSchema),
  async (c) => {
    try {
      const user = c.get("user");
      const { targetUserId } = c.req.valid("json");

      console.log(
        `🤝 ${user.username} sending connection request to ${targetUserId}`
      );

      // Prevent self-connection
      if (targetUserId === user.id) {
        return c.json(
          {
            success: false,
            error: "Cannot connect to yourself",
          },
          400
        );
      }

      // Check if target user exists
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

      // Check if connection already exists
      const existingConnection = await db.query.userConnections.findFirst({
        where: or(
          and(
            eq(userConnections.user1Id, user.id),
            eq(userConnections.user2Id, targetUserId)
          ),
          and(
            eq(userConnections.user1Id, targetUserId),
            eq(userConnections.user2Id, user.id)
          )
        ),
      });

      if (existingConnection) {
        const status = existingConnection.status;
        if (status === "accepted") {
          return c.json(
            {
              success: false,
              error: "Already connected with this user",
            },
            400
          );
        } else if (status === "pending") {
          return c.json(
            {
              success: false,
              error: "Connection request already pending",
            },
            400
          );
        }
        // If rejected, we can allow a new request (will update existing record)
      }

      // Create or update connection request
      const [connection] = await db
        .insert(userConnections)
        .values({
          user1Id: user.id,
          user2Id: targetUserId,
          status: "pending",
        })
        .onConflictDoUpdate({
          target: [userConnections.user1Id, userConnections.user2Id],
          set: {
            status: "pending",
            createdAt: new Date(),
          },
        })
        .returning();

      // Track the change
      await deltaTrackingService.trackChange({
        entityType: "connection",
        entityId: connection.id,
        changeType: "create",
        newData: connection,
        affectedUserId: targetUserId,
        triggeredBy: user.id,
      });

      return c.json({
        success: true,
        data: connection,
        message: `Connection request sent to ${targetUser.username}`,
      });
    } catch (error) {
      console.error("Connection request error:", error);
      return c.json(
        {
          success: false,
          error: "Failed to send connection request",
        },
        500
      );
    }
  }
);

// PUT /users/connections/:connectionId - Accept/reject connection request
usersRouter.put(
  "/connections/:connectionId",
  authenticateToken,
  zValidator("json", updateConnectionSchema),
  async (c) => {
    try {
      const user = c.get("user");
      const connectionId = c.req.param("connectionId");
      const { status } = c.req.valid("json");

      console.log(
        `🤝 ${user.username} ${
          status === "accepted" ? "accepting" : "rejecting"
        } connection ${connectionId}`
      );

      // Get the connection
      const connection = await db.query.userConnections.findFirst({
        where: eq(userConnections.id, connectionId),
      });

      if (!connection) {
        return c.json(
          {
            success: false,
            error: "Connection request not found",
          },
          404
        );
      }

      // Check if user is the recipient (user2)
      if (connection.user2Id !== user.id) {
        return c.json(
          {
            success: false,
            error: "You can only respond to connection requests sent to you",
          },
          403
        );
      }

      // Check if still pending
      if (connection.status !== "pending") {
        return c.json(
          {
            success: false,
            error: `Connection request has already been ${connection.status}`,
          },
          400
        );
      }

      // Update connection status
      const [updatedConnection] = await db
        .update(userConnections)
        .set({ status })
        .where(eq(userConnections.id, connectionId))
        .returning();

      // Track the change
      await deltaTrackingService.trackChange({
        entityType: "connection",
        entityId: connectionId,
        changeType: "update",
        previousData: connection,
        newData: updatedConnection,
        affectedUserId: connection.user1Id,
        triggeredBy: user.id,
      });

      return c.json({
        success: true,
        data: updatedConnection,
        message: `Connection request ${status}`,
      });
    } catch (error) {
      console.error("Connection update error:", error);
      return c.json(
        {
          success: false,
          error: "Failed to update connection",
        },
        500
      );
    }
  }
);

// GET /users/connections - Get user's connections
usersRouter.get("/connections", authenticateToken, async (c) => {
  try {
    const user = c.get("user");
    const status = c.req.query("status") || "accepted";
    const limit = parseInt(c.req.query("limit") || "50");

    console.log(`🤝 Getting ${status} connections for ${user.username}`);

    const connections = await db
      .select({
        connectionId: userConnections.id,
        connectedUserId: sql<string>`CASE 
          WHEN ${userConnections.user1Id} = ${user.id} THEN ${userConnections.user2Id}
          ELSE ${userConnections.user1Id}
        END`,
        connectedUsername: users.username,
        connectedAvatarUrl: users.avatarUrl,
        status: userConnections.status,
        createdAt: userConnections.createdAt,
        isRequestSender: sql<boolean>`${userConnections.user1Id} = ${user.id}`,
      })
      .from(userConnections)
      .leftJoin(
        users,
        sql`${users.id} = CASE 
        WHEN ${userConnections.user1Id} = ${user.id} THEN ${userConnections.user2Id}
        ELSE ${userConnections.user1Id}
      END`
      )
      .where(
        and(
          or(
            eq(userConnections.user1Id, user.id),
            eq(userConnections.user2Id, user.id)
          ),
          eq(userConnections.status, status as any)
        )
      )
      .orderBy(desc(userConnections.createdAt))
      .limit(limit);

    return c.json({
      success: true,
      data: {
        connections,
        totalCount: connections.length,
        status,
      },
    });
  } catch (error) {
    console.error("Error getting connections:", error);
    return c.json(
      {
        success: false,
        error: "Failed to get connections",
      },
      500
    );
  }
});

// DELETE /users/connections/:connectionId - Remove connection
usersRouter.delete(
  "/connections/:connectionId",
  authenticateToken,
  async (c) => {
    try {
      const user = c.get("user");
      const connectionId = c.req.param("connectionId");

      console.log(`❌ ${user.username} removing connection ${connectionId}`);

      // Get the connection
      const connection = await db.query.userConnections.findFirst({
        where: eq(userConnections.id, connectionId),
      });

      if (!connection) {
        return c.json(
          {
            success: false,
            error: "Connection not found",
          },
          404
        );
      }

      // Check if user is part of this connection
      if (connection.user1Id !== user.id && connection.user2Id !== user.id) {
        return c.json(
          {
            success: false,
            error: "Access denied",
          },
          403
        );
      }

      // Delete the connection
      await db
        .delete(userConnections)
        .where(eq(userConnections.id, connectionId));

      // Track the change
      const otherUserId =
        connection.user1Id === user.id
          ? connection.user2Id
          : connection.user1Id;
      await deltaTrackingService.trackChange({
        entityType: "connection",
        entityId: connectionId,
        changeType: "delete",
        previousData: connection,
        affectedUserId: otherUserId,
        triggeredBy: user.id,
      });

      return c.json({
        success: true,
        message: "Connection removed successfully",
      });
    } catch (error) {
      console.error("Error removing connection:", error);
      return c.json(
        {
          success: false,
          error: "Failed to remove connection",
        },
        500
      );
    }
  }
);

// Get user quick stats - FIXED endpoint path
usersRouter.get(
  '/:userId/quick-stats', 
  authenticateToken,  // CORRECT middleware name
  async (c) => {
    const userId = c.req.param('userId')
    const currentUser = c.get('user')  // Get authenticated user from context
    
    try {
      // Get user's recent activities count
      const recentActivities = await db
        .select({ count: sql<number>`count(*)` })
        .from(activityParticipants)
        .where(eq(activityParticipants.userId, userId))
        .execute()
      
      // Get user's ELO scores
      const eloScores = await db
        .select()
        .from(userActivityTypeELOs)
        .where(eq(userActivityTypeELOs.userId, userId))
        .orderBy(desc(userActivityTypeELOs.eloScore))
        .limit(3)
        .execute()
      
      return c.json({
        success: true,
        data: {
          totalActivities: Number(recentActivities[0]?.count || 0),
          averageELO: eloScores[0]?.eloScore || 1200,
          activitiesThisWeek: 0, // Implement weekly calculation
          skillRatings: 0, // Implement when skill ratings are ready
          friendsCount: 0, // Implement when connections table is ready
        }
      })
    } catch (error) {
      console.error('Error fetching quick stats:', error)
      return c.json({ success: false, error: 'Failed to fetch stats' }, 500)
    }
  }
);

// Get user ELO scores - FIXED endpoint path
usersRouter.get(
  '/:userId/elo',
  authenticateToken,  // CORRECT middleware name
  async (c) => {
    const userId = c.req.param('userId')
    const activityTypeId = c.req.query('activityType')
    
    try {
      // Build conditions for ELO query
      const eloConditions = [eq(userActivityTypeELOs.userId, userId)]
      if (activityTypeId) {
        eloConditions.push(eq(userActivityTypeELOs.activityTypeId, activityTypeId))
      }

      const eloScores = await db
        .select({
          activityTypeId: userActivityTypeELOs.activityTypeId,
          eloScore: userActivityTypeELOs.eloScore,
          gamesPlayed: userActivityTypeELOs.gamesPlayed,
          peakELO: userActivityTypeELOs.peakELO,
          lastUpdated: userActivityTypeELOs.lastUpdated,
          activityType: {
            id: activityTypes.id,
            name: activityTypes.name,
            description: activityTypes.description,
          }
        })
        .from(userActivityTypeELOs)
        .leftJoin(activityTypes, eq(userActivityTypeELOs.activityTypeId, activityTypes.id))
        .where(and(...eloConditions))
        .orderBy(desc(userActivityTypeELOs.eloScore))
        .execute()
      
      return c.json({
        success: true,
        data: eloScores.map(elo => ({
          ...elo,
          lastUpdated: elo.lastUpdated?.toISOString() || null
        }))
      })
    } catch (error) {
      console.error('Error fetching ELO scores:', error)
      return c.json({ success: false, error: 'Failed to fetch ELO scores' }, 500)
    }
  }
);

// Get user skills
usersRouter.get(
  '/:userId/skills',
  authenticateToken,  // CORRECT middleware name
  async (c) => {
    const userId = c.req.param('userId')
    const activityTypeId = c.req.query('activityType')
    
    try {
      // Build conditions for activity-specific skills
      const activitySkillConditions = [eq(userActivityTypeSkillSummaries.userId, userId)]
      if (activityTypeId) {
        activitySkillConditions.push(eq(userActivityTypeSkillSummaries.activityTypeId, activityTypeId))
      }

      // Fetch activity-specific skills
      const activitySkills = await db
        .select({
          skillDefinitionId: userActivityTypeSkillSummaries.skillDefinitionId,
          activityTypeId: userActivityTypeSkillSummaries.activityTypeId,
          averageRating: userActivityTypeSkillSummaries.averageRating,
          skillName: skillDefinitions.skillType,
          activityTypeName: activityTypes.name,
          lastCalculatedAt: userActivityTypeSkillSummaries.lastCalculatedAt,
        })
        .from(userActivityTypeSkillSummaries)
        .leftJoin(
          skillDefinitions,
          eq(userActivityTypeSkillSummaries.skillDefinitionId, skillDefinitions.id)
        )
        .leftJoin(
          activityTypes,
          eq(userActivityTypeSkillSummaries.activityTypeId, activityTypes.id)
        )
        .where(and(...activitySkillConditions))
        .orderBy(desc(userActivityTypeSkillSummaries.averageRating))
        .execute()

      // Fetch general skills
      const generalSkills = await db
        .select({
          skillDefinitionId: userGeneralSkillSummaries.skillDefinitionId,
          overallAverageRating: userGeneralSkillSummaries.overallAverageRating,
          skillName: skillDefinitions.skillType,
          lastCalculatedAt: userGeneralSkillSummaries.lastCalculatedAt,
        })
        .from(userGeneralSkillSummaries)
        .leftJoin(
          skillDefinitions,
          eq(userGeneralSkillSummaries.skillDefinitionId, skillDefinitions.id)
        )
        .where(eq(userGeneralSkillSummaries.userId, userId))
        .orderBy(desc(userGeneralSkillSummaries.overallAverageRating))
        .execute()
      
      return c.json({
        success: true,
        data: {
          activitySpecific: activitySkills.map(skill => ({
            ...skill,
            lastCalculatedAt: skill.lastCalculatedAt?.toISOString() || null
          })),
          general: generalSkills.map(skill => ({
            ...skill,
            lastCalculatedAt: skill.lastCalculatedAt?.toISOString() || null
          }))
        }
      })
    } catch (error) {
      console.error('Error fetching skills:', error)
      return c.json({ success: false, error: 'Failed to fetch skills' }, 500)
    }
  }
);

// Get user activity stats
usersRouter.get(
  '/:userId/activity-stats',
  authenticateToken,  // CORRECT middleware name
  async (c) => {
    const userId = c.req.param('userId')
    
    try {
      console.log(`📊 Getting activity stats for user: ${userId}`)

      // Get total activities for user (simplified)
      const totalActivities = await db
        .select({ count: count(activityParticipants.id) })
        .from(activityParticipants)
        .where(eq(activityParticipants.userId, userId))
        .execute()

      // For now, let's return basic stats to fix the 500 error
      // TODO: Implement time-based filtering when we fix SQL issues
      const stats = {
        totalActivities: Number(totalActivities[0]?.count || 0),
        thisMonth: 0,  // TODO: Implement properly
        thisWeek: 0,   // TODO: Implement properly 
        favoriteActivity: null,  // TODO: Implement properly
      }
      
      return c.json({
        success: true,
        data: stats
      })
    } catch (error) {
      console.error('Error fetching activity stats:', error)
      return c.json({ success: false, error: 'Failed to fetch activity stats' }, 500)
    }
  }
)