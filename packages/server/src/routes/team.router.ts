// src/routes/teams.router.ts - Complete implementation for team management

import { zValidator } from "@hono/zod-validator";
import { and, asc, avg, count, desc, eq, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  activityTypes,
  teamMembers,
  teams,
  userActivityTypeELOs,
  users,
} from "../db/schema.js";
import { updateTeamSchema } from "../db/zod.schema.js";
import { authenticateToken } from "../middleware/auth.js";
import { deltaTrackingService } from "../services/delta-tracking.service.js";

export const teamsRouter = new Hono();

// Validation schemas
const createTeamSchema = z.object({
  name: z
    .string()
    .min(1, "Team name is required")
    .max(100, "Team name too long"),
  description: z.string().max(1000, "Description too long").optional(),
  logoUrl: z.string().url("Invalid logo URL").optional(),
  isPrivate: z.boolean().default(false),
  maxMembers: z.number().int().min(2).max(50).optional(),
  activityTypeId: z.string().uuid("Invalid activity type ID").optional(),
  initialMembers: z.array(z.string().uuid()).optional().default([]),
});

const getTeamsSchema = z.object({
  includeMembers: z.boolean().default(false),
  includeStats: z.boolean().default(false),
  activityTypeId: z.string().uuid("Invalid activity type ID").optional(),
  isPrivate: z.boolean().optional(),
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).default(0),
  search: z.string().optional(),
});

const manageMemberSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  role: z.string().max(50).default("member"),
});

const updateMemberRoleSchema = z.object({
  role: z.string().max(50),
});

// POST /teams - Create a new team
teamsRouter.post(
  "/",
  authenticateToken,
  zValidator("json", createTeamSchema),
  async (c) => {
    try {
      const user = c.get("user");
      const teamData = c.req.valid("json");

      console.log(`👥 ${user.username} creating team: ${teamData.name}`);

      // Check if team name already exists (case-insensitive)
      const existingTeam = await db.query.teams.findFirst({
        where: sql`LOWER(${teams.name}) = LOWER(${teamData.name})`,
      });

      if (existingTeam) {
        return c.json(
          {
            success: false,
            error: "A team with this name already exists",
          },
          400
        );
      }

      // Validate activity type if provided
      if (teamData.activityTypeId) {
        const activityType = await db.query.activityTypes.findFirst({
          where: eq(activityTypes.id, teamData.activityTypeId),
        });

        if (!activityType) {
          return c.json(
            {
              success: false,
              error: "Invalid activity type",
            },
            400
          );
        }
      }

      // Create the team
      const [newTeam] = await db
        .insert(teams)
        .values({
          name: teamData.name,
          description: teamData.description,
          creatorId: user.id,
          isPrivate: teamData.isPrivate,
          maxMembers: teamData.maxMembers,
          activityTypeId: teamData.activityTypeId,
        })
        .returning();

      // Add creator as admin member
      await db.insert(teamMembers).values({
        teamId: newTeam.id,
        userId: user.id,
        role: "admin",
      });

      // Add initial members if provided
      if (teamData.initialMembers && teamData.initialMembers.length > 0) {
        const memberValues = teamData.initialMembers
          .filter((memberId) => memberId !== user.id) // Don't duplicate creator
          .map((memberId) => ({
            teamId: newTeam.id,
            userId: memberId,
            role: "member",
          }));

        if (memberValues.length > 0) {
          await db.insert(teamMembers).values(memberValues);
        }
      }

      // Track the change
      await deltaTrackingService.trackChange({
        entityType: "team",
        entityId: newTeam.id,
        changeType: "create",
        newData: newTeam,
        affectedUserId: user.id,
        triggeredBy: user.id,
      });

      return c.json({
        success: true,
        data: newTeam,
        message: `Team "${newTeam.name}" created successfully`,
      });
    } catch (error) {
      console.error("Error creating team:", error);
      return c.json(
        {
          success: false,
          error: "Failed to create team",
        },
        500
      );
    }
  }
);

