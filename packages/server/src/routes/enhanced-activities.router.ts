// src/routes/enhanced-activities.router.ts - Updated with auto-chat creation
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, desc, count } from 'drizzle-orm';
import { db } from '../db/client.js';
import { 
  activities, 
  activityParticipants, 
  users, 
  activityTypes,
  activityChatRooms,
  activityChatReadStatus
} from '../db/schema.js';
import { authenticateToken } from '../middleware/auth.js';

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

// Complete activity schema
const completeActivitySchema = z.object({
  results: z.array(z.object({
    userId: z.string().uuid(),
    finalResult: z.enum(['win', 'loss', 'draw']),
    performanceNotes: z.string().max(1000).optional(),
  })),
});

// 🆕 Helper function to auto-create chat room
async function autoCreateChatRoom(activityId: string, activityTypeId: string, activityDescription: string) {
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
      throw new Error('Activity type not found');
    }

    // Generate chat room name
    const chatRoomName = `${activityType.name} Chat - ${activityDescription || 'Activity Discussion'}`;

    // Create chat room
    const [newChatRoom] = await db
      .insert(activityChatRooms)
      .values({
        activityId,
        name: chatRoomName,
        description: 'Chat room for activity participants',
        isActive: true,
      })
      .returning();

    console.log(`✅ Auto-created chat room: ${chatRoomName} for activity ${activityId}`);

    // Get all accepted participants for this activity
    const participants = await db
      .select({ userId: activityParticipants.userId })
      .from(activityParticipants)
      .where(
        and(
          eq(activityParticipants.activityId, activityId),
          eq(activityParticipants.status, 'accepted')
        )
      );

    // Create read status for all participants
    if (participants.length > 0) {
      await db
        .insert(activityChatReadStatus)
        .values(
          participants.map(p => ({
            userId: p.userId,
            chatRoomId: newChatRoom.id,
            unreadCount: 0,
          }))
        );
      
      console.log(`✅ Created read status for ${participants.length} participants`);
    }

    return newChatRoom;
  } catch (error) {
    console.error('Error auto-creating chat room:', error);
    throw error;
  }
}

// 🆕 Helper function to add participant to existing chat
async function addParticipantToExistingChat(activityId: string, userId: string) {
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
      console.log(`User ${userId} already has read status for chat room ${chatRoom.id}`);
      return;
    }

    // Get current message count for unread count
    const messageCount = await db
      .select({ count: count() })
      .from(activityChatReadStatus)
      .where(eq(activityChatReadStatus.chatRoomId, chatRoom.id));

    // Add read status for new participant
    await db
      .insert(activityChatReadStatus)
      .values({
        userId,
        chatRoomId: chatRoom.id,
        unreadCount: messageCount[0]?.count || 0,
      });

    console.log(`✅ Added participant ${userId} to existing chat room ${chatRoom.id}`);
  } catch (error) {
    console.error('Error adding participant to existing chat:', error);
    // Don't throw - this is non-critical
  }
}

// GET /activities - List activities with participants
activitiesRouter.get('/', async (c) => {
  try {
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
    const activitiesWithParticipants = await Promise.all(
      allActivities.map(async (item) => {
        const participants = await db
          .select({
            participant: activityParticipants,
            user: {
              id: users.id,
              username: users.username,
              email: users.email,
            },
          })
          .from(activityParticipants)
          .leftJoin(users, eq(activityParticipants.userId, users.id))
          .where(eq(activityParticipants.activityId, item.activity.id));

        // Check if chat room exists
        const chatRoom = await db
          .select({ id: activityChatRooms.id, name: activityChatRooms.name })
          .from(activityChatRooms)
          .where(eq(activityChatRooms.activityId, item.activity.id))
          .limit(1);

        return {
          ...item.activity,
          activityType: item.activityType,
          creator: item.creator,
          participants: participants.map(p => ({
            ...p.participant,
            user: p.user,
          })),
          participantCount: participants.length,
          hasChat: chatRoom.length > 0,
          chatRoomName: chatRoom[0]?.name,
        };
      })
    );

    return c.json({
      status: 'success',
      data: {
        activities: activitiesWithParticipants,
        total: activitiesWithParticipants.length,
      },
    });
  } catch (error) {
    console.error('Error fetching activities:', error);
    return c.json({ error: 'Failed to fetch activities' }, 500);
  }
});

// POST /activities - Create new activity
activitiesRouter.post('/', 
  authenticateToken,
  zValidator('json', createActivitySchema),
  async (c) => {
    try {
      const activityData = c.req.valid('json');
      const user = c.get('user');

      // Verify activity type exists
      const [activityType] = await db
        .select()
        .from(activityTypes)
        .where(eq(activityTypes.id, activityData.activityTypeId))
        .limit(1);

      if (!activityType) {
        return c.json({ error: 'Activity type not found' }, 404);
      }

      // Create activity
      const [newActivity] = await db
        .insert(activities)
        .values({
          ...activityData,
          creatorId: user.id,
          completionStatus: 'scheduled',
        })
        .returning();

      // Auto-add creator as participant
      await db.insert(activityParticipants).values({
        activityId: newActivity.id,
        userId: user.id,
        status: 'accepted',
      });

      console.log(`✅ Created activity ${newActivity.id} with creator ${user.username}`);

      return c.json({
        status: 'success',
        data: { activity: newActivity },
        message: 'Activity created successfully',
      }, 201);
    } catch (error) {
      console.error('Error creating activity:', error);
      return c.json({ error: 'Failed to create activity' }, 500);
    }
  }
);

