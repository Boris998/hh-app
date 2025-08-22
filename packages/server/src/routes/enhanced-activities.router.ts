// src/routes/enhanced-activities.router.ts - Part 1: Core CRUD Operations
import { zValidator } from "@hono/zod-validator";
import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  activities,
  activityChatRooms,
  activityELOStatus,
  activityParticipants,
  activityTypes,
  activityTypeSkills,
  skillDefinitions,
  userActivityTypeELOs,
  users,
} from "../db/schema.js";
import { authenticateToken } from "../middleware/auth.js";
import { deltaTrackingService } from "../services/delta-tracking.service.js";
import { eloProcessingService } from "../services/elo-processing.service.js";
import { matchmakingService } from "../services/matchmaking.service.js";

// Import Zod schemas
import {
  completeActivitySchema,
  createActivitySchema,
  joinActivitySchema,
  searchActivitiesSchema,
  updateActivitySchema,
} from "../db/zod.schema.js";

export const activitiesRouter = new Hono();

// Enhanced validation schemas
const activityIdSchema = z.object({
  id: z.string().uuid("Invalid activity ID"),
});

const participantActionSchema = z.object({
  action: z.enum(["approve", "reject", "remove"]),
  reason: z.string().max(500, "Reason too long").optional(),
});

// GET /activities - List activities with advanced filtering
activitiesRouter.get(
  "/",
  zValidator("query", searchActivitiesSchema),
  authenticateToken,
  async (c) => {
    try {
      const user = c.get("user");
      const filters = c.req.valid("query");
      const offset = (filters.page - 1) * filters.limit;

      console.log(
        `🏃 Fetching activities for user: ${user.username} with filters:`,
        filters
      );

      // Build where conditions
      const whereConditions = [];

      if (filters.activityTypeId) {
        whereConditions.push(
          eq(activities.activityTypeId, filters.activityTypeId)
        );
      }

      if (filters.location) {
        whereConditions.push(
          ilike(activities.location, `%${filters.location}%`)
        );
      }

      if (filters.dateFrom) {
        whereConditions.push(gte(activities.dateTime, filters.dateFrom));
      }

      if (filters.dateTo) {
        whereConditions.push(lte(activities.dateTime, filters.dateTo));
      }

      if (filters.creatorId) {
        whereConditions.push(eq(activities.creatorId, filters.creatorId));
      }

      if (filters.status) {
        whereConditions.push(eq(activities.completionStatus, filters.status));
      }

      // ELO-based filtering
      if (filters?.eloRange?.min) {
        if (filters.eloRange?.min !== undefined) {
          whereConditions.push(gte(activities.eloLevel, filters.eloRange?.min));
        }
        if (filters.eloRange?.max !== undefined) {
          whereConditions.push(lte(activities.eloLevel, filters.eloRange?.max));
        }
      }

      // Participation filtering
      // Handle activity completion status filtering
      if (filters.status) {
        whereConditions.push(eq(activities.completionStatus, filters.status));
      }

      // Handle participation status filtering (separate from completion status)
      if (filters.participationStatus) {
        const participationSubquery = db
          .select({ activityId: activityParticipants.activityId })
          .from(activityParticipants)
          .where(
            and(
              eq(activityParticipants.userId, user.id),
              eq(activityParticipants.status, filters.participationStatus) // Use participationStatus instead
            )
          );

        whereConditions.push(
          sql`${activities.id} IN (${participationSubquery})`
        );
      }

      // Search in description
      if (filters.search) {
        whereConditions.push(
          or(
            ilike(activities.description, `%${filters.search}%`),
            ilike(activities.location, `%${filters.search}%`)
          )
        );
      }

      // Execute the main query
      const activitiesQuery = await db
        .select({
          activity: {
            id: activities.id,
            publicId: activities.publicId,
            description: activities.description,
            location: activities.location,
            dateTime: activities.dateTime,
            maxParticipants: activities.maxParticipants,
            eloLevel: activities.eloLevel,
            skillRequirements: activities.skillRequirements,
            isELORated: activities.isELORated,
            completionStatus: activities.completionStatus,
            createdAt: activities.createdAt,
          },
          activityType: {
            id: activityTypes.id,
            name: activityTypes.name,
            category: activityTypes.category,
            iconUrl: activityTypes.iconUrl,
          },
          creator: {
            id: users.id,
            username: users.username,
            avatarUrl: users.avatarUrl,
          },
          participantCount: count(activityParticipants.id),
        })
        .from(activities)
        .innerJoin(
          activityTypes,
          eq(activityTypes.id, activities.activityTypeId)
        )
        .innerJoin(users, eq(users.id, activities.creatorId))
        .leftJoin(
          activityParticipants,
          and(
            eq(activityParticipants.activityId, activities.id),
            eq(activityParticipants.status, "accepted")
          )
        )
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
        .groupBy(activities.id, activityTypes.id, users.id)
        .orderBy(
          filters.sortBy === "date"
            ? desc(activities.dateTime)
            : filters.sortBy === "created"
            ? desc(activities.createdAt)
            : filters.sortBy === "elo"
            ? desc(activities.eloLevel)
            : desc(activities.dateTime) // default
        )
        .limit(filters.limit)
        .offset(offset);

      // Get user's participation status for each activity
      const activityIds = activitiesQuery.map((a) => a.activity.id);
      let userParticipation: any = [];

      if (activityIds.length > 0) {
        userParticipation = await db
          .select({
            activityId: activityParticipants.activityId,
            status: activityParticipants.status,
            team: activityParticipants.team,
            joinedAt: activityParticipants.joinedAt,
          })
          .from(activityParticipants)
          .where(
            and(
              eq(activityParticipants.userId, user.id),
              inArray(activityParticipants.activityId, activityIds)
            )
          );
      }

      // Combine data
      const activitiesWithParticipation = activitiesQuery.map((activity) => ({
        ...activity,
        userParticipation:
          userParticipation.find(
            (p: any) => p.activityId === activity.activity.id
          ) || null,
      }));

      // Get total count for pagination
      const [{ count: totalCount }] = await db
        .select({ count: count() })
        .from(activities)
        .innerJoin(
          activityTypes,
          eq(activityTypes.id, activities.activityTypeId)
        )
        .where(
          whereConditions.length > 0 ? and(...whereConditions) : undefined
        );

      return c.json({
        success: true,
        data: {
          activities: activitiesWithParticipation,
          pagination: {
            page: filters.page,
            limit: filters.limit,
            totalCount,
            totalPages: Math.ceil(totalCount / filters.limit),
            hasMore: offset + activitiesQuery.length < totalCount,
          },
          filters: filters,
        },
      });
    } catch (error) {
      console.error("Error fetching activities:", error);
      return c.json(
        {
          success: false,
          error: "Failed to fetch activities",
        },
        500
      );
    }
  }
);