// GET /teams - Get teams (with optional filtering)
teamsRouter.get("/", zValidator("query", getTeamsSchema), async (c) => {
  try {
    const options = c.req.valid("query");

    console.log(`👥 Getting teams with options:`, options);

    const conditions = [];

    if (options.activityTypeId) {
      conditions.push(eq(teams.activityTypeId, options.activityTypeId));
    }

    if (options.isPrivate !== undefined) {
      conditions.push(eq(teams.isPrivate, options.isPrivate));
    }

    if (options.search) {
      conditions.push(
        or(
          sql`LOWER(${teams.name}) LIKE LOWER(${"%" + options.search + "%"})`,
          sql`LOWER(${teams.description}) LIKE LOWER(${
            "%" + options.search + "%"
          })`
        )
      );
    }

    let query;
    // Build base query
    query = db
      .select({
        id: teams.id,
        name: teams.name,
        description: teams.description,
        creatorId: teams.creatorId,
        isPrivate: teams.isPrivate,
        maxMembers: teams.maxMembers,
        activityTypeId: teams.activityTypeId,
        createdAt: teams.createdAt,
        updatedAt: teams.updatedAt,
      })
      .from(teams);

    // Apply filters

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Apply pagination and ordering
    const teamsList = await query
      .orderBy(desc(teams.createdAt))
      .limit(options.limit)
      .offset(options.offset);

    // Enhance with additional data if requested
    const enhancedTeams = await Promise.all(
      teamsList.map(async (team) => {
        const enhanced: any = { ...team };

        // Add member count and members if requested
        if (options.includeMembers) {
          const members = await db
            .select({
              userId: teamMembers.userId,
              username: users.username,
              avatarUrl: users.avatarUrl,
              role: teamMembers.role,
              joinedAt: teamMembers.joinedAt,
            })
            .from(teamMembers)
            .leftJoin(users, eq(teamMembers.userId, users.id))
            .where(eq(teamMembers.teamId, team.id))
            .orderBy(asc(teamMembers.joinedAt));

          enhanced.members = members;
          enhanced.memberCount = members.length;
        } else {
          const memberCount = await db
            .select({ count: count(teamMembers.userId) })
            .from(teamMembers)
            .where(eq(teamMembers.teamId, team.id));

          enhanced.memberCount = memberCount[0]?.count || 0;
        }

        // Add statistics if requested
        if (options.includeStats && team.activityTypeId) {
          const eloStats = await db
            .select({
              averageELO: avg(userActivityTypeELOs.eloScore),
              minELO: sql<number>`MIN(${userActivityTypeELOs.eloScore})`,
              maxELO: sql<number>`MAX(${userActivityTypeELOs.eloScore})`,
              totalGamesPlayed: sql<number>`SUM(${userActivityTypeELOs.gamesPlayed})`,
            })
            .from(teamMembers)
            .leftJoin(
              userActivityTypeELOs,
              and(
                eq(teamMembers.userId, userActivityTypeELOs.userId),
                eq(userActivityTypeELOs.activityTypeId, team.activityTypeId)
              )
            )
            .where(eq(teamMembers.teamId, team.id));

          enhanced.statistics = eloStats[0];
        }

        // Add activity type info if available
        if (team.activityTypeId) {
          const activityType = await db.query.activityTypes.findFirst({
            where: eq(activityTypes.id, team.activityTypeId),
          });
          enhanced.activityType = activityType;
        }

        return enhanced;
      })
    );

    return c.json({
      success: true,
      data: {
        teams: enhancedTeams,
        pagination: {
          limit: options.limit,
          offset: options.offset,
          hasMore: enhancedTeams.length === options.limit,
        },
      },
    });
  } catch (error) {
    console.error("Error getting teams:", error);
    return c.json(
      {
        success: false,
        error: "Failed to get teams",
      },
      500
    );
  }
});

