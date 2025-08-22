// src/routes/messaging.router.ts - Complete implementation with service integration

import { zValidator } from '@hono/zod-validator';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/client.js';
import {
  chatRooms,
  messages,
  roomMembers,
  users,
} from '../db/schema.js';
import {
  updateChatRoomSchema
} from '../db/zod.schema.js';
import { authenticateToken } from '../middleware/auth.js';
import { deltaTrackingService } from '../services/delta-tracking.service.js';

export const messagingRouter = new Hono();

// Validation schemas
const createRoomSchema = z.object({
  name: z.string().min(1, 'Room name is required').max(100, 'Room name too long'),
  description: z.string().max(1000, 'Description too long').optional(),
  isPrivate: z.boolean().default(false),
  initialMembers: z.array(z.string().uuid()).optional().default([]),
});

const sendMessageSchema = z.object({
  content: z.string().min(1, 'Message content is required').max(5000, 'Message too long'),
  messageType: z.string().max(50).default('text'),
  metadata: z.record(z.any()).optional(),
});

const getRoomsSchema = z.object({
  includeMembers: z.boolean().default(false),
  includeLastMessage: z.boolean().default(true),
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).default(0),
});

const getMessagesSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  before: z.string().optional(), // Message ID to paginate before
  after: z.string().optional(), // Message ID to paginate after
});

const addMemberSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  isAdmin: z.boolean().default(false),
});

// POST /messaging/rooms - Create a new chat room
messagingRouter.post('/rooms',
  authenticateToken,
  zValidator('json', createRoomSchema),
  async (c) => {
    try {
      const user = c.get('user');
      const roomData = c.req.valid('json');

      console.log(`💬 ${user.username} creating chat room: ${roomData.name}`);

      // Create the chat room
      const [newRoom] = await db
        .insert(chatRooms)
        .values({
          name: roomData.name,
          description: roomData.description,
          isPrivate: roomData.isPrivate,
          createdById: user.id,
        })
        .returning();

      // Add creator as admin member
      await db
        .insert(roomMembers)
        .values({
          roomId: newRoom.id,
          userId: user.id,
          isAdmin: true,
        });

      // Add initial members if provided
      if (roomData.initialMembers && roomData.initialMembers.length > 0) {
        const memberValues = roomData.initialMembers
          .filter(memberId => memberId !== user.id) // Don't duplicate creator
          .map(memberId => ({
            roomId: newRoom.id,
            userId: memberId,
            isAdmin: false,
          }));

        if (memberValues.length > 0) {
          await db.insert(roomMembers).values(memberValues);
        }
      }

      // Track the change
      await deltaTrackingService.trackChange({
        entityType: 'chat_room',
        entityId: newRoom.id,
        changeType: 'create',
        newData: newRoom,
        affectedUserId: user.id,
        triggeredBy: user.id,
      });

      return c.json({
        success: true,
        data: newRoom,
        message: `Chat room "${newRoom.name}" created successfully`,
      });
    } catch (error) {
      console.error('Error creating chat room:', error);
      return c.json({
        success: false,
        error: 'Failed to create chat room',
      }, 500);
    }
  }
);

