// src/routes/enhanced-activities.router.ts - UPDATED with ELO Integration
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  activities,
  activityParticipants,
  users,
  activityTypes,
  userActivityTypeELOs,
  activityELOStatus,
  activityChatRooms,
  activityChatReadStatus,
} from "../db/schema.js";
import { authenticateToken } from "../middleware/auth.js";
import { eloProcessingService } from "../services/elo-processing.service.js";

export const activitiesRouter = new Hono();

// Activity creation schema
const createActivitySchema = z.object({
  activityTypeId: z.string().uuid(),
  description: z.string().min(1).max(1000),
  location: z.string().max(200).optional(),
  dateTime: z.string().pipe(z.coerce.date()),
  maxParticipants: z.number().int().positive().optional(),
  eloLevel: z.number().int().positive().optional(),
  isELORated: z.boolean().default(true),
});

// Join activity schema
const joinActivitySchema = z.object({
  team: z.string().max(50).optional(),
  message: z.string().max(500).optional(),
});

// 🆕 Enhanced Complete activity schema with ELO integration
const completeActivitySchema = z.object({
  results: z
    .array(
      z.object({
        userId: z.string().uuid(),
        finalResult: z.enum(["win", "loss", "draw"]),
        performanceNotes: z.string().max(1000).optional(),
      })
    )
    .min(1, "At least one result required"),
  processELOImmediately: z.boolean().default(true), // Option to defer ELO calculation
});

// 🆕 Helper function to auto-create chat room
async function autoCreateChatRoom(
  activityId: string,
  activityTypeId: string,
  activityDescription: string
) {
  try {
    // Check if chat room already exists
    const existingChat = await db
      .select()
      .from(activityChatRooms)
      .where(eq(activityChatRooms.activityId, activityId))
      .limit(1);

    if (existingChat.length > 0) {
      console.log(`Chat room already exists for activity ${activityId}`);
      return existingChat[0];
    }

    // Get activity type name
    const [activityType] = await db
      .select({ name: activityTypes.name })
      .from(activityTypes)
      .where(eq(activityTypes.id, activityTypeId))
      .limit(1);

    if (!activityType) {
      throw new Error("Activity type not found");
    }

    // Generate chat room name
    const chatRoomName = `${activityType.name} Chat - ${
      activityDescription || "Activity Discussion"
    }`;

    // Create chat room
    const [newChatRoom] = await db
      .insert(activityChatRooms)
      .values({
        activityId,
        name: chatRoomName,
        description: "Chat room for activity participants",
        isActive: true,
      })
      .returning();

    console.log(
      `✅ Auto-created chat room: ${chatRoomName} for activity ${activityId}`
    );

    // Get all accepted participants for this activity
    const participants = await db
      .select({ userId: activityParticipants.userId })
      .from(activityParticipants)
      .where(
        and(
          eq(activityParticipants.activityId, activityId),
          eq(activityParticipants.status, "accepted")
        )
      );

    // Create read status for all participants
    if (participants.length > 0) {
      await db.insert(activityChatReadStatus).values(
        participants.map((p) => ({
          userId: p.userId,
          chatRoomId: newChatRoom.id,
          unreadCount: 0,
        }))
      );

      console.log(
        `✅ Created read status for ${participants.length} participants`
      );
    }

    return newChatRoom;
  } catch (error) {
    console.error("Error auto-creating chat room:", error);
    throw error;
  }
}

// 🆕 Helper function to add participant to existing chat
async function addParticipantToExistingChat(
  activityId: string,
  userId: string
) {
  try {
    // Check if chat room exists for this activity
    const [chatRoom] = await db
      .select()
      .from(activityChatRooms)
      .where(eq(activityChatRooms.activityId, activityId))
      .limit(1);

    if (!chatRoom) {
      console.log(`No chat room found for activity ${activityId}`);
      return;
    }

    // Check if user already has read status
    const existingReadStatus = await db
      .select()
      .from(activityChatReadStatus)
      .where(
        and(
          eq(activityChatReadStatus.userId, userId),
          eq(activityChatReadStatus.chatRoomId, chatRoom.id)
        )
      )
      .limit(1);

    if (existingReadStatus.length > 0) {
      console.log(
        `User ${userId} already has read status for chat room ${chatRoom.id}`
      );
      return;
    }

    // Get current message count for unread count
    const messageCount = await db
      .select({ count: count() })
      .from(activityChatReadStatus)
      .where(eq(activityChatReadStatus.chatRoomId, chatRoom.id));

    // Add read status for new participant
    await db.insert(activityChatReadStatus).values({
      userId,
      chatRoomId: chatRoom.id,
      unreadCount: messageCount[0]?.count || 0,
    });

    console.log(
      `✅ Added participant ${userId} to existing chat room ${chatRoom.id}`
    );
  } catch (error) {
    console.error("Error adding participant to existing chat:", error);
    // Don't throw - this is non-critical
  }
}