// GET /teams/:teamId - Get specific team details
teamsRouter.get("/:teamId", async (c) => {
  try {
    const teamId = c.req.param("teamId");

    console.log(`👥 Getting team details: ${teamId}`);

    // Get team details
    const team = await db.query.teams.findFirst({
      where: eq(teams.id, teamId),
    });

    if (!team) {
      return c.json(
        {
          success: false,
          error: "Team not found",
        },
        404
      );
    }

    // Get team members
    const members = await db
      .select({
        userId: teamMembers.userId,
        username: users.username,
        avatarUrl: users.avatarUrl,
        role: teamMembers.role,
        joinedAt: teamMembers.joinedAt,
      })
      .from(teamMembers)
      .leftJoin(users, eq(teamMembers.userId, users.id))
      .where(eq(teamMembers.teamId, teamId))
      .orderBy(asc(teamMembers.joinedAt));

    // Get activity type info if available
    let activityType = null;
    if (team.activityTypeId) {
      activityType = await db.query.activityTypes.findFirst({
        where: eq(activityTypes.id, team.activityTypeId),
      });
    }

    // Get team statistics
    let statistics = null;
    if (team.activityTypeId && members.length > 0) {
      const memberIds = members.map((m) => m.userId);

      const eloStats = await db
        .select({
          averageELO: avg(userActivityTypeELOs.eloScore),
          minELO: sql<number>`MIN(${userActivityTypeELOs.eloScore})`,
          maxELO: sql<number>`MAX(${userActivityTypeELOs.eloScore})`,
          totalGamesPlayed: sql<number>`SUM(${userActivityTypeELOs.gamesPlayed})`,
          membersWithELO: count(userActivityTypeELOs.userId),
        })
        .from(userActivityTypeELOs)
        .where(
          and(
            sql`${userActivityTypeELOs.userId} = ANY(${memberIds})`,
            eq(userActivityTypeELOs.activityTypeId, team.activityTypeId)
          )
        );

      statistics = eloStats[0];
    }

    return c.json({
      success: true,
      data: {
        ...team,
        members,
        memberCount: members.length,
        activityType,
        statistics,
      },
    });
  } catch (error) {
    console.error("Error getting team:", error);
    return c.json(
      {
        success: false,
        error: "Failed to get team",
      },
      500
    );
  }
});

// PUT /teams/:teamId - Update team (admin only)
teamsRouter.put(
  "/:teamId",
  authenticateToken,
  zValidator("json", updateTeamSchema),
  async (c) => {
    try {
      const user = c.get("user");
      const teamId = c.req.param("teamId");
      const updateData = c.req.valid("json");

      console.log(`✏️ ${user.username} updating team: ${teamId}`);

      // Get team and verify permissions
      const team = await db.query.teams.findFirst({
        where: eq(teams.id, teamId),
      });

      if (!team) {
        return c.json(
          {
            success: false,
            error: "Team not found",
          },
          404
        );
      }

      // Check if user is team admin
      const membership = await db.query.teamMembers.findFirst({
        where: and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, user.id),
          eq(teamMembers.role, "admin")
        ),
      });

      if (!membership && team.creatorId !== user.id && user.role !== "admin") {
        return c.json(
          {
            success: false,
            error: "Access denied. Only team admins can update team settings.",
          },
          403
        );
      }

      // Check for name conflicts if name is being changed
      if (updateData.name && updateData.name !== team.name) {
        const nameConflict = await db.query.teams.findFirst({
          where: sql`LOWER(${teams.name}) = LOWER(${updateData.name})`,
        });

        if (nameConflict) {
          return c.json(
            {
              success: false,
              error: "A team with this name already exists",
            },
            400
          );
        }
      }

      // Update the team
      const [updatedTeam] = await db
        .update(teams)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(teams.id, teamId))
        .returning();

      // Track the change
      await deltaTrackingService.trackChange({
        entityType: "team",
        entityId: teamId,
        changeType: "update",
        previousData: team,
        newData: updatedTeam,
        affectedUserId: user.id,
        triggeredBy: user.id,
      });

      return c.json({
        success: true,
        data: updatedTeam,
        message: "Team updated successfully",
      });
    } catch (error) {
      console.error("Error updating team:", error);
      return c.json(
        {
          success: false,
          error: "Failed to update team",
        },
        500
      );
    }
  }
);