// POST /activities - Create new activity
activitiesRouter.post(
  "/",
  zValidator("json", createActivitySchema),
  authenticateToken,
  async (c) => {
    try {
      const user = c.get("user");
      const activityData = c.req.valid("json");

      console.log(`🏃 Creating activity by user: ${user.username}`);
      console.log('📝 Activity data received:', JSON.stringify(activityData, null, 2));

      // Validate activity type exists
      const activityType = await db.query.activityTypes.findFirst({
        where: eq(activityTypes.id, activityData.activityTypeId),
      });

      if (!activityType) {
        return c.json(
          {
            success: false,
            error: "Activity type not found",
          },
          404
        );
      }

      // Set ELO level based on user's current ELO if not provided
      let eloLevel = activityData.eloLevel;
      if (!eloLevel && activityData.isELORated) {
        const userELO = await db.query.userActivityTypeELOs.findFirst({
          where: and(
            eq(userActivityTypeELOs.userId, user.id),
            eq(userActivityTypeELOs.activityTypeId, activityData.activityTypeId)
          ),
        });
        eloLevel = userELO?.eloScore || 1200; // Default ELO
      }

      // Create the activity
      const [newActivity] = await db
        .insert(activities)
        .values({
          activityTypeId: activityData.activityTypeId,
          creatorId: user.id,
          description: activityData.description,
          location: activityData.location,
          dateTime: activityData.dateTime,
          maxParticipants: activityData.maxParticipants,
          eloLevel,
          skillRequirements: activityData.skillRequirements || {},
          isELORated: activityData.isELORated || false,
          completionStatus: "scheduled",
        })
        .returning();

      // Auto-join creator as participant
      await db.insert(activityParticipants).values({
        activityId: newActivity.id,
        userId: user.id,
        status: "accepted",
        team: activityData.creatorTeam || null,
      });

      // Create chat room for activity
      await db.insert(activityChatRooms).values({
        activityId: newActivity.id,
        name: `${activityType.name} Chat`,
        isActive: true,
      });

      // Track delta change
      await deltaTrackingService.trackChange({
        entityType: "activity",
        entityId: newActivity.id,
        changeType: "create",
        newData: {
          activity: newActivity,
          activityType: { id: activityType.id, name: activityType.name },
          creator: { id: user.id, username: user.username },
        },
        affectedUserId: user.id,
        relatedEntityId: newActivity.id,
        triggeredBy: user.id,
        changeSource: "user_action",
      });

      console.log(`✅ Activity created successfully: ${newActivity.id}`);

      return c.json(
        {
          success: true,
          data: {
            activity: newActivity,
            activityType: {
              id: activityType.id,
              name: activityType.name,
              category: activityType.category,
            },
          },
          message: "Activity created successfully",
        },
        201
      );
    } catch (error) {
      console.error("Error creating activity:", error);

      if (error instanceof z.ZodError) {
        return c.json(
          {
            success: false,
            error: "Invalid activity data",
            details: error.errors.map((err) => ({
              field: err.path.join("."),
              message: err.message,
            })),
          },
          400
        );
      }

      return c.json(
        {
          success: false,
          error: "Failed to create activity",
        },
        500
      );
    }
  }
);