// GET /activities - List activities with participants and ELO info
activitiesRouter.get("/", async (c) => {
  try {
    const includeELOStatus = c.req.query("include_elo") === "true";

    const allActivities = await db
      .select({
        activity: activities,
        activityType: activityTypes,
        creator: {
          id: users.id,
          username: users.username,
          email: users.email,
        },
      })
      .from(activities)
      .leftJoin(activityTypes, eq(activities.activityTypeId, activityTypes.id))
      .leftJoin(users, eq(activities.creatorId, users.id))
      .orderBy(desc(activities.createdAt));

    // Get participants for each activity
    const activitiesWithDetails = await Promise.all(
      allActivities.map(async (item) => {
        const participants = await db
          .select({
            participant: activityParticipants,
            user: {
              id: users.id,
              username: users.username,
              email: users.email,
            },
            // Properly typed ELO fields when included
            ...(includeELOStatus
              ? {
                  eloScore: userActivityTypeELOs.eloScore,
                  gamesPlayed: userActivityTypeELOs.gamesPlayed,
                  peakELO: userActivityTypeELOs.peakELO,
                  volatility: userActivityTypeELOs.volatility,
                }
              : {}),
          })
          .from(activityParticipants)
          .leftJoin(users, eq(activityParticipants.userId, users.id))
          .leftJoin(
            userActivityTypeELOs,
            includeELOStatus
              ? and(
                  eq(activityParticipants.userId, userActivityTypeELOs.userId),
                  eq(
                    userActivityTypeELOs.activityTypeId,
                    item.activity.activityTypeId
                  )
                )
              : undefined
          )
          .where(eq(activityParticipants.activityId, item.activity.id));

        // Check if chat room exists
        const chatRoom = await db
          .select({ id: activityChatRooms.id, name: activityChatRooms.name })
          .from(activityChatRooms)
          .where(eq(activityChatRooms.activityId, item.activity.id))
          .limit(1);

        // 🆕 Get ELO processing status
        let eloStatus = null;
        if (
          includeELOStatus &&
          item.activity.completionStatus === "completed"
        ) {
          const processingStatus =
            await eloProcessingService.getProcessingStatus(item.activity.id);
          eloStatus = processingStatus;
        }

        return {
          id: item.activity.id,
          activityTypeId: item.activity.activityTypeId,
          creatorId: item.activity.creatorId,
          description: item.activity.description,
          location: item.activity.location,
          dateTime: item.activity.dateTime,
          maxParticipants: item.activity.maxParticipants,
          eloLevel: item.activity.eloLevel,
          isELORated: item.activity.isELORated,
          completionStatus: item.activity.completionStatus,
          createdAt: item.activity.createdAt,
          updatedAt: item.activity.updatedAt,
          activityType: item.activityType,
          creator: item.creator,
          participants: participants.map((p) => ({
            id: p.participant.id,
            activityId: p.participant.activityId,
            userId: p.participant.userId,
            status: p.participant.status,
            team: p.participant.team,
            joinedAt: p.participant.joinedAt,
            finalResult: p.participant.finalResult,
            performanceNotes: p.participant.performanceNotes,
            user: p.user,
            currentELO: includeELOStatus ? p.eloScore : undefined,
            eloGamesPlayed: includeELOStatus ? p.gamesPlayed : undefined,
            peakELO: includeELOStatus ? p.peakELO : undefined,
            volatility: includeELOStatus ? p.volatility : undefined,
          })),
          participantCount: participants.length,
          hasChat: chatRoom.length > 0,
          chatRoomName: chatRoom[0]?.name,
          eloStatus,
        };
      })
    );

    return c.json({
      status: "success",
      data: {
        activities: activitiesWithDetails,
        total: activitiesWithDetails.length,
      },
    });
  } catch (error) {
    console.error("Error fetching activities:", error);
    return c.json({ error: "Failed to fetch activities" }, 500);
  }
});