// DELETE /teams/:teamId - Delete team (creator only)
teamsRouter.delete("/:teamId", authenticateToken, async (c) => {
  try {
    const user = c.get("user");
    const teamId = c.req.param("teamId");

    console.log(`🗑️ ${user.username} deleting team: ${teamId}`);

    // Get team and verify permissions
    const team = await db.query.teams.findFirst({
      where: eq(teams.id, teamId),
    });

    if (!team) {
      return c.json(
        {
          success: false,
          error: "Team not found",
        },
        404
      );
    }

    // Only creator or global admin can delete team
    if (team.creatorId !== user.id && user.role !== "admin") {
      return c.json(
        {
          success: false,
          error:
            "Access denied. Only the team creator or admin can delete the team.",
        },
        403
      );
    }

    // Delete the team (cascade will handle members)
    await db.delete(teams).where(eq(teams.id, teamId));

    // Track the change
    await deltaTrackingService.trackChange({
      entityType: "team",
      entityId: teamId,
      changeType: "delete",
      previousData: team,
      affectedUserId: user.id,
      triggeredBy: user.id,
    });

    return c.json({
      success: true,
      message: `Team "${team.name}" deleted successfully`,
    });
  } catch (error) {
    console.error("Error deleting team:", error);
    return c.json(
      {
        success: false,
        error: "Failed to delete team",
      },
      500
    );
  }
});

// POST /teams/:teamId/members - Add member to team (admin only)
teamsRouter.post(
  "/:teamId/members",
  authenticateToken,
  zValidator("json", manageMemberSchema),
  async (c) => {
    try {
      const user = c.get("user");
      const teamId = c.req.param("teamId");
      const { userId: newMemberId, role } = c.req.valid("json");

      console.log(`➕ ${user.username} adding member to team: ${teamId}`);

      // Get team and verify permissions
      const team = await db.query.teams.findFirst({
        where: eq(teams.id, teamId),
      });

      if (!team) {
        return c.json(
          {
            success: false,
            error: "Team not found",
          },
          404
        );
      }

      // Check if user is team admin
      const membership = await db.query.teamMembers.findFirst({
        where: and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, user.id),
          eq(teamMembers.role, "admin")
        ),
      });

      if (!membership && team.creatorId !== user.id && user.role !== "admin") {
        return c.json(
          {
            success: false,
            error: "Access denied. Only team admins can add members.",
          },
          403
        );
      }

      // Check if user is already a member
      const existingMembership = await db.query.teamMembers.findFirst({
        where: and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, newMemberId)
        ),
      });

      if (existingMembership) {
        return c.json(
          {
            success: false,
            error: "User is already a member of this team",
          },
          400
        );
      }

      // Verify the user to be added exists
      const targetUser = await db.query.users.findFirst({
        where: eq(users.id, newMemberId),
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

      // Check team capacity
      if (team.maxMembers) {
        const currentMemberCount = await db
          .select({ count: count(teamMembers.userId) })
          .from(teamMembers)
          .where(eq(teamMembers.teamId, teamId));

        if (currentMemberCount[0].count >= team.maxMembers) {
          return c.json(
            {
              success: false,
              error: "Team has reached maximum member capacity",
            },
            400
          );
        }
      }

      // Add the member
      const [newMembership] = await db
        .insert(teamMembers)
        .values({
          teamId,
          userId: newMemberId,
          role,
        })
        .returning();

      // Track the change
      await deltaTrackingService.trackChange({
        entityType: "team_member",
        entityId: newMembership.id,
        changeType: "create",
        newData: newMembership,
        affectedUserId: newMemberId,
        relatedEntityId: teamId,
        triggeredBy: user.id,
      });

      return c.json({
        success: true,
        data: {
          ...newMembership,
          username: targetUser.username,
          avatarUrl: targetUser.avatarUrl,
        },
        message: `${targetUser.username} added to team successfully`,
      });
    } catch (error) {
      console.error("Error adding team member:", error);
      return c.json(
        {
          success: false,
          error: "Failed to add member to team",
        },
        500
      );
    }
  }
);