// GET /messaging/rooms - Get user's chat rooms
messagingRouter.get('/rooms',
  authenticateToken,
  zValidator('query', getRoomsSchema),
  async (c) => {
    try {
      const user = c.get('user');
      const options = c.req.valid('query');

      console.log(`💬 Getting chat rooms for ${user.username}`);

      // Get rooms where user is a member
      let roomsQuery = db
        .select({
          roomId: chatRooms.id,
          publicId: chatRooms.publicId,
          name: chatRooms.name,
          description: chatRooms.description,
          isPrivate: chatRooms.isPrivate,
          createdById: chatRooms.createdById,
          createdAt: chatRooms.createdAt,
          userIsAdmin: roomMembers.isAdmin,
          joinedAt: roomMembers.joinedAt,
        })
        .from(roomMembers)
        .leftJoin(chatRooms, eq(roomMembers.roomId, chatRooms.id))
        .where(eq(roomMembers.userId, user.id))
        .orderBy(desc(chatRooms.updatedAt))
        .limit(options.limit)
        .offset(options.offset);

      const userRooms = await roomsQuery;

      // Enhance with additional data if requested
      const enhancedRooms = await Promise.all(
        userRooms.map(async (room) => {
          const enhanced: any = { ...room };

          // Add member count and members if requested
          if (options.includeMembers) {
            const members = await db
              .select({
                userId: roomMembers.userId,
                username: users.username,
                avatarUrl: users.avatarUrl,
                isAdmin: roomMembers.isAdmin,
                joinedAt: roomMembers.joinedAt,
              })
              .from(roomMembers)
              .leftJoin(users, eq(roomMembers.userId, users.id))
              .where(eq(roomMembers.roomId, room.roomId))
              .orderBy(asc(roomMembers.joinedAt));

            enhanced.members = members;
            enhanced.memberCount = members.length;
          } else {
            const memberCount = await db
              .select({ count: count(roomMembers.userId) })
              .from(roomMembers)
              .where(eq(roomMembers.roomId, room.roomId));

            enhanced.memberCount = memberCount[0]?.count || 0;
          }

          // Add last message if requested
          if (options.includeLastMessage) {
            const lastMessage = await db
              .select({
                messageId: messages.id,
                content: messages.content,
                messageType: messages.messageType,
                senderUsername: users.username,
                createdAt: messages.createdAt,
              })
              .from(messages)
              .leftJoin(users, eq(messages.senderId, users.id))
              .where(eq(messages.roomId, room.roomId))
              .orderBy(desc(messages.createdAt))
              .limit(1);

            enhanced.lastMessage = lastMessage[0] || null;
          }

          return enhanced;
        })
      );

      return c.json({
        success: true,
        data: {
          rooms: enhancedRooms,
          pagination: {
            limit: options.limit,
            offset: options.offset,
            hasMore: enhancedRooms.length === options.limit,
          },
        },
      });
    } catch (error) {
      console.error('Error getting chat rooms:', error);
      return c.json({
        success: false,
        error: 'Failed to get chat rooms',
      }, 500);
    }
  }
);

// GET /messaging/rooms/:roomId - Get specific chat room details
messagingRouter.get('/rooms/:roomId', authenticateToken, async (c) => {
  try {
    const user = c.get('user');
    const roomId = c.req.param('roomId');

    console.log(`💬 Getting chat room details: ${roomId}`);

    // Verify user is a member of the room
    const membership = await db.query.roomMembers.findFirst({
      where: and(
        eq(roomMembers.roomId, roomId),
        eq(roomMembers.userId, user.id)
      ),
    });

    if (!membership) {
      return c.json({
        success: false,
        error: 'Access denied. You are not a member of this room.',
      }, 403);
    }

    // Get room details
    const room = await db.query.chatRooms.findFirst({
      where: eq(chatRooms.id, roomId),
    });

    if (!room) {
      return c.json({
        success: false,
        error: 'Chat room not found',
      }, 404);
    }

    // Get all members
    const members = await db
      .select({
        userId: roomMembers.userId,
        username: users.username,
        avatarUrl: users.avatarUrl,
        isAdmin: roomMembers.isAdmin,
        joinedAt: roomMembers.joinedAt,
      })
      .from(roomMembers)
      .leftJoin(users, eq(roomMembers.userId, users.id))
      .where(eq(roomMembers.roomId, roomId))
      .orderBy(asc(roomMembers.joinedAt));

    // Get room statistics
    const stats = await db
      .select({
        totalMessages: count(messages.id),
        lastActivity: sql<Date>`MAX(${messages.createdAt})`,
      })
      .from(messages)
      .where(eq(messages.roomId, roomId));

    return c.json({
      success: true,
      data: {
        ...room,
        members,
        memberCount: members.length,
        userMembership: membership,
        statistics: stats[0],
      },
    });
  } catch (error) {
    console.error('Error getting chat room:', error);
    return c.json({
      success: false,
      error: 'Failed to get chat room',
    }, 500);
  }
});