// POST /activities - Create new activity with ELO level matching
activitiesRouter.post(
  "/",
  authenticateToken,
  zValidator("json", createActivitySchema),
  async (c) => {
    try {
      const activityData = c.req.valid("json");
      const user = c.get("user");

      // Verify activity type exists
      const [activityType] = await db
        .select()
        .from(activityTypes)
        .where(eq(activityTypes.id, activityData.activityTypeId))
        .limit(1);

      if (!activityType) {
        return c.json({ error: "Activity type not found" }, 404);
      }

      // 🆕 If ELO level not specified, suggest based on creator's ELO
      let suggestedELOLevel = activityData.eloLevel;
      if (!suggestedELOLevel && activityData.isELORated) {
        const [creatorELO] = await db
          .select({ eloScore: userActivityTypeELOs.eloScore })
          .from(userActivityTypeELOs)
          .where(
            and(
              eq(userActivityTypeELOs.userId, user.id),
              eq(
                userActivityTypeELOs.activityTypeId,
                activityData.activityTypeId
              )
            )
          )
          .limit(1);

        suggestedELOLevel = creatorELO?.eloScore || 1200; // Default starting ELO
      }

      // Create activity
      const [newActivity] = await db
        .insert(activities)
        .values({
          ...activityData,
          eloLevel: suggestedELOLevel,
          creatorId: user.id,
          completionStatus: "scheduled",
        })
        .returning();

      // Auto-add creator as participant
      await db.insert(activityParticipants).values({
        activityId: newActivity.id,
        userId: user.id,
        status: "accepted",
      });

      console.log(
        `✅ Created activity ${newActivity.id} with ELO level ${suggestedELOLevel}`
      );

      return c.json(
        {
          status: "success",
          data: {
            activity: {
              ...newActivity,
              suggestedELOLevel,
            },
          },
          message: "Activity created successfully",
        },
        201
      );
    } catch (error) {
      console.error("Error creating activity:", error);
      return c.json({ error: "Failed to create activity" }, 500);
    }
  }
);

// GET /activities/:id - Get specific activity with ELO details
activitiesRouter.get("/:id", async (c) => {
  try {
    const activityId = c.req.param("id");

    const [activityData] = await db
      .select({
        activity: activities,
        activityType: activityTypes,
        creator: {
          id: users.id,
          username: users.username,
          email: users.email,
        },
      })
      .from(activities)
      .leftJoin(activityTypes, eq(activities.activityTypeId, activityTypes.id))
      .leftJoin(users, eq(activities.creatorId, users.id))
      .where(eq(activities.id, activityId))
      .limit(1);

    if (!activityData) {
      return c.json({ error: "Activity not found" }, 404);
    }

    // Get participants with ELO info
    const participants = await db
      .select({
        participant: activityParticipants,
        user: {
          id: users.id,
          username: users.username,
          email: users.email,
        },
        elo: userActivityTypeELOs,
      })
      .from(activityParticipants)
      .leftJoin(users, eq(activityParticipants.userId, users.id))
      .leftJoin(
        userActivityTypeELOs,
        and(
          eq(activityParticipants.userId, userActivityTypeELOs.userId),
          eq(
            userActivityTypeELOs.activityTypeId,
            activityData.activity.activityTypeId
          )
        )
      )
      .where(eq(activityParticipants.activityId, activityId));

    // Check if chat room exists
    const chatRoom = await db
      .select()
      .from(activityChatRooms)
      .where(eq(activityChatRooms.activityId, activityId))
      .limit(1);

    // 🆕 Get ELO processing status if completed
    let eloStatus = null;
    if (activityData.activity.completionStatus === "completed") {
      eloStatus = await eloProcessingService.getProcessingStatus(activityId);
    }

    const fullActivity = {
      ...activityData.activity,
      activityType: activityData.activityType,
      creator: activityData.creator,
      participants: participants.map((p) => ({
        ...p.participant,
        user: p.user,
        currentELO: p.elo?.eloScore,
        eloGamesPlayed: p.elo?.gamesPlayed,
        peakELO: p.elo?.peakELO,
      })),
      participantCount: participants.length,
      hasChat: chatRoom.length > 0,
      chatRoom: chatRoom[0] || null,
      eloStatus, // 🆕 ELO processing information
    };

    return c.json({
      status: "success",
      data: { activity: fullActivity },
    });
  } catch (error) {
    console.error("Error fetching activity:", error);
    return c.json({ error: "Failed to fetch activity" }, 500);
  }
});

