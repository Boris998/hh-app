// src/routes/activity-chat.router.ts - Complete implementation for activity-specific chat

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth.js';
import { db } from '../db/client.js';
import {
  activityChatRooms,
  activityChatMessages,
  activityChatReadStatus,
  activities,
  activityParticipants,
  users,
} from '../db/schema.js';
import { eq, and, desc, sql, count, or, gte } from 'drizzle-orm';
import { deltaTrackingService } from '../services/delta-tracking.service.js';

export const activityChatRouter = new Hono();

// Validation schemas
const sendMessageSchema = z.object({
  content: z.string().min(1, 'Message content is required').max(2000, 'Message too long'),
  messageType: z.enum(['text', 'system', 'announcement']).default('text'),
  metadata: z.record(z.any()).optional(),
});

const getMessagesSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  since: z.string().optional(), // ISO timestamp for incremental loading
});

const markReadSchema = z.object({
  lastReadMessageId: z.string().uuid('Invalid message ID'),
});

// GET /activity-chat/:activityId - Get or create activity chat room
activityChatRouter.get('/:activityId', authenticateToken, async (c) => {
  try {
    const user = c.get('user');
    const activityId = c.req.param('activityId');

    console.log(`💬 Getting activity chat for activity: ${activityId}`);

    // Verify user is a participant in the activity
    const participation = await db.query.activityParticipants.findFirst({
      where: and(
        eq(activityParticipants.activityId, activityId),
        eq(activityParticipants.userId, user.id)
      ),
    });

    if (!participation) {
      return c.json({
        success: false,
        error: 'Access denied. You must be a participant in this activity to access its chat.',
      }, 403);
    }

    // Get activity details
    const activity = await db.query.activities.findFirst({
      where: eq(activities.id, activityId),
    });

    if (!activity) {
      return c.json({
        success: false,
        error: 'Activity not found',
      }, 404);
    }

    // Get or create activity chat room
    let chatRoom = await db.query.activityChatRooms.findFirst({
      where: eq(activityChatRooms.activityId, activityId),
    });

    if (!chatRoom) {
      // Create chat room for this activity
      const [newChatRoom] = await db
        .insert(activityChatRooms)
        .values({
          activityId,
          createdById: activity.creatorId,
          isActive: true,
        })
        .returning();

      chatRoom = newChatRoom;

      // Create initial system message
      await db
        .insert(activityChatMessages)
        .values({
          roomId: chatRoom.id,
          senderId: activity.creatorId,
          content: 'Activity chat room created. Welcome everyone!',
          messageType: 'system',
        });
    }

    // Get participant count
    const participantCount = await db
      .select({ count: count(activityParticipants.userId) })
      .from(activityParticipants)
      .where(
        and(
          eq(activityParticipants.activityId, activityId),
          eq(activityParticipants.status, 'accepted')
        )
      );

    // Get user's read status
    const readStatus = await db.query.activityChatReadStatus.findFirst({
      where: and(
        eq(activityChatReadStatus.roomId, chatRoom.id),
        eq(activityChatReadStatus.userId, user.id)
      ),
    });

    // Get unread message count
    let unreadCount = 0;
    if (readStatus?.lastReadAt) {
      const unreadResult = await db
        .select({ count: count(activityChatMessages.id) })
        .from(activityChatMessages)
        .where(
          and(
            eq(activityChatMessages.roomId, chatRoom.id),
            sql`${activityChatMessages.createdAt} > ${readStatus.lastReadAt}`
          )
        );
      unreadCount = unreadResult[0]?.count || 0;
    } else {
      // First time accessing chat
      const totalResult = await db
        .select({ count: count(activityChatMessages.id) })
        .from(activityChatMessages)
        .where(eq(activityChatMessages.roomId, chatRoom.id));
      unreadCount = totalResult[0]?.count || 0;
    }

    return c.json({
      success: true,
      data: {
        chatRoom,
        activity: {
          id: activity.id,
          description: activity.description,
          dateTime: activity.dateTime,
          location: activity.location,
        },
        participantCount: participantCount[0]?.count || 0,
        unreadCount,
        userReadStatus: readStatus,
      },
    });
  } catch (error) {
    console.error('Error getting activity chat:', error);
    return c.json({
      success: false,
      error: 'Failed to get activity chat',
    }, 500);
  }
});