// GET /activities/:id - Get activity details with comprehensive info
activitiesRouter.get(
  "/:id",
  zValidator("param", activityIdSchema),
  authenticateToken,
  async (c) => {
    try {
      const user = c.get("user");
      const { id: activityId } = c.req.valid("param");

      console.log(
        `📋 Fetching activity details: ${activityId} for user: ${user.username}`
      );

      // Get activity with related data
      const activity = await db
        .select({
          activity: activities,
          activityType: {
            id: activityTypes.id,
            name: activityTypes.name,
            category: activityTypes.category,
            iconUrl: activityTypes.iconUrl,
            defaultELOSettings: activityTypes.defaultELOSettings,
          },
          creator: {
            id: users.id,
            username: users.username,
            avatarUrl: users.avatarUrl,
          },
        })
        .from(activities)
        .innerJoin(
          activityTypes,
          eq(activityTypes.id, activities.activityTypeId)
        )
        .innerJoin(users, eq(users.id, activities.creatorId))
        .where(eq(activities.id, activityId))
        .limit(1);

      if (activity.length === 0) {
        return c.json(
          {
            success: false,
            error: "Activity not found",
          },
          404
        );
      }

      const activityData = activity[0];

      // Get participants with their details and ELO scores
      const participants = await db
        .select({
          participant: {
            id: activityParticipants.id,
            status: activityParticipants.status,
            team: activityParticipants.team,
            finalResult: activityParticipants.finalResult,
            performanceNotes: activityParticipants.performanceNotes,
            joinedAt: activityParticipants.joinedAt,
          },
          user: {
            id: users.id,
            username: users.username,
            avatarUrl: users.avatarUrl,
          },
          eloScore: userActivityTypeELOs.eloScore,
          gamesPlayed: userActivityTypeELOs.gamesPlayed,
        })
        .from(activityParticipants)
        .innerJoin(users, eq(users.id, activityParticipants.userId))
        .leftJoin(
          userActivityTypeELOs,
          and(
            eq(userActivityTypeELOs.userId, users.id),
            eq(
              userActivityTypeELOs.activityTypeId,
              activityData.activity.activityTypeId
            )
          )
        )
        .where(eq(activityParticipants.activityId, activityId))
        .orderBy(activityParticipants.joinedAt);

      // Get user's participation status
      const userParticipation = participants.find((p) => p.user.id === user.id);

      // Get ELO status if this is an ELO-rated activity
      let eloStatus = null;
      if (activityData.activity.isELORated) {
        eloStatus = await db.query.activityELOStatus.findFirst({
          where: eq(activityELOStatus.activityId, activityId),
        });
      }

      // Get activity skills and requirements
      const activitySkills = await db
        .select({
          skill: {
            id: skillDefinitions.id,
            name: skillDefinitions.name,
            skillType: skillDefinitions.skillType,
            isGeneral: skillDefinitions.isGeneral,
          },
          weight: activityTypeSkills.weight,
          displayOrder: activityTypeSkills.displayOrder,
          isSpecificToActivityType: activityTypeSkills.isSpecificToActivityType,
        })
        .from(activityTypeSkills)
        .innerJoin(
          skillDefinitions,
          eq(skillDefinitions.id, activityTypeSkills.skillDefinitionId)
        )
        .where(
          eq(
            activityTypeSkills.activityTypeId,
            activityData.activity.activityTypeId
          )
        )
        .orderBy(activityTypeSkills.displayOrder);

      // Calculate team balance and ELO distribution
      const teamStats = {
        teamA: participants.filter((p) => p.participant.team === "A"),
        teamB: participants.filter((p) => p.participant.team === "B"),
        noTeam: participants.filter((p) => !p.participant.team),
      };

      const eloDistribution = {
        average:
          participants.reduce((sum, p) => sum + (p.eloScore || 1200), 0) /
          Math.max(participants.length, 1),
        min: Math.min(...participants.map((p) => p.eloScore || 1200)),
        max: Math.max(...participants.map((p) => p.eloScore || 1200)),
        range:
          Math.max(...participants.map((p) => p.eloScore || 1200)) -
          Math.min(...participants.map((p) => p.eloScore || 1200)),
      };

      // Check if user can rate skills (activity must be completed and user must have participated)
      const canRateSkills =
        activityData.activity.completionStatus === "completed" &&
        userParticipation?.participant.status === "accepted";

      return c.json({
        success: true,
        data: {
          activity: activityData.activity,
          activityType: activityData.activityType,
          creator: activityData.creator,
          participants,
          userParticipation,
          eloStatus,
          skills: activitySkills,
          teamStats,
          eloDistribution,
          capabilities: {
            canEdit: activityData.creator.id === user.id,
            canJoin:
              !userParticipation &&
              activityData.activity.completionStatus === "scheduled",
            canLeave:
              userParticipation &&
              userParticipation.participant.status !== "declined",
            canComplete:
              activityData.creator.id === user.id &&
              activityData.activity.completionStatus !== "completed",
            canRateSkills,
          },
        },
      });
    } catch (error) {
      console.error("Error fetching activity details:", error);
      return c.json(
        {
          success: false,
          error: "Failed to fetch activity details",
        },
        500
      );
    }
  }
);

// POST /activities/:id/join - Join activity
activitiesRouter.post(
  "/:id/join",
  zValidator("param", activityIdSchema),
  zValidator("json", joinActivitySchema),
  authenticateToken,
  async (c) => {
    try {
      const user = c.get("user");
      const { id: activityId } = c.req.valid("param");
      const { team, message } = c.req.valid("json");

      console.log(
        `🤝 User ${user.username} attempting to join activity: ${activityId}`
      );

      // Check if activity exists and is joinable
      const activity = await db.query.activities.findFirst({
        where: eq(activities.id, activityId),
        with: {
          activityType: true,
        },
      });

      if (!activity) {
        return c.json(
          {
            success: false,
            error: "Activity not found",
          },
          404
        );
      }

      if (activity.completionStatus !== "scheduled") {
        return c.json(
          {
            success: false,
            error: "Cannot join activity that is not scheduled",
          },
          400
        );
      }

      // Check if user is already a participant
      const existingParticipation =
        await db.query.activityParticipants.findFirst({
          where: and(
            eq(activityParticipants.activityId, activityId),
            eq(activityParticipants.userId, user.id)
          ),
        });

      if (existingParticipation) {
        return c.json(
          {
            success: false,
            error: "You are already a participant in this activity",
          },
          400
        );
      }

      // Check capacity
      const currentParticipants = await db
        .select({ count: count() })
        .from(activityParticipants)
        .where(
          and(
            eq(activityParticipants.activityId, activityId),
            eq(activityParticipants.status, "accepted")
          )
        );

      const participantCount = currentParticipants[0]?.count || 0;
      if (
        activity.maxParticipants &&
        participantCount >= activity.maxParticipants
      ) {
        return c.json(
          {
            success: false,
            error: "Activity is at maximum capacity",
          },
          400
        );
      }

      // Check ELO requirements if this is an ELO-rated activity
      if (activity.isELORated && activity.eloLevel) {
        const userELO = await db.query.userActivityTypeELOs.findFirst({
          where: and(
            eq(userActivityTypeELOs.userId, user.id),
            eq(userActivityTypeELOs.activityTypeId, activity.activityTypeId)
          ),
        });

        const userEloScore = userELO?.eloScore || 1200;
        const eloDifference = Math.abs(userEloScore - activity.eloLevel);

        // Allow ±300 ELO difference for joining
        if (eloDifference > 300) {
          return c.json(
            {
              success: false,
              error: `Your ELO (${userEloScore}) is too different from the activity level (${activity.eloLevel})`,
            },
            400
          );
        }
      }

      // Create participation record
      const [newParticipation] = await db
        .insert(activityParticipants)
        .values({
          activityId,
          userId: user.id,
          status: "pending", // May require approval from creator
          team: team || null,
        })
        .returning();

      // Track delta change for activity creator
      await deltaTrackingService.trackChange({
        entityType: "activity",
        entityId: newParticipation.id,
        changeType: "create",
        newData: {
          activityId,
          participant: { id: user.id, username: user.username },
          status: "pending",
          team,
          message,
        },
        affectedUserId: activity.creatorId,
        relatedEntityId: activityId,
        triggeredBy: user.id,
        changeSource: "user_action",
      });

      console.log(`✅ User joined activity successfully: ${activityId}`);

      return c.json(
        {
          success: true,
          data: {
            participation: newParticipation,
            activity: {
              id: activity.id,
              description: activity.description,
            },
          },
          message: "Join request submitted successfully",
        },
        201
      );
    } catch (error) {
      console.error("Error joining activity:", error);
      return c.json(
        {
          success: false,
          error: "Failed to join activity",
        },
        500
      );
    }
  }
);