// PUT /teams/:teamId/members/:userId - Update member role (admin only)
teamsRouter.put(
  "/:teamId/members/:userId",
  authenticateToken,
  zValidator("json", updateMemberRoleSchema),
  async (c) => {
    try {
      const user = c.get("user");
      const teamId = c.req.param("teamId");
      const targetUserId = c.req.param("userId");
      const { role } = c.req.valid("json");

      console.log(
        `✏️ ${user.username} updating member role in team: ${teamId}`
      );

      // Get team and verify permissions
      const team = await db.query.teams.findFirst({
        where: eq(teams.id, teamId),
      });

      if (!team) {
        return c.json(
          {
            success: false,
            error: "Team not found",
          },
          404
        );
      }

      // Check if user is team admin or creator
      const membership = await db.query.teamMembers.findFirst({
        where: and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, user.id),
          eq(teamMembers.role, "admin")
        ),
      });

      if (!membership && team.creatorId !== user.id && user.role !== "admin") {
        return c.json(
          {
            success: false,
            error: "Access denied. Only team admins can update member roles.",
          },
          403
        );
      }

      // Get target member
      const targetMembership = await db.query.teamMembers.findFirst({
        where: and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, targetUserId)
        ),
      });

      if (!targetMembership) {
        return c.json(
          {
            success: false,
            error: "User is not a member of this team",
          },
          404
        );
      }

      // Prevent creator from being demoted (unless by global admin)
      if (team.creatorId === targetUserId && user.role !== "admin") {
        return c.json(
          {
            success: false,
            error: "Cannot change the role of the team creator",
          },
          403
        );
      }

      // Update member role
      const [updatedMembership] = await db
        .update(teamMembers)
        .set({ role })
        .where(eq(teamMembers.id, targetMembership.id))
        .returning();

      // Track the change
      await deltaTrackingService.trackChange({
        entityType: "team_member",
        entityId: targetMembership.id,
        changeType: "update",
        previousData: targetMembership,
        newData: updatedMembership,
        affectedUserId: targetUserId,
        relatedEntityId: teamId,
        triggeredBy: user.id,
      });

      return c.json({
        success: true,
        data: updatedMembership,
        message: "Member role updated successfully",
      });
    } catch (error) {
      console.error("Error updating member role:", error);
      return c.json(
        {
          success: false,
          error: "Failed to update member role",
        },
        500
      );
    }
  }
);

// DELETE /teams/:teamId/members/:userId - Remove member from team
teamsRouter.delete("/:teamId/members/:userId", authenticateToken, async (c) => {
  try {
    const user = c.get("user");
    const teamId = c.req.param("teamId");
    const targetUserId = c.req.param("userId");

    console.log(`❌ ${user.username} removing member from team: ${teamId}`);

    // Get team
    const team = await db.query.teams.findFirst({
      where: eq(teams.id, teamId),
    });

    if (!team) {
      return c.json(
        {
          success: false,
          error: "Team not found",
        },
        404
      );
    }

    // Get target membership
    const targetMembership = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.userId, targetUserId)
      ),
    });

    if (!targetMembership) {
      return c.json(
        {
          success: false,
          error: "User is not a member of this team",
        },
        404
      );
    }

    // Check permissions: self-removal, admin removal, or creator
    const canRemove = targetUserId === user.id; // Self-removal (leaving)

    if (!canRemove) {
      // Check if current user is team admin or creator
      const userMembership = await db.query.teamMembers.findFirst({
        where: and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, user.id),
          eq(teamMembers.role, "admin")
        ),
      });

      const isCreatorOrAdmin =
        team.creatorId === user.id || user.role === "admin" || userMembership;

      if (!isCreatorOrAdmin) {
        return c.json(
          {
            success: false,
            error: "Access denied. Only team admins can remove other members.",
          },
          403
        );
      }
    }

    // Prevent creator from being removed (unless by global admin)
    if (
      team.creatorId === targetUserId &&
      user.role !== "admin" &&
      targetUserId !== user.id
    ) {
      return c.json(
        {
          success: false,
          error: "Cannot remove the team creator",
        },
        403
      );
    }

    // If creator is leaving, transfer ownership to another admin if possible
    if (team.creatorId === targetUserId && targetUserId === user.id) {
      const otherAdmins = await db
        .select({
          userId: teamMembers.userId,
          username: users.username,
        })
        .from(teamMembers)
        .leftJoin(users, eq(teamMembers.userId, users.id))
        .where(
          and(
            eq(teamMembers.teamId, teamId),
            eq(teamMembers.role, "admin"),
            sql`${teamMembers.userId} != ${targetUserId}`
          )
        )
        .limit(1);

      if (otherAdmins.length > 0) {
        // Transfer ownership to another admin
        await db
          .update(teams)
          .set({ creatorId: otherAdmins[0].userId })
          .where(eq(teams.id, teamId));
      }
    }

    // Remove the member
    await db.delete(teamMembers).where(eq(teamMembers.id, targetMembership.id));

    // Track the change
    await deltaTrackingService.trackChange({
      entityType: "team_member",
      entityId: targetMembership.id,
      changeType: "delete",
      previousData: targetMembership,
      affectedUserId: targetUserId,
      relatedEntityId: teamId,
      triggeredBy: user.id,
    });

    const action =
      targetUserId === user.id ? "left the team" : "was removed from the team";

    return c.json({
      success: true,
      message: `Member ${action} successfully`,
    });
  } catch (error) {
    console.error("Error removing team member:", error);
    return c.json(
      {
        success: false,
        error: "Failed to remove member from team",
      },
      500
    );
  }
});