// POST /activities/:id/join - Join an activity with ELO level checking
activitiesRouter.post(
  "/:id/join",
  authenticateToken,
  zValidator("json", joinActivitySchema),
  async (c) => {
    try {
      const activityId = c.req.param("id");
      const joinData = c.req.valid("json");
      const user = c.get("user");

      // Start database transaction for atomicity
      const result = await db.transaction(async (tx) => {
        // Check if activity exists
        const [activity] = await tx
          .select()
          .from(activities)
          .where(eq(activities.id, activityId))
          .limit(1);

        if (!activity) {
          throw new Error("Activity not found");
        }

        // Check if user is already a participant
        const [existingParticipant] = await tx
          .select()
          .from(activityParticipants)
          .where(
            and(
              eq(activityParticipants.activityId, activityId),
              eq(activityParticipants.userId, user.id)
            )
          )
          .limit(1);

        if (existingParticipant) {
          throw new Error("Already joined this activity");
        }

        // Check max participants
        if (activity.maxParticipants) {
          const participantCount = await tx
            .select({ count: count() })
            .from(activityParticipants)
            .where(eq(activityParticipants.activityId, activityId));

          if (participantCount[0].count >= activity.maxParticipants) {
            throw new Error("Activity is full");
          }
        }

        // 🆕 ELO level checking for competitive activities
        if (activity.isELORated && activity.eloLevel) {
          const [userELO] = await tx
            .select({ eloScore: userActivityTypeELOs.eloScore })
            .from(userActivityTypeELOs)
            .where(
              and(
                eq(userActivityTypeELOs.userId, user.id),
                eq(userActivityTypeELOs.activityTypeId, activity.activityTypeId)
              )
            )
            .limit(1);

          const currentELO = userELO?.eloScore || 1200; // Default for new players
          const eloTolerance = 200; // Allow ±200 ELO difference

          if (Math.abs(currentELO - activity.eloLevel) > eloTolerance) {
            console.log(
              `⚠️  ELO mismatch: User ${currentELO} vs Activity ${activity.eloLevel}`
            );
            // For MVP, just warn but still allow joining
            // In production, might want to require confirmation or restrict
          }
        }

        // Add participant
        const [newParticipant] = await tx
          .insert(activityParticipants)
          .values({
            activityId,
            userId: user.id,
            status: "accepted", // Auto-accept for now
            team: joinData.team,
          })
          .returning();

        // Count total accepted participants after adding this one
        const acceptedParticipants = await tx
          .select({ count: count() })
          .from(activityParticipants)
          .where(
            and(
              eq(activityParticipants.activityId, activityId),
              eq(activityParticipants.status, "accepted")
            )
          );

        const participantCount = acceptedParticipants[0].count;
        console.log(
          `Activity ${activityId} now has ${participantCount} participants`
        );

        return { newParticipant, participantCount, activity };
      });

      // Auto-create chat room if this is the 2nd participant (outside transaction)
      if (result.participantCount === 2) {
        console.log(
          `🎯 Creating chat room for activity ${activityId} (2nd participant joined)`
        );
        try {
          await autoCreateChatRoom(
            activityId,
            result.activity.activityTypeId,
            result.activity.description || "Activity"
          );
        } catch (chatError) {
          console.error(
            "Failed to create chat room, but participant was added:",
            chatError
          );
          // Don't fail the join request if chat creation fails
        }
      } else if (result.participantCount > 2) {
        // Add participant to existing chat room
        console.log(
          `➕ Adding participant ${user.id} to existing chat for activity ${activityId}`
        );
        try {
          await addParticipantToExistingChat(activityId, user.id);
        } catch (chatError) {
          console.error(
            "Failed to add participant to chat, but participant was added:",
            chatError
          );
          // Don't fail the join request if chat addition fails
        }
      }

      return c.json({
        status: "success",
        data: { participant: result.newParticipant },
        message: "Successfully joined activity",
      });
    } catch (error) {
      console.error("Error joining activity:", error);

      if (error instanceof Error) {
        return c.json({ error: error.message }, 400);
      }
      return c.json({ error: "Failed to join activity" }, 500);
    }
  }
);