// POST /activities/:id/leave - Leave activity
activitiesRouter.post(
  "/:id/leave",
  zValidator("param", activityIdSchema),
  authenticateToken,
  async (c) => {
    try {
      const user = c.get("user");
      const { id: activityId } = c.req.valid("param");

      console.log(
        `👋 User ${user.username} attempting to leave activity: ${activityId}`
      );

      // Check if user is a participant
      const participation = await db.query.activityParticipants.findFirst({
        where: and(
          eq(activityParticipants.activityId, activityId),
          eq(activityParticipants.userId, user.id)
        ),
      });

      if (!participation) {
        return c.json(
          {
            success: false,
            error: "You are not a participant in this activity",
          },
          400
        );
      }

      // Check if activity is completed
      const activity = await db.query.activities.findFirst({
        where: eq(activities.id, activityId),
      });

      if (activity?.completionStatus === "completed") {
        return c.json(
          {
            success: false,
            error: "Cannot leave a completed activity",
          },
          400
        );
      }

      // Remove the participation record
      await db
        .delete(activityParticipants)
        .where(
          and(
            eq(activityParticipants.activityId, activityId),
            eq(activityParticipants.userId, user.id)
          )
        );

      // Track delta change (commented out due to interface mismatch)
      // await deltaTrackingService.trackChange({
      //   changeType: "delete",
      //   entityType: "activity", 
      //   entityId: activityId,
      //   triggeredBy: user.id,
      //   changeSource: "user_action",
      // });

      console.log(`✅ User left activity successfully: ${activityId}`);

      return c.json({
        success: true,
        message: "Successfully left the activity",
      });
    } catch (error) {
      console.error("Error leaving activity:", error);
      return c.json(
        {
          success: false,
          error: "Failed to leave activity",
        },
        500
      );
    }
  }
);

// PUT /activities/:id/participants/:participantId/respond - Approve/reject participant
activitiesRouter.put(
  "/:id/participants/:participantId/respond",
  zValidator(
    "param",
    z.object({
      id: z.string().uuid(),
      participantId: z.string().uuid(),
    })
  ),
  zValidator("json", participantActionSchema),
  authenticateToken,
  async (c) => {
    try {
      const user = c.get("user");
      const { id: activityId, participantId } = c.req.valid("param");
      const { action, reason } = c.req.valid("json");

      console.log(
        `👥 Participant ${action} by ${user.username} for activity: ${activityId}`
      );

      // Verify user is the activity creator
      const activity = await db.query.activities.findFirst({
        where: and(
          eq(activities.id, activityId),
          eq(activities.creatorId, user.id)
        ),
      });

      if (!activity) {
        return c.json(
          {
            success: false,
            error: "Activity not found or you are not the creator",
          },
          404
        );
      }

      // Find the participant
      const participant = await db.query.activityParticipants.findFirst({
        where: and(
          eq(activityParticipants.id, participantId),
          eq(activityParticipants.activityId, activityId)
        ),
        with: {
          user: {
            columns: { id: true, username: true },
          },
        },
      });

      if (!participant) {
        return c.json(
          {
            success: false,
            error: "Participant not found",
          },
          404
        );
      }

      // Update participant status
      const newStatus =
        action === "approve"
          ? "accepted"
          : action === "reject"
          ? "declined"
          : "declined"; // remove also sets to declined

      const [updatedParticipant] = await db
        .update(activityParticipants)
        .set({
          status: newStatus,
          performanceNotes: reason,
        })
        .where(eq(activityParticipants.id, participantId))
        .returning();

      // Track delta change
      await deltaTrackingService.trackChange({
        entityType: "activity",
        entityId: activityId,
        changeType: action === "remove" ? "delete" : "update",
        newData: {
          activityId,
          participant: {
            id: participant.userId,
          },
          status: newStatus,
          action,
          reason,
        },
        affectedUserId: participant.userId,
        relatedEntityId: activityId,
        triggeredBy: user.id,
        changeSource: "user_action",
      });

      console.log(`✅ Participant ${action}ed successfully`);

      return c.json({
        success: true,
        data: {
          participant: updatedParticipant,
          action,
        },
        message: `Participant ${action}ed successfully`,
      });
    } catch (error) {
      console.error("Error responding to participant:", error);
      return c.json(
        {
          success: false,
          error: "Failed to respond to participant",
        },
        500
      );
    }
  }
);