// GET /activity-chat/:activityId/messages - Get messages from activity chat
activityChatRouter.get('/:activityId/messages',
  authenticateToken,
  zValidator('query', getMessagesSchema),
  async (c) => {
    try {
      const user = c.get('user');
      const activityId = c.req.param('activityId');
      const options = c.req.valid('query');

      console.log(`💬 Getting messages for activity: ${activityId}`);

      // Verify user is a participant
      const participation = await db.query.activityParticipants.findFirst({
        where: and(
          eq(activityParticipants.activityId, activityId),
          eq(activityParticipants.userId, user.id)
        ),
      });

      if (!participation) {
        return c.json({
          success: false,
          error: 'Access denied. You must be a participant in this activity.',
        }, 403);
      }

      // Get chat room
      const chatRoom = await db.query.activityChatRooms.findFirst({
        where: eq(activityChatRooms.activityId, activityId),
      });

      if (!chatRoom) {
        return c.json({
          success: true,
          data: {
            messages: [],
            pagination: {
              limit: options.limit,
              offset: options.offset,
              hasMore: false,
            },
          },
        });
      }

      // Build messages query
      let messagesQuery = db
        .select({
          messageId: activityChatMessages.id,
          content: activityChatMessages.content,
          messageType: activityChatMessages.messageType,
          metadata: activityChatMessages.metadata,
          senderId: activityChatMessages.senderId,
          senderUsername: users.username,
          senderAvatarUrl: users.avatarUrl,
          createdAt: activityChatMessages.createdAt,
          updatedAt: activityChatMessages.updatedAt,
        })
        .from(activityChatMessages)
        .leftJoin(users, eq(activityChatMessages.senderId, users.id))
        .where(eq(activityChatMessages.roomId, chatRoom.id))
        .orderBy(desc(activityChatMessages.createdAt))
        .limit(options.limit)
        .offset(options.offset);

      // Apply since filter for incremental loading
      if (options.since) {
        const sinceDate = new Date(options.since);
        messagesQuery = messagesQuery.where(
          gte(activityChatMessages.createdAt, sinceDate)
        );
      }

      const messages = await messagesQuery;

      return c.json({
        success: true,
        data: {
          messages: messages.reverse(), // Reverse to show oldest first
          pagination: {
            limit: options.limit,
            offset: options.offset,
            hasMore: messages.length === options.limit,
            since: options.since,
          },
        },
      });
    } catch (error) {
      console.error('Error getting activity chat messages:', error);
      return c.json({
        success: false,
        error: 'Failed to get messages',
      }, 500);
    }
  }
);

// POST /activity-chat/:activityId/messages - Send message to activity chat
activityChatRouter.post('/:activityId/messages',
  authenticateToken,
  zValidator('json', sendMessageSchema),
  async (c) => {
    try {
      const user = c.get('user');
      const activityId = c.req.param('activityId');
      const messageData = c.req.valid('json');

      console.log(`💬 ${user.username} sending message to activity: ${activityId}`);

      // Verify user is a participant
      const participation = await db.query.activityParticipants.findFirst({
        where: and(
          eq(activityParticipants.activityId, activityId),
          eq(activityParticipants.userId, user.id)
        ),
      });

      if (!participation) {
        return c.json({
          success: false,
          error: 'Access denied. You must be a participant in this activity.',
        }, 403);
      }

      // Get or create chat room
      let chatRoom = await db.query.activityChatRooms.findFirst({
        where: eq(activityChatRooms.activityId, activityId),
      });

      if (!chatRoom) {
        // Create chat room if it doesn't exist
        const activity = await db.query.activities.findFirst({
          where: eq(activities.id, activityId),
        });

        if (!activity) {
          return c.json({
            success: false,
            error: 'Activity not found',
          }, 404);
        }

        const [newChatRoom] = await db
          .insert(activityChatRooms)
          .values({
            activityId,
            createdById: activity.creatorId,
            isActive: true,
          })
          .returning();

        chatRoom = newChatRoom;
      }

      // Create the message
      const [newMessage] = await db
        .insert(activityChatMessages)
        .values({
          roomId: chatRoom.id,
          senderId: user.id,
          content: messageData.content,
          messageType: messageData.messageType,
          metadata: messageData.metadata,
        })
        .returning();

      // Update chat room last activity
      await db
        .update(activityChatRooms)
        .set({ updatedAt: new Date() })
        .where(eq(activityChatRooms.id, chatRoom.id));

      // Get sender info for response
      const messageWithSender = {
        ...newMessage,
        senderUsername: user.username,
        senderAvatarUrl: user.avatarUrl,
      };

      // Track the change for real-time updates
      await deltaTrackingService.trackChange({
        entityType: 'activity_chat_message',
        entityId: newMessage.id,
        changeType: 'create',
        newData: newMessage,
        affectedUserId: user.id,
        relatedEntityId: activityId,
        triggeredBy: user.id,
      });

      return c.json({
        success: true,
        data: messageWithSender,
        message: 'Message sent successfully',
      });
    } catch (error) {
      console.error('Error sending activity chat message:', error);
      return c.json({
        success: false,
        error: 'Failed to send message',
      }, 500);
    }
  }
);