// 🆕 POST /activities/:id/complete - Mark activity as completed with ELO calculation
activitiesRouter.post(
  "/:id/complete",
  authenticateToken,
  zValidator("json", completeActivitySchema),
  async (c) => {
    try {
      const activityId = c.req.param("id");
      const completionData = c.req.valid("json");
      const user = c.get("user");

      console.log(
        `🏁 Activity completion request for ${activityId} by ${user.username}`
      );

      // Check if user is the creator
      const [activity] = await db
        .select()
        .from(activities)
        .where(
          and(eq(activities.id, activityId), eq(activities.creatorId, user.id))
        )
        .limit(1);

      if (!activity) {
        return c.json({ error: "Activity not found or unauthorized" }, 404);
      }

      if (activity.completionStatus === "completed") {
        return c.json({ error: "Activity already completed" }, 400);
      }

      // Validate that all participants have results
      const allParticipants = await db
        .select({ userId: activityParticipants.userId })
        .from(activityParticipants)
        .where(
          and(
            eq(activityParticipants.activityId, activityId),
            eq(activityParticipants.status, "accepted")
          )
        );

      const resultUserIds = new Set(
        completionData.results.map((r) => r.userId)
      );
      const missingResults = allParticipants.filter(
        (p) => !resultUserIds.has(p.userId)
      );

      if (missingResults.length > 0) {
        return c.json(
          {
            error: "Results missing for some participants",
            missingParticipants: missingResults.map((p) => p.userId),
          },
          400
        );
      }

      // 🆕 Process activity completion with ELO integration
      const activityCompletionData = {
        activityId,
        results: completionData.results,
        completedBy: user.id,
        completedAt: new Date(),
      };

      let eloResults = null;

      if (completionData.processELOImmediately) {
        try {
          // Process ELO calculation immediately
          eloResults = await eloProcessingService.onActivityCompletion(
            activityCompletionData
          );

          if (eloResults) {
            console.log(
              `🎯 ELO calculation completed for ${eloResults.length} participants`
            );
          } else {
            console.log(
              `ℹ️  Activity completed but not eligible for ELO calculation`
            );
          }
        } catch (eloError) {
          console.error(
            "ELO calculation failed but activity completion succeeded:",
            eloError
          );
          // Don't fail the entire request if ELO calculation fails
          // The ELO service has retry mechanisms
        }
      } else {
        // Just mark as completed, ELO will be processed later
        await eloProcessingService.onActivityCompletion({
          ...activityCompletionData,
          // This will mark activity as complete but defer ELO calculation
        });
      }

      // Get processing status for response
      const eloStatus = await eloProcessingService.getProcessingStatus(
        activityId
      );

      return c.json({
        status: "success",
        data: {
          activity: {
            id: activityId,
            completionStatus: "completed",
            completedAt: new Date(),
          },
          eloProcessing: {
            status: eloStatus.status,
            resultsCalculated: eloResults !== null,
            participantsAffected: eloResults?.length || 0,
            averageELOChange: eloResults
              ? eloResults.reduce((sum, r) => sum + Math.abs(r.eloChange), 0) /
                eloResults.length
              : 0,
          },
        },
        message:
          "Activity completed successfully" +
          (eloResults ? " with ELO updates" : ""),
      });
    } catch (error) {
      console.error("Error completing activity:", error);
      return c.json({ error: "Failed to complete activity" }, 500);
    }
  }
);

// 🆕 GET /activities/:id/elo-status - Get ELO processing status
activitiesRouter.get("/:id/elo-status", authenticateToken, async (c) => {
  try {
    const activityId = c.req.param("id");
    const status = await eloProcessingService.getProcessingStatus(activityId);

    return c.json({
      status: "success",
      data: { eloStatus: status },
    });
  } catch (error) {
    console.error("Error fetching ELO status:", error);
    return c.json({ error: "Failed to fetch ELO status" }, 500);
  }
});

// 🆕 POST /activities/:id/recalculate-elo - Manual ELO recalculation (admin)
activitiesRouter.post("/:id/recalculate-elo", authenticateToken, async (c) => {
  try {
    const activityId = c.req.param("id");
    const user = c.get("user");

    // Check admin permissions
    if (user.role !== "admin") {
      return c.json({ error: "Admin access required" }, 403);
    }

    console.log(
      `🔧 Manual ELO recalculation requested by admin ${user.username}`
    );

    const results = await eloProcessingService.recalculateActivityELO(
      activityId,
      user.id
    );

    return c.json({
      status: "success",
      data: {
        message: "ELO recalculation completed",
        results: results.map((r) => ({
          userId: r.userId,
          oldELO: r.oldELO,
          newELO: r.newELO,
          change: r.eloChange,
        })),
      },
    });
  } catch (error) {
    console.error("Error recalculating ELO:", error);
    return c.json({ error: "Failed to recalculate ELO" }, 500);
  }
});