// PUT /messaging/rooms/:roomId - Update chat room (admin only)
messagingRouter.put('/rooms/:roomId',
  authenticateToken,
  zValidator('json', updateChatRoomSchema),
  async (c) => {
    try {
      const user = c.get('user');
      const roomId = c.req.param('roomId');
      const updateData = c.req.valid('json');

      console.log(`✏️ ${user.username} updating chat room: ${roomId}`);

      // Verify user is an admin of the room
      const membership = await db.query.roomMembers.findFirst({
        where: and(
          eq(roomMembers.roomId, roomId),
          eq(roomMembers.userId, user.id),
          eq(roomMembers.isAdmin, true)
        ),
      });

      if (!membership) {
        return c.json({
          success: false,
          error: 'Access denied. Only room admins can update room settings.',
        }, 403);
      }

      // Update the room
      const [updatedRoom] = await db
        .update(chatRooms)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(chatRooms.id, roomId))
        .returning();

      // Track the change
      await deltaTrackingService.trackChange({
        entityType: 'chat_room',
        entityId: roomId,
        changeType: 'update',
        newData: updatedRoom,
        affectedUserId: user.id,
        triggeredBy: user.id,
      });

      return c.json({
        success: true,
        data: updatedRoom,
        message: 'Chat room updated successfully',
      });
    } catch (error) {
      console.error('Error updating chat room:', error);
      return c.json({
        success: false,
        error: 'Failed to update chat room',
      }, 500);
    }
  }
);

// DELETE /messaging/rooms/:roomId - Delete chat room (admin only)
messagingRouter.delete('/rooms/:roomId', authenticateToken, async (c) => {
  try {
    const user = c.get('user');
    const roomId = c.req.param('roomId');

    console.log(`🗑️ ${user.username} deleting chat room: ${roomId}`);

    // Verify user is an admin of the room or the creator
    const room = await db.query.chatRooms.findFirst({
      where: eq(chatRooms.id, roomId),
    });

    if (!room) {
      return c.json({
        success: false,
        error: 'Chat room not found',
      }, 404);
    }

    const membership = await db.query.roomMembers.findFirst({
      where: and(
        eq(roomMembers.roomId, roomId),
        eq(roomMembers.userId, user.id),
        eq(roomMembers.isAdmin, true)
      ),
    });

    if (!membership && room.createdById !== user.id) {
      return c.json({
        success: false,
        error: 'Access denied. Only room admins or creator can delete the room.',
      }, 403);
    }

    // Delete the room (cascade will handle messages and members)
    await db
      .delete(chatRooms)
      .where(eq(chatRooms.id, roomId));

    // Track the change
    await deltaTrackingService.trackChange({
      entityType: 'chat_room',
      entityId: roomId,
      changeType: 'delete',
      oldData: room,
      affectedUserId: user.id,
      triggeredBy: user.id,
    });

    return c.json({
      success: true,
      message: `Chat room "${room.name}" deleted successfully`,
    });
  } catch (error) {
    console.error('Error deleting chat room:', error);
    return c.json({
      success: false,
      error: 'Failed to delete chat room',
    }, 500);
  }
});

