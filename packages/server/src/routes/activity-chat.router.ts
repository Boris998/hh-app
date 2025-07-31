// src/routes/activity-chat.router.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { 
  activityChatRooms, 
  activityChatMessages, 
  activityChatReadStatus,
  activityParticipants,
  activities,
  users
} from '../db/schema.js';
import { authenticateToken } from '../middleware/auth.js';

export const activityChatRouter = new Hono();

// Get chat room for activity
activityChatRouter.get('/:activityId/chat', authenticateToken, async (c) => {
  try {
    const activityId = c.req.param('activityId');
    const user = c.get('user');

    // Verify user is participant
    const participation = await db
      .select()
      .from(activityParticipants)
      .where(
        and(
          eq(activityParticipants.activityId, activityId),
          eq(activityParticipants.userId, user.id),
          eq(activityParticipants.status, 'accepted')
        )
      )
      .limit(1);

    if (participation.length === 0) {
      return c.json({ error: 'Not authorized to access this chat' }, 403);
    }

    // Get chat room
    const chatRoom = await db
      .select({
        chatRoom: activityChatRooms,
        activity: {
          id: activities.id,
          description: activities.description,
          dateTime: activities.dateTime,
          completionStatus: activities.completionStatus,
        },
      })
      .from(activityChatRooms)
      .leftJoin(activities, eq(activityChatRooms.activityId, activities.id))
      .where(
        and(
          eq(activityChatRooms.activityId, activityId),
          isNull(activityChatRooms.deletedAt)
        )
      )
      .limit(1);

    if (chatRoom.length === 0) {
      return c.json({ error: 'Chat room not found' }, 404);
    }

    // Get unread count
    const readStatus = await db
      .select()
      .from(activityChatReadStatus)
      .where(
        and(
          eq(activityChatReadStatus.userId, user.id),
          eq(activityChatReadStatus.chatRoomId, chatRoom[0].chatRoom.id)
        )
      )
      .limit(1);

    return c.json({
      status: 'success',
      data: {
        chatRoom: chatRoom[0].chatRoom,
        activity: chatRoom[0].activity,
        unreadCount: readStatus[0]?.unreadCount || 0,
      },
    });
  } catch (error) {
    console.error('Error fetching chat room:', error);
    return c.json({ error: 'Failed to fetch chat room' }, 500);
  }
});

// Get messages for chat room
activityChatRouter.get('/:activityId/chat/messages', authenticateToken, async (c) => {
  try {
    const activityId = c.req.param('activityId');
    const user = c.get('user');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    // Verify user is participant
    const participation = await db
      .select()
      .from(activityParticipants)
      .where(
        and(
          eq(activityParticipants.activityId, activityId),
          eq(activityParticipants.userId, user.id),
          eq(activityParticipants.status, 'accepted')
        )
      )
      .limit(1);

    if (participation.length === 0) {
      return c.json({ error: 'Not authorized to access this chat' }, 403);
    }

    // Get chat room
    const chatRoom = await db
      .select()
      .from(activityChatRooms)
      .where(
        and(
          eq(activityChatRooms.activityId, activityId),
          isNull(activityChatRooms.deletedAt)
        )
      )
      .limit(1);

    if (chatRoom.length === 0) {
      return c.json({ error: 'Chat room not found' }, 404);
    }

    // Get messages
    const messages = await db
      .select({
        message: activityChatMessages,
        sender: {
          id: users.id,
          username: users.username,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(activityChatMessages)
      .leftJoin(users, eq(activityChatMessages.senderId, users.id))
      .where(
        and(
          eq(activityChatMessages.chatRoomId, chatRoom[0].id),
          isNull(activityChatMessages.deletedAt)
        )
      )
      .orderBy(desc(activityChatMessages.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({
      status: 'success',
      data: {
        messages: messages.map(m => ({
          ...m.message,
          sender: m.sender,
          isOwnMessage: m.message.senderId === user.id,
        })),
        total: messages.length,
      },
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return c.json({ error: 'Failed to fetch messages' }, 500);
  }
});

// Send message
const sendMessageSchema = z.object({
  content: z.string().min(1, 'Message content required').max(500, 'Message too long'),
  messageType: z.enum(['text', 'system', 'image', 'file']).default('text'),
});

activityChatRouter.post(
  '/:activityId/chat/messages',
  authenticateToken,
  zValidator('json', sendMessageSchema),
  async (c) => {
    try {
      const activityId = c.req.param('activityId');
      const user = c.get('user');
      const { content, messageType } = c.req.valid('json');

      // Verify user is participant
      const participation = await db
        .select()
        .from(activityParticipants)
        .where(
          and(
            eq(activityParticipants.activityId, activityId),
            eq(activityParticipants.userId, user.id),
            eq(activityParticipants.status, 'accepted')
          )
        )
        .limit(1);

      if (participation.length === 0) {
        return c.json({ error: 'Not authorized to send messages' }, 403);
      }

      // Get chat room
      const chatRoom = await db
        .select()
        .from(activityChatRooms)
        .where(
          and(
            eq(activityChatRooms.activityId, activityId),
            eq(activityChatRooms.isActive, true),
            isNull(activityChatRooms.deletedAt)
          )
        )
        .limit(1);

      if (chatRoom.length === 0) {
        return c.json({ error: 'Chat room not found or inactive' }, 404);
      }

      // Send message
      const [newMessage] = await db
        .insert(activityChatMessages)
        .values({
          chatRoomId: chatRoom[0].id,
          senderId: user.id,
          content,
          messageType,
        })
        .returning();

      // Get sender info for response
      const [sender] = await db
        .select({
          id: users.id,
          username: users.username,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      return c.json({
        status: 'success',
        data: {
          message: {
            ...newMessage,
            sender,
            isOwnMessage: true,
          },
        },
        message: 'Message sent successfully',
      }, 201);
    } catch (error) {
      console.error('Error sending message:', error);
      return c.json({ error: 'Failed to send message' }, 500);
    }
  }
);

// Mark messages as read
activityChatRouter.post('/:activityId/chat/mark-read', authenticateToken, async (c) => {
  try {
    const activityId = c.req.param('activityId');
    const user = c.get('user');

    // Get chat room
    const chatRoom = await db
      .select()
      .from(activityChatRooms)
      .where(
        and(
          eq(activityChatRooms.activityId, activityId),
          isNull(activityChatRooms.deletedAt)
        )
      )
      .limit(1);

    if (chatRoom.length === 0) {
      return c.json({ error: 'Chat room not found' }, 404);
    }

    // Get latest message ID
    const latestMessage = await db
      .select({ id: activityChatMessages.id })
      .from(activityChatMessages)
      .where(
        and(
          eq(activityChatMessages.chatRoomId, chatRoom[0].id),
          isNull(activityChatMessages.deletedAt)
        )
      )
      .orderBy(desc(activityChatMessages.createdAt))
      .limit(1);

    // Update read status
    await db
      .update(activityChatReadStatus)
      .set({
        lastReadMessageId: latestMessage[0]?.id,
        unreadCount: 0,
        lastReadAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(activityChatReadStatus.userId, user.id),
          eq(activityChatReadStatus.chatRoomId, chatRoom[0].id)
        )
      );

    return c.json({
      status: 'success',
      message: 'Messages marked as read',
    });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    return c.json({ error: 'Failed to mark messages as read' }, 500);
  }
});