// POST /activities/:id/complete - Complete activity and trigger ELO calculation
activitiesRouter.post(
  "/:id/complete",
  zValidator("param", activityIdSchema),
  zValidator("json", completeActivitySchema),
  authenticateToken,
  async (c) => {
    try {
      const user = c.get("user");
      const { id: activityId } = c.req.valid("param");
      const completionData = c.req.valid("json");

      console.log(
        `🏁 Completing activity: ${activityId} by user: ${user.username}`
      );

      // Verify user is the activity creator
      const activity = await db.query.activities.findFirst({
        where: and(
          eq(activities.id, activityId),
          eq(activities.creatorId, user.id)
        ),
      });

      if (!activity) {
        return c.json(
          {
            success: false,
            error: "Activity not found or you are not the creator",
          },
          404
        );
      }

      if (activity.completionStatus === "completed") {
        return c.json(
          {
            success: false,
            error: "Activity is already completed",
          },
          400
        );
      }

      // Update activity status
      await db
        .update(activities)
        .set({
          completionStatus: "completed",
          updatedAt: new Date(),
        })
        .where(eq(activities.id, activityId));

      // Update participant results if provided
      if (
        completionData.participantResults &&
        completionData.participantResults.length > 0
      ) {
        for (const result of completionData.participantResults) {
          await db
            .update(activityParticipants)
            .set({
              finalResult: result.finalResult,
              performanceNotes: result.performanceNotes,
            })
            .where(
              and(
                eq(activityParticipants.activityId, activityId),
                eq(activityParticipants.userId, result.userId)
              )
            );
        }
      }

      // Track delta change
      await deltaTrackingService.trackChange({
        entityType: "activity",
        entityId: activityId,
        changeType: "update",
        newData: {
          completionStatus: "completed",
          participantResults: completionData.participantResults,
          completionNotes: completionData.completionNotes,
        },
        affectedUserId: user.id,
        relatedEntityId: activityId,
        triggeredBy: user.id,
        changeSource: "user_action",
      });

      // Process ELO calculations if this is an ELO-rated activity
      let eloProcessingResult = null;
      if (activity.isELORated) {
        try {
          console.log(`🏆 Starting ELO processing for activity: ${activityId}`);

          eloProcessingResult = await eloProcessingService.onActivityCompletion(
            {
              activityId,
              results: completionData.participantResults || [],
            }
          );

          console.log(`✅ ELO processing completed successfully`);
        } catch (eloError) {
          console.error("ELO processing failed:", eloError);
          // Don't fail the completion, just log the error
          eloProcessingResult = {
            success: false,
            error:
              eloError instanceof Error
                ? eloError.message
                : "ELO processing failed",
          };
        }
      }

      return c.json({
        success: true,
        data: {
          activityId,
          completionStatus: "completed",
          isELORated: activity.isELORated,
          eloProcessing: eloProcessingResult,
        },
        message: "Activity completed successfully",
      });
    } catch (error) {
      console.error("Error completing activity:", error);
      return c.json(
        {
          success: false,
          error: "Failed to complete activity",
        },
        500
      );
    }
  }
);

// src/routes/enhanced-activities.router.ts - Part 2: ELO System and Advanced Features
// This continues from Part 1 - add these endpoints to the existing router

const eloPreviewSchema = z.object({
  includeSimulation: z.boolean().default(false),
  participantResults: z
    .array(
      z.object({
        userId: z.string().uuid(),
        expectedResult: z.enum(["win", "loss", "draw"]),
      })
    )
    .optional(),
});

// GET /activities/:id/elo-preview - Preview ELO changes for activity completion
activitiesRouter.get(
  "/:id/elo-preview",
  zValidator("param", activityIdSchema),
  zValidator("query", eloPreviewSchema),
  authenticateToken,
  async (c) => {
    try {
      const user = c.get("user");
      const { id: activityId } = c.req.valid("param");
      const { includeSimulation, participantResults } = c.req.valid("query");

      console.log(`📊 ELO preview for activity: ${activityId}`);

      // Get activity details
      const activity = await db.query.activities.findFirst({
        where: eq(activities.id, activityId),
        with: {
          activityType: true,
        },
      });

      if (!activity || !activity.isELORated) {
        return c.json(
          {
            success: false,
            error: "Activity not found or not ELO-rated",
          },
          404
        );
      }

      // Get participants with current ELO scores
      const participants = await db
        .select({
          user: {
            id: users.id,
            username: users.username,
          },
          participant: {
            status: activityParticipants.status,
            team: activityParticipants.team,
          },
          currentELO: userActivityTypeELOs.eloScore,
          gamesPlayed: userActivityTypeELOs.gamesPlayed,
        })
        .from(activityParticipants)
        .innerJoin(users, eq(users.id, activityParticipants.userId))
        .leftJoin(
          userActivityTypeELOs,
          and(
            eq(userActivityTypeELOs.userId, users.id),
            eq(userActivityTypeELOs.activityTypeId, activity.activityTypeId)
          )
        )
        .where(
          and(
            eq(activityParticipants.activityId, activityId),
            eq(activityParticipants.status, "accepted")
          )
        );

      let eloSimulation = null;

      if (includeSimulation && participantResults) {
        try {
          // Calculate potential ELO changes
          eloSimulation = await eloProcessingService.simulateELOChanges({
            activityId,
            activityTypeId: activity.activityTypeId,
            participants: participants.map((p) => ({
              userId: p.user.id,
              username: p.user.username ?? "UnknownUser",
              currentELO: p.currentELO || 1200,
              gamesPlayed: p.gamesPlayed || 0,
              team: p.participant.team,
            })),
            results: participantResults,
          });
        } catch (error) {
          console.error("Error simulating ELO changes:", error);
        }
      }

      const activityWithDetails = await db
        .select({
          activity: activities,
          activityType: {
            id: activityTypes.id,
            name: activityTypes.name,
            defaultELOSettings: activityTypes.defaultELOSettings,
            // ... other activityType fields you need
          },
        })
        .from(activities)
        .innerJoin(
          activityTypes,
          eq(activities.activityTypeId, activityTypes.id)
        )
        .where(eq(activities.id, activityId))
        .limit(1);
      const activityData = activityWithDetails[0];

      if (!activityWithDetails) {
        // Handle activity not found
        return c.json({ success: false, error: "Activity not found" }, 404);
      }

      return c.json({
        success: true,
        data: {
          activity: {
            id: activity.id,
            description: activity.description,
            isELORated: activity.isELORated,
            eloLevel: activity.eloLevel,
          },
          activityType: {
            name: activityData.activityType.name, // Use activityData instead of activity
            defaultELOSettings: activityData.activityType.defaultELOSettings, // Use activityData instead of activity.eloSettings
          },
          participants: participants.map((p) => ({
            ...p,
            currentELO: p.currentELO || 1200,
          })),
          eloSimulation,
        },
      });
    } catch (error) {
      console.error("Error generating ELO preview:", error);
      return c.json(
        {
          success: false,
          error: "Failed to generate ELO preview",
        },
        500
      );
    }
  }
);