// POST /messaging/rooms/:roomId/messages - Send message to room
messagingRouter.post('/rooms/:roomId/messages',
  authenticateToken,
  zValidator('json', sendMessageSchema),
  async (c) => {
    try {
      const user = c.get('user');
      const roomId = c.req.param('roomId');
      const messageData = c.req.valid('json');

      console.log(`💬 ${user.username} sending message to room: ${roomId}`);

      // Verify user is a member of the room
      const membership = await db.query.roomMembers.findFirst({
        where: and(
          eq(roomMembers.roomId, roomId),
          eq(roomMembers.userId, user.id)
        ),
      });

      if (!membership) {
        return c.json({
          success: false,
          error: 'Access denied. You are not a member of this room.',
        }, 403);
      }

      // Create the message
      const [newMessage] = await db
        .insert(messages)
        .values({
          roomId,
          senderId: user.id,
          content: messageData.content,
          messageType: messageData.messageType,
          metadata: messageData.metadata,
        })
        .returning();

      // Update room's last activity
      await db
        .update(chatRooms)
        .set({ updatedAt: new Date() })
        .where(eq(chatRooms.id, roomId));

      // Get sender info for response
      const messageWithSender = {
        ...newMessage,
        senderUsername: user.username,
        senderAvatarUrl: user.avatarUrl,
      };

      // Track the change
      await deltaTrackingService.trackChange({
        entityType: 'message',
        entityId: newMessage.id,
        changeType: 'create',
        newData: newMessage,
        affectedUserId: user.id,
        relatedEntityId: roomId,
        triggeredBy: user.id,
      });

      return c.json({
        success: true,
        data: messageWithSender,
        message: 'Message sent successfully',
      });
    } catch (error) {
      console.error('Error sending message:', error);
      return c.json({
        success: false,
        error: 'Failed to send message',
      }, 500);
    }
  }
);

// GET /messaging/rooms/:roomId/messages - Get messages from room
messagingRouter.get('/rooms/:roomId/messages',
  authenticateToken,
  zValidator('query', getMessagesSchema),
  async (c) => {
    try {
      const user = c.get('user');
      const roomId = c.req.param('roomId');
      const options = c.req.valid('query');

      console.log(`💬 Getting messages for room: ${roomId}`);

      // Verify user is a member of the room
      const membership = await db.query.roomMembers.findFirst({
        where: and(
          eq(roomMembers.roomId, roomId),
          eq(roomMembers.userId, user.id)
        ),
      });

      if (!membership) {
        return c.json({
          success: false,
          error: 'Access denied. You are not a member of this room.',
        }, 403);
      }

      // Build messages query
      let messagesQuery = db
        .select({
          messageId: messages.id,
          publicId: messages.publicId,
          content: messages.content,
          messageType: messages.messageType,
          metadata: messages.metadata,
          senderId: messages.senderId,
          senderUsername: users.username,
          senderAvatarUrl: users.avatarUrl,
          createdAt: messages.createdAt,
          updatedAt: messages.updatedAt,
        })
        .from(messages)
        .leftJoin(users, eq(messages.senderId, users.id))
        .where(eq(messages.roomId, roomId))
        .orderBy(desc(messages.createdAt))
        .limit(options.limit)
        .offset(options.offset);

      // Apply cursor-based pagination if specified
      if (options.before) {
        const beforeMessage = await db.query.messages.findFirst({
          where: eq(messages.id, options.before),
        });
        if (beforeMessage) {
          messagesQuery = messagesQuery.where(
            sql`${messages.createdAt} < ${beforeMessage.createdAt}`
          );
        }
      }

      if (options.after) {
        const afterMessage = await db.query.messages.findFirst({
          where: eq(messages.id, options.after),
        });
        if (afterMessage) {
          messagesQuery = messagesQuery.where(
            sql`${messages.createdAt} > ${afterMessage.createdAt}`
          );
        }
      }

      const roomMessages = await messagesQuery;

      return c.json({
        success: true,
        data: {
          messages: roomMessages.reverse(), // Reverse to show oldest first
          pagination: {
            limit: options.limit,
            offset: options.offset,
            hasMore: roomMessages.length === options.limit,
            before: options.before,
            after: options.after,
          },
        },
      });
    } catch (error) {
      console.error('Error getting messages:', error);
      return c.json({
        success: false,
        error: 'Failed to get messages',
      }, 500);
    }
  }
);