// GET /teams/:teamId/statistics - Get detailed team statistics
teamsRouter.get("/:teamId/statistics", async (c) => {
  try {
    const teamId = c.req.param("teamId");

    console.log(`📊 Getting statistics for team: ${teamId}`);

    // Get team
    const team = await db.query.teams.findFirst({
      where: eq(teams.id, teamId),
    });

    if (!team) {
      return c.json(
        {
          success: false,
          error: "Team not found",
        },
        404
      );
    }

    // Get team members
    const members = await db
      .select({
        userId: teamMembers.userId,
        username: users.username,
        role: teamMembers.role,
        joinedAt: teamMembers.joinedAt,
      })
      .from(teamMembers)
      .leftJoin(users, eq(teamMembers.userId, users.id))
      .where(eq(teamMembers.teamId, teamId));

    const memberIds = members.map((m) => m.userId);

    let statistics: any = {
      memberCount: members.length,
      roles: {
        admins: members.filter((m) => m.role === "admin").length,
        members: members.filter((m) => m.role === "member").length,
      },
    };

    // If team has an activity type, get ELO statistics
    if (team.activityTypeId && memberIds.length > 0) {
      const eloStats = await db
        .select({
          averageELO: avg(userActivityTypeELOs.eloScore),
          minELO: sql<number>`MIN(${userActivityTypeELOs.eloScore})`,
          maxELO: sql<number>`MAX(${userActivityTypeELOs.eloScore})`,
          totalGamesPlayed: sql<number>`SUM(${userActivityTypeELOs.gamesPlayed})`,
          membersWithELO: count(userActivityTypeELOs.userId),
        })
        .from(userActivityTypeELOs)
        .where(
          and(
            sql`${userActivityTypeELOs.userId} = ANY(${memberIds})`,
            eq(userActivityTypeELOs.activityTypeId, team.activityTypeId)
          )
        );

      statistics.elo = eloStats[0];

      // Get individual member ELO data
      const memberELOs = await db
        .select({
          userId: userActivityTypeELOs.userId,
          username: users.username,
          eloScore: userActivityTypeELOs.eloScore,
          gamesPlayed: userActivityTypeELOs.gamesPlayed,
          peakELO: userActivityTypeELOs.peakELO,
        })
        .from(userActivityTypeELOs)
        .leftJoin(users, eq(userActivityTypeELOs.userId, users.id))
        .where(
          and(
            sql`${userActivityTypeELOs.userId} = ANY(${memberIds})`,
            eq(userActivityTypeELOs.activityTypeId, team.activityTypeId)
          )
        )
        .orderBy(desc(userActivityTypeELOs.eloScore));

      statistics.memberELOs = memberELOs;
    }

    // Get activity type info
    if (team.activityTypeId) {
      const activityType = await db.query.activityTypes.findFirst({
        where: eq(activityTypes.id, team.activityTypeId),
      });
      statistics.activityType = activityType;
    }

    return c.json({
      success: true,
      data: {
        team: {
          id: team.id,
          name: team.name,
          description: team.description,
          createdAt: team.createdAt,
        },
        statistics,
      },
    });
  } catch (error) {
    console.error("Error getting team statistics:", error);
    return c.json(
      {
        success: false,
        error: "Failed to get team statistics",
      },
      500
    );
  }
});