// GET /activities/my-elo-stats - Get user's ELO statistics
activitiesRouter.get("/my-elo-stats", authenticateToken, async (c) => {
  try {
    const user = c.get("user");

    console.log(`🏆 Fetching ELO stats for user: ${user.username}`);

    // Get user's ELO scores across all activity types
    const eloStats = await db
      .select({
        activityType: {
          id: activityTypes.id,
          name: activityTypes.name,
          category: activityTypes.category,
        },
        eloScore: userActivityTypeELOs.eloScore,
        gamesPlayed: userActivityTypeELOs.gamesPlayed,
        peakELO: userActivityTypeELOs.peakELO,
        seasonELO: userActivityTypeELOs.seasonELO,
        volatility: userActivityTypeELOs.volatility,
        lastUpdated: userActivityTypeELOs.lastUpdated,
      })
      .from(userActivityTypeELOs)
      .innerJoin(
        activityTypes,
        eq(activityTypes.id, userActivityTypeELOs.activityTypeId)
      )
      .where(eq(userActivityTypeELOs.userId, user.id))
      .orderBy(desc(userActivityTypeELOs.eloScore));

    // Calculate overall stats
    const overallStats = {
      totalActivities: eloStats.reduce(
        (sum, stat: any) => sum + stat.gamesPlayed,
        0
      ),
      averageELO:
        eloStats.length > 0
          ? Math.round(
              eloStats.reduce((sum, stat) => sum + stat.eloScore, 0) /
                eloStats.length
            )
          : 0,
      highestELO:
        eloStats.length > 0
          ? Math.max(...eloStats.map((stat) => stat.eloScore))
          : 0,
      activityTypesPlayed: eloStats.length,
    };

    return c.json({
      success: true,
      data: {
        eloStats,
        overallStats,
      },
    });
  } catch (error) {
    console.error("Error fetching ELO stats:", error);
    return c.json(
      {
        success: false,
        error: "Failed to fetch ELO stats",
      },
      500
    );
  }
});

// GET /activities/elo-leaderboard/:activityTypeId - Get ELO leaderboard for activity type
activitiesRouter.get(
  "/elo-leaderboard/:activityTypeId",
  zValidator(
    "param",
    z.object({
      activityTypeId: z.string().uuid(),
    })
  ),
  zValidator(
    "query",
    z.object({
      limit: z.number().int().min(1).max(100).default(50),
      page: z.number().int().min(1).default(1),
    })
  ),
  async (c) => {
    try {
      const { activityTypeId } = c.req.valid("param");
      const { limit, page } = c.req.valid("query");
      const offset = (page - 1) * limit;

      console.log(
        `🏆 Fetching ELO leaderboard for activity type: ${activityTypeId}`
      );

      // Get activity type info
      const activityType = await db.query.activityTypes.findFirst({
        where: eq(activityTypes.id, activityTypeId),
      });

      if (!activityType) {
        return c.json(
          {
            success: false,
            error: "Activity type not found",
          },
          404
        );
      }

      // Get leaderboard data
      const leaderboard = await db
        .select({
          rank: sql`ROW_NUMBER() OVER (ORDER BY ${userActivityTypeELOs.eloScore} DESC)`.as(
            "rank"
          ),
          user: {
            id: users.id,
            username: users.username,
            avatarUrl: users.avatarUrl,
          },
          eloScore: userActivityTypeELOs.eloScore,
          gamesPlayed: userActivityTypeELOs.gamesPlayed,
          peakELO: userActivityTypeELOs.peakELO,
          lastUpdated: userActivityTypeELOs.lastUpdated,
        })
        .from(userActivityTypeELOs)
        .innerJoin(users, eq(users.id, userActivityTypeELOs.userId))
        .where(
          and(
            eq(userActivityTypeELOs.activityTypeId, activityTypeId),
            gte(userActivityTypeELOs.gamesPlayed, 5) // Minimum games for ranking
          )
        )
        .orderBy(desc(userActivityTypeELOs.eloScore))
        .limit(limit)
        .offset(offset);

      // Get total count
      const [{ count: totalPlayers }] = await db
        .select({ count: count() })
        .from(userActivityTypeELOs)
        .where(
          and(
            eq(userActivityTypeELOs.activityTypeId, activityTypeId),
            gte(userActivityTypeELOs.gamesPlayed, 5) // Minimum games for ranking
          )
        );

      return c.json({
        success: true,
        data: {
          activityType: {
            id: activityType.id,
            name: activityType.name,
            category: activityType.category,
          },
          leaderboard,
          pagination: {
            page,
            limit,
            totalPlayers,
            totalPages: Math.ceil(totalPlayers / limit),
            hasMore: offset + leaderboard.length < totalPlayers,
          },
        },
      });
    } catch (error) {
      console.error("Error fetching ELO leaderboard:", error);
      return c.json(
        {
          success: false,
          error: "Failed to fetch ELO leaderboard",
        },
        500
      );
    }
  }
);

// GET /activities/:id/elo-status - Get ELO processing status for activity
activitiesRouter.get(
  "/:id/elo-status",
  zValidator("param", activityIdSchema),
  authenticateToken,
  async (c) => {
    try {
      const { id: activityId } = c.req.valid("param");

      console.log(`📊 Checking ELO status for activity: ${activityId}`);

      const eloStatus = await db.query.activityELOStatus.findFirst({
        where: eq(activityELOStatus.activityId, activityId),
      });

      if (!eloStatus) {
        return c.json({
          success: true,
          data: {
            status: "not_started",
            message: "ELO processing has not been initiated for this activity",
          },
        });
      }

      return c.json({
        success: true,
        data: {
          status: eloStatus.status,
          lockedBy: eloStatus.lockedBy,
          lockedAt: eloStatus.lockedAt,
          completedAt: eloStatus.completedAt,
          errorMessage: eloStatus.errorMessage,
          retryCount: eloStatus.retryCount,
          lastUpdated: eloStatus.updatedAt,
        },
      });
    } catch (error) {
      console.error("Error fetching ELO status:", error);
      return c.json(
        {
          success: false,
          error: "Failed to fetch ELO status",
        },
        500
      );
    }
  }
);