// 🆕 GET /activities/elo-leaderboard/:activityTypeId - Get ELO leaderboard
activitiesRouter.get("/elo-leaderboard/:activityTypeId", async (c) => {
  try {
    const activityTypeId = c.req.param("activityTypeId");
    const limit = parseInt(c.req.query("limit") || "50");
    const offset = parseInt(c.req.query("offset") || "0");

    const leaderboard = await db
      .select({
        user: {
          id: users.id,
          username: users.username,
          avatarUrl: users.avatarUrl,
        },
        elo: {
          eloScore: userActivityTypeELOs.eloScore,
          gamesPlayed: userActivityTypeELOs.gamesPlayed,
          peakELO: userActivityTypeELOs.peakELO,
          lastUpdated: userActivityTypeELOs.lastUpdated,
        },
      })
      .from(userActivityTypeELOs)
      .leftJoin(users, eq(userActivityTypeELOs.userId, users.id))
      .where(eq(userActivityTypeELOs.activityTypeId, activityTypeId))
      .orderBy(desc(userActivityTypeELOs.eloScore))
      .limit(limit)
      .offset(offset);

    // Get activity type info
    const [activityType] = await db
      .select({ name: activityTypes.name })
      .from(activityTypes)
      .where(eq(activityTypes.id, activityTypeId))
      .limit(1);

    return c.json({
      status: "success",
      data: {
        activityType: activityType?.name || "Unknown",
        leaderboard: leaderboard.map((entry, index) => ({
          rank: offset + index + 1,
          user: entry.user,
          eloScore: entry.elo?.eloScore || 1200,
          gamesPlayed: entry.elo?.gamesPlayed || 0,
          peakELO: entry.elo?.peakELO || 1200,
          lastUpdated: entry.elo?.lastUpdated,
        })),
        pagination: {
          limit,
          offset,
          total: leaderboard.length,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching ELO leaderboard:", error);
    return c.json({ error: "Failed to fetch leaderboard" }, 500);
  }
});

// 🆕 GET /activities/my-elo-stats - Get current user's ELO statistics
activitiesRouter.get("/my-elo-stats", authenticateToken, async (c) => {
  try {
    const user = c.get("user");

    const userELOStats = await db
      .select({
        activityType: {
          id: activityTypes.id,
          name: activityTypes.name,
          category: activityTypes.category,
        },
        elo: {
          eloScore: userActivityTypeELOs.eloScore,
          gamesPlayed: userActivityTypeELOs.gamesPlayed,
          peakELO: userActivityTypeELOs.peakELO,
          lastUpdated: userActivityTypeELOs.lastUpdated,
        },
      })
      .from(userActivityTypeELOs)
      .leftJoin(
        activityTypes,
        eq(userActivityTypeELOs.activityTypeId, activityTypes.id)
      )
      .where(eq(userActivityTypeELOs.userId, user.id))
      .orderBy(desc(userActivityTypeELOs.eloScore));

    // Calculate overall stats
    const totalGames = userELOStats.reduce(
      (sum, stat) => sum + (stat.elo?.gamesPlayed || 0),
      0
    );
    const averageELO =
      userELOStats.length > 0
        ? userELOStats.reduce(
            (sum, stat) => sum + (stat.elo?.eloScore || 1200),
            0
          ) / userELOStats.length
        : 1200;
    const highestELO = Math.max(
      ...userELOStats.map((stat) => stat.elo?.peakELO || 1200)
    );

    return c.json({
      status: "success",
      data: {
        overallStats: {
          totalGames,
          averageELO: Math.round(averageELO),
          highestELO,
          activeSports: userELOStats.length,
        },
        sportStats: userELOStats.map((stat) => ({
          activityType: stat.activityType,
          currentELO: stat.elo?.eloScore || 1200,
          gamesPlayed: stat.elo?.gamesPlayed || 0,
          peakELO: stat.elo?.peakELO || 1200,
          lastPlayed: stat.elo?.lastUpdated,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching user ELO stats:", error);
    return c.json({ error: "Failed to fetch ELO statistics" }, 500);
  }
});