// PUT /activity-chat/:activityId/messages/:messageId - Edit message (sender only)
activityChatRouter.put('/:activityId/messages/:messageId',
  authenticateToken,
  zValidator('json', z.object({
    content: z.string().min(1).max(2000),
  })),
  async (c) => {
    try {
      const user = c.get('user');
      const activityId = c.req.param('activityId');
      const messageId = c.req.param('messageId');
      const { content } = c.req.valid('json');

      console.log(`✏️ ${user.username} editing message: ${messageId}`);

      // Verify user is a participant
      const participation = await db.query.activityParticipants.findFirst({
        where: and(
          eq(activityParticipants.activityId, activityId),
          eq(activityParticipants.userId, user.id)
        ),
      });

      if (!participation) {
        return c.json({
          success: false,
          error: 'Access denied. You must be a participant in this activity.',
        }, 403);
      }

      // Get the message
      const message = await db.query.activityChatMessages.findFirst({
        where: eq(activityChatMessages.id, messageId),
      });

      if (!message) {
        return c.json({
          success: false,
          error: 'Message not found',
        }, 404);
      }

      // Check if user is the sender
      if (message.senderId !== user.id) {
        return c.json({
          success: false,
          error: 'Access denied. You can only edit your own messages.',
        }, 403);
      }

      // Check if message is too old to edit (1 hour)
      const messageAge = Date.now() - message.createdAt.getTime();
      const maxEditTime = 60 * 60 * 1000; // 1 hour

      if (messageAge > maxEditTime) {
        return c.json({
          success: false,
          error: 'Message is too old to edit',
        }, 400);
      }

      // Don't allow editing system messages
      if (message.messageType === 'system') {
        return c.json({
          success: false,
          error: 'System messages cannot be edited',
        }, 400);
      }

      // Update the message
      const [updatedMessage] = await db
        .update(activityChatMessages)
        .set({
          content,
          updatedAt: new Date(),
        })
        .where(eq(activityChatMessages.id, messageId))
        .returning();

      // Track the change
      await deltaTrackingService.trackChange({
        entityType: 'activity_chat_message',
        entityId: messageId,
        changeType: 'update',
        previousData: message,
        newData: updatedMessage,
        affectedUserId: user.id,
        relatedEntityId: activityId,
        triggeredBy: user.id,
      });

      return c.json({
        success: true,
        data: updatedMessage,
        message: 'Message updated successfully',
      });
    } catch (error) {
      console.error('Error editing activity chat message:', error);
      return c.json({
        success: false,
        error: 'Failed to edit message',
      }, 500);
    }
  }
);