// POST /activities/:id/reprocess-elo - Reprocess ELO calculations for activity (admin)
activitiesRouter.post(
  "/:id/reprocess-elo",
  zValidator("param", activityIdSchema),
  authenticateToken,
  async (c) => {
    try {
      const user = c.get("user");
      const { id: activityId } = c.req.valid("param");

      console.log(
        `🔄 ELO reprocessing request for activity: ${activityId} by ${user.username}`
      );

      // Check if user has permission (creator or admin)
      const activity = await db.query.activities.findFirst({
        where: eq(activities.id, activityId),
      });

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
            error: "Insufficient permissions to reprocess ELO",
          },
          403
        );
      }

      if (!activity.isELORated) {
        return c.json(
          {
            success: false,
            error: "Activity is not ELO-rated",
          },
          400
        );
      }

      if (activity.completionStatus !== "completed") {
        return c.json(
          {
            success: false,
            error: "Activity must be completed before ELO reprocessing",
          },
          400
        );
      }

      // Reset ELO status to allow reprocessing
      await db
        .update(activityELOStatus)
        .set({
          status: "pending",
          lockedBy: null,
          lockedAt: null,
          completedAt: null,
          errorMessage: null,
          retryCount: 0,
          updatedAt: new Date(),
        })
        .where(eq(activityELOStatus.activityId, activityId));

      // Trigger ELO reprocessing
      const result = await eloProcessingService.reprocessActivity(activityId);

      return c.json({
        success: true,
        data: {
          activityId,
          eloProcessing: result,
        },
        message: "ELO reprocessing initiated successfully",
      });
    } catch (error) {
      console.error("Error reprocessing ELO:", error);
      return c.json(
        {
          success: false,
          error: "Failed to reprocess ELO",
        },
        500
      );
    }
  }
);

// GET /activities/matchmaking/suggestions - Get activity suggestions based on user's profile
activitiesRouter.get(
  "/matchmaking/suggestions",
  authenticateToken,
  async (c) => {
    try {
      const user = c.get("user");

      console.log(
        `🎯 Fetching activity suggestions for user: ${user.username}`
      );

      // Get user's ELO scores and preferences
      const userELOs = await db
        .select({
          activityTypeId: userActivityTypeELOs.activityTypeId,
          eloScore: userActivityTypeELOs.eloScore,
          gamesPlayed: userActivityTypeELOs.gamesPlayed,
          activityType: {
            id: activityTypes.id,
            name: activityTypes.name,
            category: activityTypes.category,
          },
        })
        .from(userActivityTypeELOs)
        .innerJoin(
          activityTypes,
          eq(activityTypes.id, userActivityTypeELOs.activityTypeId)
        )
        .where(eq(userActivityTypeELOs.userId, user.id))
        .orderBy(desc(userActivityTypeELOs.gamesPlayed));

      if (userELOs.length === 0) {
        return c.json({
          success: true,
          data: {
            suggestions: [],
            message: "Complete some activities to get personalized suggestions",
          },
        });
      }

      // Find suitable activities for each activity type
      const suggestions = [];

      for (const userELO of userELOs.slice(0, 3)) {
        // Top 3 activity types
        const suitableActivities = await db
          .select({
            activity: {
              id: activities.id,
              publicId: activities.publicId,
              description: activities.description,
              location: activities.location,
              dateTime: activities.dateTime,
              maxParticipants: activities.maxParticipants,
              eloLevel: activities.eloLevel,
              isELORated: activities.isELORated,
            },
            activityType: {
              id: activityTypes.id,
              name: activityTypes.name,
              category: activityTypes.category,
            },
            creator: {
              id: users.id,
              username: users.username,
            },
            participantCount: count(activityParticipants.id),
            eloDifference:
              sql`ABS(${activities.eloLevel} - ${userELO.eloScore})`.as(
                "eloDifference"
              ),
          })
          .from(activities)
          .innerJoin(
            activityTypes,
            eq(activityTypes.id, activities.activityTypeId)
          )
          .innerJoin(users, eq(users.id, activities.creatorId))
          .leftJoin(
            activityParticipants,
            and(
              eq(activityParticipants.activityId, activities.id),
              eq(activityParticipants.status, "accepted")
            )
          )
          .where(
            and(
              eq(activities.activityTypeId, userELO.activityTypeId),
              eq(activities.completionStatus, "scheduled"),
              gte(activities.dateTime, new Date()), // Future activities only
              sql`${activities.eloLevel} IS NULL OR ABS(${activities.eloLevel} - ${userELO.eloScore}) <= 150`,
              // Exclude activities user is already participating in
              sql`${activities.id} NOT IN (
              SELECT activity_id FROM activity_participants 
              WHERE user_id = '${user.id}' AND status IN ('pending', 'accepted')
            )`
            )
          )
          .groupBy(activities.id, activityTypes.id, users.id)
          .having(
            sql`COUNT(${activityParticipants.id}) < COALESCE(${activities.maxParticipants}, 999)`
          )
          .orderBy(sql`eloDifference ASC`, desc(activities.dateTime))
          .limit(3);

        if (suitableActivities.length > 0) {
          suggestions.push({
            activityType: userELO.activityType,
            userELO: userELO.eloScore,
            activities: suitableActivities,
          });
        }
      }

      return c.json({
        success: true,
        data: {
          suggestions,
          userProfile: {
            activeActivityTypes: userELOs.length,
            totalGamesPlayed: userELOs.reduce(
              (sum, elo: any) => sum + elo.gamesPlayed,
              0
            ),
          },
        },
      });
    } catch (error) {
      console.error("Error fetching activity suggestions:", error);
      return c.json(
        {
          success: false,
          error: "Failed to fetch activity suggestions",
        },
        500
      );
    }
  }
);