// GET /activities/:id - Get specific activity with details
activitiesRouter.get('/:id', async (c) => {
  try {
    const activityId = c.req.param('id');

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
      return c.json({ error: 'Activity not found' }, 404);
    }

    // Get participants
    const participants = await db
      .select({
        participant: activityParticipants,
        user: {
          id: users.id,
          username: users.username,
          email: users.email,
        },
      })
      .from(activityParticipants)
      .leftJoin(users, eq(activityParticipants.userId, users.id))
      .where(eq(activityParticipants.activityId, activityId));

    // Check if chat room exists
    const chatRoom = await db
      .select()
      .from(activityChatRooms)
      .where(eq(activityChatRooms.activityId, activityId))
      .limit(1);

    const fullActivity = {
      ...activityData.activity,
      activityType: activityData.activityType,
      creator: activityData.creator,
      participants: participants.map(p => ({
        ...p.participant,
        user: p.user,
      })),
      participantCount: participants.length,
      hasChat: chatRoom.length > 0,
      chatRoom: chatRoom[0] || null,
    };

    return c.json({
      status: 'success',
      data: { activity: fullActivity },
    });
  } catch (error) {
    console.error('Error fetching activity:', error);
    return c.json({ error: 'Failed to fetch activity' }, 500);
  }
});

// POST /activities/:id/join - Join an activity (🆕 WITH AUTO-CHAT CREATION)
activitiesRouter.post('/:id/join',
  authenticateToken,
  zValidator('json', joinActivitySchema),
  async (c) => {
    try {
      const activityId = c.req.param('id');
      const joinData = c.req.valid('json');
      const user = c.get('user');

      // Start database transaction for atomicity
      const result = await db.transaction(async (tx) => {
        // Check if activity exists
        const [activity] = await tx
          .select()
          .from(activities)
          .where(eq(activities.id, activityId))
          .limit(1);

        if (!activity) {
          throw new Error('Activity not found');
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
          throw new Error('Already joined this activity');
        }

        // Check max participants
        if (activity.maxParticipants) {
          const participantCount = await tx
            .select({ count: count() })
            .from(activityParticipants)
            .where(eq(activityParticipants.activityId, activityId));

          if (participantCount[0].count >= activity.maxParticipants) {
            throw new Error('Activity is full');
          }
        }

        // Add participant
        const [newParticipant] = await tx
          .insert(activityParticipants)
          .values({
            activityId,
            userId: user.id,
            status: 'accepted', // Auto-accept for now
            team: joinData.team,
          })
          .returning();

        // 🆕 Count total accepted participants after adding this one
        const acceptedParticipants = await tx
          .select({ count: count() })
          .from(activityParticipants)
          .where(
            and(
              eq(activityParticipants.activityId, activityId),
              eq(activityParticipants.status, 'accepted')
            )
          );

        const participantCount = acceptedParticipants[0].count;
        console.log(`Activity ${activityId} now has ${participantCount} participants`);

        return { newParticipant, participantCount, activity };
      });

      // 🆕 Auto-create chat room if this is the 2nd participant (outside transaction)
      if (result.participantCount === 2) {
        console.log(`🎯 Creating chat room for activity ${activityId} (2nd participant joined)`);
        try {
          await autoCreateChatRoom(
            activityId, 
            result.activity.activityTypeId, 
            result.activity.description || 'Activity'
          );
        } catch (chatError) {
          console.error('Failed to create chat room, but participant was added:', chatError);
          // Don't fail the join request if chat creation fails
        }
      } else if (result.participantCount > 2) {
        // 🆕 Add participant to existing chat room
        console.log(`➕ Adding participant ${user.id} to existing chat for activity ${activityId}`);
        try {
          await addParticipantToExistingChat(activityId, user.id);
        } catch (chatError) {
          console.error('Failed to add participant to chat, but participant was added:', chatError);
          // Don't fail the join request if chat addition fails
        }
      }

      return c.json({
        status: 'success',
        data: { participant: result.newParticipant },
        message: 'Successfully joined activity',
      });
    } catch (error) {
      console.error('Error joining activity:', error);
      
      if (error instanceof Error) {
        return c.json({ error: error.message }, 400);
      }
      return c.json({ error: 'Failed to join activity' }, 500);
    }
  }
);

// POST /activities/:id/complete - Mark activity as completed
activitiesRouter.post('/:id/complete',
  authenticateToken,
  zValidator('json', completeActivitySchema),
  async (c) => {
    try {
      const activityId = c.req.param('id');
      const completionData = c.req.valid('json');
      const user = c.get('user');

      // Check if user is the creator
      const [activity] = await db
        .select()
        .from(activities)
        .where(
          and(
            eq(activities.id, activityId),
            eq(activities.creatorId, user.id)
          )
        )
        .limit(1);

      if (!activity) {
        return c.json({ error: 'Activity not found or unauthorized' }, 404);
      }

      if (activity.completionStatus === 'completed') {
        return c.json({ error: 'Activity already completed' }, 400);
      }

      // Update activity status
      await db
        .update(activities)
        .set({ 
          completionStatus: 'completed',
          updatedAt: new Date()
        })
        .where(eq(activities.id, activityId));

      // Update participant results
      for (const result of completionData.results) {
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

      return c.json({
        status: 'success',
        message: 'Activity completed successfully',
      });
    } catch (error) {
      console.error('Error completing activity:', error);
      return c.json({ error: 'Failed to complete activity' }, 500);
    }
  }
);