// PUT /messaging/messages/:messageId - Edit message (sender only)
messagingRouter.put('/messages/:messageId',
  authenticateToken,
  zValidator('json', z.object({
    content: z.string().min(1).max(5000),
  })),
  async (c) => {
    try {
      const user = c.get('user');
      const messageId = c.req.param('messageId');
      const { content } = c.req.valid('json');

      console.log(`✏️ ${user.username} editing message: ${messageId}`);

      // Get the message
      const message = await db.query.messages.findFirst({
        where: eq(messages.id, messageId),
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

      // Check if message is too old to edit (e.g., 24 hours)
      const messageAge = Date.now() - message.createdAt.getTime();
      const maxEditTime = 24 * 60 * 60 * 1000; // 24 hours

      if (messageAge > maxEditTime) {
        return c.json({
          success: false,
          error: 'Message is too old to edit',
        }, 400);
      }

      // Update the message
      const [updatedMessage] = await db
        .update(messages)
        .set({
          content,
          updatedAt: new Date(),
        })
        .where(eq(messages.id, messageId))
        .returning();

      // Track the change
      await deltaTrackingService.trackChange({
        entityType: 'message',
        entityId: messageId,
        changeType: 'update',
        oldData: message,
        newData: updatedMessage,
        affectedUserId: user.id,
        triggeredBy: user.id,
      });

      return c.json({
        success: true,
        data: updatedMessage,
        message: 'Message updated successfully',
      });
    } catch (error) {
      console.error('Error editing message:', error);
      return c.json({
        success: false,
        error: 'Failed to edit message',
      }, 500);
    }
  }
);

// DELETE /messaging/messages/:messageId - Delete message (sender or admin)
messagingRouter.delete('/messages/:messageId', authenticateToken, async (c) => {
  try {
    const user = c.get('user');
    const messageId = c.req.param('messageId');

    console.log(`🗑️ ${user.username} deleting message: ${messageId}`);

    // Get the message
    const message = await db.query.messages.findFirst({
      where: eq(messages.id, messageId),
    });

    if (!message) {
      return c.json({
        success: false,
        error: 'Message not found',
      }, 404);
    }

    // Check if user can delete (sender, room admin, or global admin)
    let canDelete = message.senderId === user.id || user.role === 'admin';

    if (!canDelete) {
      // Check if user is room admin
      const membership = await db.query.roomMembers.findFirst({
        where: and(
          eq(roomMembers.roomId, message.roomId),
          eq(roomMembers.userId, user.id),
          eq(roomMembers.isAdmin, true)
        ),
      });
      canDelete = !!membership;
    }

    if (!canDelete) {
      return c.json({
        success: false,
        error: 'Access denied. You can only delete your own messages or you must be a room admin.',
      }, 403);
    }

    // Delete the message
    await db
      .delete(messages)
      .where(eq(messages.id, messageId));

    // Track the change
    await deltaTrackingService.trackChange({
      entityType: 'message',
      entityId: messageId,
      changeType: 'delete',
      oldData: message,
      affectedUserId: message.senderId,
      triggeredBy: user.id,
    });

    return c.json({
      success: true,
      message: 'Message deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting message:', error);
    return c.json({
      success: false,
      error: 'Failed to delete message',
    }, 500);
  }
});

// POST /messaging/rooms/:roomId/members - Add member to room (admin only)
messagingRouter.post('/rooms/:roomId/members',
  authenticateToken,
  zValidator('json', addMemberSchema),
  async (c) => {
    try {
      const user = c.get('user');
      const roomId = c.req.param('roomId');
      const { userId: newMemberId, isAdmin } = c.req.valid('json');

      console.log(`➕ ${user.username} adding member to room: ${roomId}`);

      // Verify user is an admin of the room
      const membership = await db.query.roomMembers.findFirst({
        where: and(
          eq(roomMembers.roomId, roomId),
          eq(roomMembers.userId, user.id),
          eq(roomMembers.isAdmin, true)
        ),
      });

      if (!membership) {
        return c.json({
          success: false,
          error: 'Access denied. Only room admins can add members.',
        }, 403);
      }

      // Check if user is already a member
      const existingMembership = await db.query.roomMembers.findFirst({
        where: and(
          eq(roomMembers.roomId, roomId),
          eq(roomMembers.userId, newMemberId)
        ),
      });

      if (existingMembership) {
        return c.json({
          success: false,
          error: 'User is already a member of this room',
        }, 400);
      }

      // Verify the user to be added exists
      const targetUser = await db.query.users.findFirst({
        where: eq(users.id, newMemberId),
      });

      if (!targetUser) {
        return c.json({
          success: false,
          error: 'User not found',
        }, 404);
      }

      // Add the member
      const [newMembership] = await db
        .insert(roomMembers)
        .values({
          roomId,
          userId: newMemberId,
          isAdmin,
        })
        .returning();

      // Track the change
      await deltaTrackingService.trackChange({
        entityType: 'room_member',
        entityId: newMembership.id,
        changeType: 'create',
        newData: newMembership,
        affectedUserId: newMemberId,
        relatedEntityId: roomId,
        triggeredBy: user.id,
      });

      return c.json({
        success: true,
        data: {
          ...newMembership,
          username: targetUser.username,
          avatarUrl: targetUser.avatarUrl,
        },
        message: `${targetUser.username} added to room successfully`,
      });
    } catch (error) {
      console.error('Error adding room member:', error);
      return c.json({
        success: false,
        error: 'Failed to add member to room',
      }, 500);
    }
  }
);

// DELETE /messaging/rooms/:roomId/members/:userId - Remove member from room
messagingRouter.delete('/rooms/:roomId/members/:userId', authenticateToken, async (c) => {
  try {
    const user = c.get('user');
    const roomId = c.req.param('roomId');
    const targetUserId = c.req.param('userId');

    console.log(`❌ ${user.username} removing member from room: ${roomId}`);

    // Get the membership to be removed
    const targetMembership = await db.query.roomMembers.findFirst({
      where: and(
        eq(roomMembers.roomId, roomId),
        eq(roomMembers.userId, targetUserId)
      ),
    });

    if (!targetMembership) {
      return c.json({
        success: false,
        error: 'User is not a member of this room',
      }, 404);
    }

    // Check permissions: users can remove themselves, admins can remove others
    const canRemove = targetUserId === user.id; // Self-removal (leaving)
    
    if (!canRemove) {
      // Check if current user is admin
      const userMembership = await db.query.roomMembers.findFirst({
        where: and(
          eq(roomMembers.roomId, roomId),
          eq(roomMembers.userId, user.id),
          eq(roomMembers.isAdmin, true)
        ),
      });

      if (!userMembership && user.role !== 'admin') {
        return c.json({
          success: false,
          error: 'Access denied. Only room admins can remove other members.',
        }, 403);
      }
    }

    // Remove the member
    await db
      .delete(roomMembers)
      .where(eq(roomMembers.id, targetMembership.id));

    // Track the change
    await deltaTrackingService.trackChange({
      entityType: 'room_member',
      entityId: targetMembership.id,
      changeType: 'delete',
      oldData: targetMembership,
      affectedUserId: targetUserId,
      relatedEntityId: roomId,
      triggeredBy: user.id,
    });

    const action = targetUserId === user.id ? 'left the room' : 'was removed from the room';
    
    return c.json({
      success: true,
      message: `Member ${action} successfully`,
    });
  } catch (error) {
    console.error('Error removing room member:', error);
    return c.json({
      success: false,
      error: 'Failed to remove member from room',
    }, 500);
  }
});