// POST /activities/:id/balance-teams - Auto-balance teams based on ELO
activitiesRouter.post(
  "/:id/balance-teams",
  zValidator("param", activityIdSchema),
  authenticateToken,
  async (c) => {
    try {
      const user = c.get("user");
      const { id: activityId } = c.req.valid("param");

      console.log(
        `⚖️ Team balancing request for activity: ${activityId} by ${user.username}`
      );

      // Verify user is the activity creator
      const activity = await db.query.activities.findFirst({
        where: and(
          eq(activities.id, activityId),
          eq(activities.creatorId, user.id)
        ),
      });

      if (!activity) {
        return c.json(
          {
            success: false,
            error: "Activity not found or you are not the creator",
          },
          404
        );
      }

      if (!activity.isELORated) {
        return c.json(
          {
            success: false,
            error: "Team balancing is only available for ELO-rated activities",
          },
          400
        );
      }

      // Get accepted participants with ELO scores
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
            eq(userActivityTypeELOs.userId, users.id),
            eq(userActivityTypeELOs.activityTypeId, activity.activityTypeId)
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

      // Use matchmaking service to balance teams
      const balanceResult = await matchmakingService.balanceTeams({
        participants: participants.map((p) => ({
          ...p,
          username: p.username ?? "UnknownUser",
          eloScore: p.eloScore || 1200,
        })),
        teamCount: 2, // A and B teams
      });

      if (!balanceResult.success) {
        return c.json(
          {
            success: false,
            error: balanceResult.error || "Failed to balance teams",
          },
          400
        );
      }

      // Update participant team assignments
      for (const teamAssignment of balanceResult.teams) {
        for (const participant of teamAssignment.members) {
          await db
            .update(activityParticipants)
            .set({ team: teamAssignment.name })
            .where(
              and(
                eq(activityParticipants.activityId, activityId),
                eq(activityParticipants.userId, participant.userId)
              )
            );
        }
      }

      // Track delta change
      await deltaTrackingService.trackChange({
        entityType: "activity",
        entityId: activityId,
        changeType: "update",
        newData: {
          teamBalance: balanceResult.teams,
          balanceMetrics: balanceResult.metrics,
        },
        affectedUserId: user.id,
        relatedEntityId: activityId,
        triggeredBy: user.id,
        changeSource: "user_action",
      });

      console.log(`✅ Teams balanced successfully for activity: ${activityId}`);

      return c.json({
        success: true,
        data: {
          teams: balanceResult.teams,
          metrics: balanceResult.metrics,
          participantCount: participants.length,
        },
        message: "Teams balanced successfully",
      });
    } catch (error) {
      console.error("Error balancing teams:", error);
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

// DELETE /activities/:id - Delete activity (creator only)
activitiesRouter.delete(
  "/:id",
  zValidator("param", activityIdSchema),
  authenticateToken,
  async (c) => {
    try {
      const user = c.get("user");
      const { id: activityId } = c.req.valid("param");

      console.log(
        `🗑️ Delete activity request: ${activityId} by ${user.username}`
      );

      // Verify user is the activity creator
      const activity = await db.query.activities.findFirst({
        where: and(
          eq(activities.id, activityId),
          eq(activities.creatorId, user.id)
        ),
      });

      if (!activity) {
        return c.json(
          {
            success: false,
            error: "Activity not found or you are not the creator",
          },
          404
        );
      }

      if (activity.completionStatus === "completed") {
        return c.json(
          {
            success: false,
            error: "Cannot delete completed activities",
          },
          400
        );
      }

      // Get participants for notifications
      const participants = await db
        .select({
          userId: activityParticipants.userId,
          username: users.username,
        })
        .from(activityParticipants)
        .innerJoin(users, eq(users.id, activityParticipants.userId))
        .where(
          and(
            eq(activityParticipants.activityId, activityId),
            eq(activityParticipants.status, "accepted")
          )
        );

      // Delete activity (cascade will handle related records)
      await db.delete(activities).where(eq(activities.id, activityId));

      // Notify participants about deletion
      for (const participant of participants) {
        if (participant.userId !== user.id) {
          await deltaTrackingService.trackChange({
            entityType: "activity",
            entityId: activityId,
            changeType: "delete",
            newData: {
              activityId,
              description: activity.description,
              deletedBy: { id: user.id, username: user.username },
              reason: "Activity cancelled by creator",
            },
            affectedUserId: participant.userId,
            relatedEntityId: activityId,
            triggeredBy: user.id,
            changeSource: "user_action",
          });
        }
      }

      console.log(`✅ Activity deleted successfully: ${activityId}`);

      return c.json({
        success: true,
        message: "Activity deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting activity:", error);
      return c.json(
        {
          success: false,
          error: "Failed to delete activity",
        },
        500
      );
    }
  }
);

// PUT /activities/:id - Update activity (creator only)
activitiesRouter.put(
  "/:id",
  zValidator("param", activityIdSchema),
  zValidator("json", updateActivitySchema),
  authenticateToken,
  async (c) => {
    try {
      const user = c.get("user");
      const { id: activityId } = c.req.valid("param");
      const updateData = c.req.valid("json");

      console.log(
        `📝 Update activity request: ${activityId} by ${user.username}`
      );

      // Verify user is the activity creator
      const activity = await db.query.activities.findFirst({
        where: and(
          eq(activities.id, activityId),
          eq(activities.creatorId, user.id)
        ),
      });

      const filteredUpdateData = Object.fromEntries(
        Object.entries(updateData).filter(
          ([key, value]) =>
            value !== null &&
            value !== undefined &&
            !["id", "publicId", "createdAt"].includes(key)
        )
      );

      if (!activity) {
        return c.json(
          {
            success: false,
            error: "Activity not found or you are not the creator",
          },
          404
        );
      }

      if (activity.completionStatus === "completed") {
        return c.json(
          {
            success: false,
            error: "Cannot update completed activities",
          },
          400
        );
      }

      // Update the activity
      const [updatedActivity] = await db
        .update(activities)
        .set({
          ...filteredUpdateData,
          updatedAt: new Date(),
        })
        .where(eq(activities.id, activityId))
        .returning();

      // Track delta change for participants
      const participants = await db
        .select({ userId: activityParticipants.userId })
        .from(activityParticipants)
        .where(
          and(
            eq(activityParticipants.activityId, activityId),
            eq(activityParticipants.status, "accepted")
          )
        );

      for (const participant of participants) {
        if (participant.userId !== user.id) {
          await deltaTrackingService.trackChange({
            entityType: "activity",
            entityId: activityId,
            changeType: "update",
            newData: {
              activityId,
              updates: updateData,
              updatedBy: { id: user.id, username: user.username },
            },
            affectedUserId: participant.userId,
            relatedEntityId: activityId,
            triggeredBy: user.id,
            changeSource: "user_action",
          });
        }
      }

      console.log(`✅ Activity updated successfully: ${activityId}`);

      return c.json({
        success: true,
        data: {
          activity: updatedActivity,
        },
        message: "Activity updated successfully",
      });
    } catch (error) {
      console.error("Error updating activity:", error);
      return c.json(
        {
          success: false,
          error: "Failed to update activity",
        },
        500
      );
    }
  }
);

export default activitiesRouter;