// GET /teams/user/:userId - Get teams for a specific user
teamsRouter.get("/user/:userId", async (c) => {
  try {
    const userId = c.req.param("userId");

    console.log(`👥 Getting teams for user: ${userId}`);

    // Get user's teams
    const userTeams = await db
      .select({
        teamId: teams.id,
        name: teams.name,
        description: teams.description,
        isPrivate: teams.isPrivate,
        activityTypeId: teams.activityTypeId,
        userRole: teamMembers.role,
        joinedAt: teamMembers.joinedAt,
        createdAt: teams.createdAt,
      })
      .from(teamMembers)
      .leftJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(eq(teamMembers.userId, userId))
      .orderBy(desc(teamMembers.joinedAt));

    // Enhance with member counts and activity type info
    const enhancedTeams = await Promise.all(
      userTeams.map(async (team) => {
        let memberCountResult = [{ count: 0 }];
        if (team.teamId !== null) {
          memberCountResult = await db
            .select({ count: count(teamMembers.userId) })
            .from(teamMembers)
            .where(eq(teamMembers.teamId, team.teamId)) // Safe because of the if check
            .execute();
        } else {
          console.warn(`Unexpected null teamId for team entry:`, team);
        }

        let activityType = null;
        if (team.activityTypeId !== null) {
          activityType = await db.query.activityTypes.findFirst({
            where: eq(activityTypes.id, team.activityTypeId), 
          });
        }

        return {
          ...team,
          memberCount: memberCountResult[0]?.count || 0,
          activityType,
        };
      })
    );

    return c.json({
      success: true,
      data: {
        teams: enhancedTeams,
        summary: {
          totalTeams: enhancedTeams.length,
          adminRoles: enhancedTeams.filter((t) => t.userRole === "admin")
            .length,
          memberRoles: enhancedTeams.filter((t) => t.userRole === "member")
            .length,
        },
      },
    });
  } catch (error) {
    console.error("Error getting user teams:", error);
    return c.json(
      {
        success: false,
        error: "Failed to get user teams",
      },
      500
    );
  }
});

// POST /teams/:teamId/join-request - Request to join team (for private teams)
teamsRouter.post("/:teamId/join-request", authenticateToken, async (c) => {
  try {
    const user = c.get("user");
    const teamId = c.req.param("teamId");

    console.log(`📝 ${user.username} requesting to join team: ${teamId}`);

    // Get team
    const team = await db.query.teams.findFirst({
      where: eq(teams.id, teamId),
    });

    if (!team) {
      return c.json(
        {
          success: false,
          error: "Team not found",
        },
        404
      );
    }

    // Check if user is already a member
    const existingMembership = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.userId, user.id)
      ),
    });

    if (existingMembership) {
      return c.json(
        {
          success: false,
          error: "You are already a member of this team",
        },
        400
      );
    }

    // For public teams, auto-join
    if (!team.isPrivate) {
      // Check team capacity
      if (team.maxMembers) {
        const currentMemberCount = await db
          .select({ count: count(teamMembers.userId) })
          .from(teamMembers)
          .where(eq(teamMembers.teamId, teamId));

        if (currentMemberCount[0].count >= team.maxMembers) {
          return c.json(
            {
              success: false,
              error: "Team has reached maximum member capacity",
            },
            400
          );
        }
      }

      // Auto-join public team
      const [newMembership] = await db
        .insert(teamMembers)
        .values({
          teamId,
          userId: user.id,
          role: "member",
        })
        .returning();

      // Track the change
      await deltaTrackingService.trackChange({
        entityType: "team_member",
        entityId: newMembership.id,
        changeType: "create",
        newData: newMembership,
        affectedUserId: user.id,
        relatedEntityId: teamId,
        triggeredBy: user.id,
      });

      return c.json({
        success: true,
        data: newMembership,
        message: `Successfully joined team "${team.name}"`,
      });
    } else {
      // For private teams, create join request (this would need a separate table in a full implementation)
      // For now, we'll return a message about contacting team admins
      return c.json(
        {
          success: false,
          error:
            "This is a private team. Please contact a team admin to request an invitation.",
          needsApproval: true,
        },
        400
      );
    }
  } catch (error) {
    console.error("Error processing join request:", error);
    return c.json(
      {
        success: false,
        error: "Failed to process join request",
      },
      500
    );
  }
});