// DELETE /activity-chat/:activityId/messages/:messageId - Delete message
activityChatRouter.delete('/:activityId/messages/:messageId', authenticateToken, async (c) => {
  try {
    const user = c.get('user');
    const activityId = c.req.param('activityId');
    const messageId = c.req.param('messageId');

    console.log(`🗑️ ${user.username} deleting message: ${messageId}`);

    // Get the message
    const message = await db.query.activityChatMessages.findFirst({
      where: eq(activityChatMessages.id, messageId),
    });

    if (!message) {
      return c.json({
        success: false,
        error: 'Message not found',
      }, 404);
    }

    // Check permissions: sender, activity creator, or admin
    let canDelete = message.senderId === user.id || user.role === 'admin';

    if (!canDelete) {
      // Check if user is activity creator
      const activity = await db.query.activities.findFirst({
        where: eq(activities.id, activityId),
      });
      canDelete = activity?.creatorId === user.id;
    }

    if (!canDelete) {
      return c.json({
        success: false,
        error: 'Access denied. You can only delete your own messages, or you must be the activity creator/admin.',
      }, 403);
    }

    // Delete the message
    await db
      .delete(activityChatMessages)
      .where(eq(activityChatMessages.id, messageId));

    // Track the change
    await deltaTrackingService.trackChange({
      entityType: 'activity_chat_message',
      entityId: messageId,
      changeType: 'delete',
      previousData: message,
      affectedUserId: message.senderId,
      relatedEntityId: activityId,
      triggeredBy: user.id,
    });

    return c.json({
      success: true,
      message: 'Message deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting activity chat message:', error);
    return c.json({
      success: false,
      error: 'Failed to delete message',
    }, 500);
  }
});

// POST /activity-chat/:activityId/read - Mark messages as read
activityChatRouter.post('/:activityId/read',
  authenticateToken,
  zValidator('json', markReadSchema),
  async (c) => {
    try {
      const user = c.get('user');
      const activityId = c.req.param('activityId');
      const { lastReadMessageId } = c.req.valid('json');

      console.log(`👁️ ${user.username} marking messages as read in activity: ${activityId}`);

      // Verify user is a participant
      const participation = await db.query.activityParticipants.findFirst({
        where: and(
          eq(activityParticipants.activityId, activityId),
          eq(activityParticipants.userId, user.id)
        ),
      });

      if (!participation) {
        return c.json({
          success: false,
          error: 'Access denied. You must be a participant in this activity.',
        }, 403);
      }

      // Get chat room
      const chatRoom = await db.query.activityChatRooms.findFirst({
        where: eq(activityChatRooms.activityId, activityId),
      });

      if (!chatRoom) {
        return c.json({
          success: false,
          error: 'Chat room not found',
        }, 404);
      }

      // Verify the message exists and belongs to this room
      const message = await db.query.activityChatMessages.findFirst({
        where: and(
          eq(activityChatMessages.id, lastReadMessageId),
          eq(activityChatMessages.roomId, chatRoom.id)
        ),
      });

      if (!message) {
        return c.json({
          success: false,
          error: 'Message not found in this chat room',
        }, 404);
      }

      // Update or create read status
      const [readStatus] = await db
        .insert(activityChatReadStatus)
        .values({
          roomId: chatRoom.id,
          userId: user.id,
          lastReadMessageId,
          lastReadAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [activityChatReadStatus.roomId, activityChatReadStatus.userId],
          set: {
            lastReadMessageId,
            lastReadAt: new Date(),
          },
        })
        .returning();

      return c.json({
        success: true,
        data: readStatus,
        message: 'Messages marked as read',
      });
    } catch (error) {
      console.error('Error marking messages as read:', error);
      return c.json({
        success: false,
        error: 'Failed to mark messages as read',
      }, 500);
    }
  }
);

// GET /activity-chat/:activityId/participants - Get chat participants
activityChatRouter.get('/:activityId/participants', authenticateToken, async (c) => {
  try {
    const user = c.get('user');
    const activityId = c.req.param('activityId');

    console.log(`👥 Getting chat participants for activity: ${activityId}`);

    // Verify user is a participant
    const participation = await db.query.activityParticipants.findFirst({
      where: and(
        eq(activityParticipants.activityId, activityId),
        eq(activityParticipants.userId, user.id)
      ),
    });

    if (!participation) {
      return c.json({
        success: false,
        error: 'Access denied. You must be a participant in this activity.',
      }, 403);
    }

    // Get all participants
    const participants = await db
      .select({
        userId: activityParticipants.userId,
        username: users.username,
        avatarUrl: users.avatarUrl,
        status: activityParticipants.status,
        team: activityParticipants.team,
        joinedAt: activityParticipants.joinedAt,
      })
      .from(activityParticipants)
      .leftJoin(users, eq(activityParticipants.userId, users.id))
      .where(eq(activityParticipants.activityId, activityId))
      .orderBy(activityParticipants.joinedAt);

    // Get activity creator info
    const activity = await db.query.activities.findFirst({
      where: eq(activities.id, activityId),
    });

    // Get chat room if it exists
    const chatRoom = await db.query.activityChatRooms.findFirst({
      where: eq(activityChatRooms.activityId, activityId),
    });

    // Get recent activity (who sent messages recently)
    let recentActivity = [];
    if (chatRoom) {
      recentActivity = await db
        .select({
          senderId: activityChatMessages.senderId,
          senderUsername: users.username,
          lastMessageAt: sql<Date>`MAX(${activityChatMessages.createdAt})`,
          messageCount: count(activityChatMessages.id),
        })
        .from(activityChatMessages)
        .leftJoin(users, eq(activityChatMessages.senderId, users.id))
        .where(
          and(
            eq(activityChatMessages.roomId, chatRoom.id),
            sql`${activityChatMessages.createdAt} >= NOW() - INTERVAL '24 hours'`
          )
        )
        .groupBy(activityChatMessages.senderId, users.username)
        .orderBy(desc(sql`MAX(${activityChatMessages.createdAt})`));
    }

    return c.json({
      success: true,
      data: {
        participants,
        activity: {
          id: activity?.id,
          creatorId: activity?.creatorId,
        },
        chatRoom: chatRoom ? {
          id: chatRoom.id,
          isActive: chatRoom.isActive,
        } : null,
        recentActivity,
        summary: {
          totalParticipants: participants.length,
          acceptedParticipants: participants.filter(p => p.status === 'accepted').length,
          pendingParticipants: participants.filter(p => p.status === 'pending').length,
        },
      },
    });
  } catch (error) {
    console.error('Error getting chat participants:', error);
    return c.json({
      success: false,
      error: 'Failed to get chat participants',
    }, 500);
  }
});

// POST /activity-chat/:activityId/system-message - Send system message (creator only)
activityChatRouter.post('/:activityId/system-message',
  authenticateToken,
  zValidator('json', z.object({
    content: z.string().min(1).max(500),
    messageType: z.enum(['system', 'announcement']).default('announcement'),
  })),
  async (c) => {
    try {
      const user = c.get('user');
      const activityId = c.req.param('activityId');
      const { content, messageType } = c.req.valid('json');

      console.log(`📢 ${user.username} sending system message to activity: ${activityId}`);

      // Get activity and verify user is creator
      const activity = await db.query.activities.findFirst({
        where: eq(activities.id, activityId),
      });

      if (!activity) {
        return c.json({
          success: false,
          error: 'Activity not found',
        }, 404);
      }

      if (activity.creatorId !== user.id && user.role !== 'admin') {
        return c.json({
          success: false,
          error: 'Access denied. Only activity creator or admin can send system messages.',
        }, 403);
      }

      // Get or create chat room
      let chatRoom = await db.query.activityChatRooms.findFirst({
        where: eq(activityChatRooms.activityId, activityId),
      });

      if (!chatRoom) {
        const [newChatRoom] = await db
          .insert(activityChatRooms)
          .values({
            activityId,
            createdById: activity.creatorId,
            isActive: true,
          })
          .returning();

        chatRoom = newChatRoom;
      }

      // Create system message
      const [systemMessage] = await db
        .insert(activityChatMessages)
        .values({
          roomId: chatRoom.id,
          senderId: user.id,
          content,
          messageType,
          metadata: { isSystemMessage: true },
        })
        .returning();

      // Track the change
      await deltaTrackingService.trackChange({
        entityType: 'activity_chat_message',
        entityId: systemMessage.id,
        changeType: 'create',
        newData: systemMessage,
        affectedUserId: user.id,
        relatedEntityId: activityId,
        triggeredBy: user.id,
      });

      return c.json({
        success: true,
        data: {
          ...systemMessage,
          senderUsername: user.username,
        },
        message: 'System message sent successfully',
      });
    } catch (error) {
      console.error('Error sending system message:', error);
      return c.json({
        success: false,
        error: 'Failed to send system message',
      }, 500);
    }
  }
);