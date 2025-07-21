// packages/server/src/routes/messaging.router.ts
import { Hono } from 'hono';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { chatRooms, roomMembers, messages, users } from '../db/schema.js';
import { 
  insertChatRoomSchema, 
  updateChatRoomSchema, 
  insertMessageSchema,
  insertRoomMemberSchema,
  type CreateChatRoomRequest,
  type UpdateChatRoomRequest,
  type CreateMessageRequest,
  type JoinRoomRequest
} from '../db/messaging-schema.js';
import { validateRequest } from '../middleware/validate-request.js';
import { authenticateToken } from '../middleware/auth.js';
import type { User } from '../middleware/auth.js';

export const messagingRouter = new Hono();

// Chat Room Routes

// Get all chat rooms for a user
messagingRouter.get('/rooms', authenticateToken, async (c) => {
  try {
    // use interface or type instead of {id: number}
    const userId = (c.get('user') as User).id;
    
    const userRooms = await db
      .select({
        room: chatRooms,
        membership: roomMembers,
      })
      .from(chatRooms)
      .innerJoin(roomMembers, eq(chatRooms.id, roomMembers.roomId))
      .where(eq(roomMembers.userId, userId))
      .orderBy(desc(chatRooms.updatedAt));

    return c.json(userRooms);
  } catch (error) {
    return c.json({ error: 'Failed to fetch chat rooms' }, 500);
  }
});

// Get chat room by ID
messagingRouter.get('/rooms/:publicId', authenticateToken, async (c) => {
  try {
    const publicId = c.req.param('publicId');
    const userId = (c.get('user') as User).id;

    // Check if user is a member of this room
    const roomMembership = await db
      .select({
        room: chatRooms,
        membership: roomMembers,
      })
      .from(chatRooms)
      .innerJoin(roomMembers, eq(chatRooms.id, roomMembers.roomId))
      .where(
        and(
          eq(chatRooms.publicId, publicId),
          eq(roomMembers.userId, userId)
        )
      )
      .limit(1);

    if (roomMembership.length === 0) {
      return c.json({ error: 'Chat room not found or access denied' }, 404);
    }

    return c.json(roomMembership[0]);
  } catch (error) {
    return c.json({ error: 'Failed to fetch chat room' }, 500);
  }
});

// Create chat room
messagingRouter.post(
  '/rooms',
  authenticateToken,
  validateRequest(insertChatRoomSchema),
  async (c) => {
    try {
      const roomData: CreateChatRoomRequest = await c.req.json();
      const userId = (c.get('user') as User).id;
      
      // Create the chat room
      const [newRoom] = await db
        .insert(chatRooms)
        .values({
          ...roomData,
          createdById: userId,
        })
        .returning();

      // Add creator as admin member
      await db.insert(roomMembers).values({
        roomId: newRoom.id,
        userId: userId,
        isAdmin: true,
      });

      return c.json(newRoom, 201);
    } catch (error) {
      return c.json({ error: 'Failed to create chat room' }, 500);
    }
  }
);

// Update chat room
messagingRouter.put(
  '/rooms/:publicId',
  authenticateToken,
  validateRequest(updateChatRoomSchema),
  async (c) => {
    try {
      const publicId = c.req.param('publicId');
      const updateData: UpdateChatRoomRequest = await c.req.json();
      const userId = (c.get('user') as User).id;

      // Check if user is admin of this room
      const adminCheck = await db
        .select()
        .from(chatRooms)
        .innerJoin(roomMembers, eq(chatRooms.id, roomMembers.roomId))
        .where(
          and(
            eq(chatRooms.publicId, publicId),
            eq(roomMembers.userId, userId),
            eq(roomMembers.isAdmin, true)
          )
        )
        .limit(1);

      if (adminCheck.length === 0) {
        return c.json({ error: 'Not authorized to update this room' }, 403);
      }

      const [updatedRoom] = await db
        .update(chatRooms)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(chatRooms.publicId, publicId))
        .returning();

      return c.json(updatedRoom);
    } catch (error) {
      return c.json({ error: 'Failed to update chat room' }, 500);
    }
  }
);

// Join chat room
messagingRouter.post(
  '/rooms/:publicId/join',
  authenticateToken,
  async (c) => {
    try {
      const publicId = c.req.param('publicId');
      const userId = (c.get('user') as User).id;

      // Get room details
      const room = await db
        .select()
        .from(chatRooms)
        .where(eq(chatRooms.publicId, publicId))
        .limit(1);

      if (room.length === 0) {
        return c.json({ error: 'Chat room not found' }, 404);
      }

      // Check if user is already a member
      const existingMembership = await db
        .select()
        .from(roomMembers)
        .where(
          and(
            eq(roomMembers.roomId, room[0].id),
            eq(roomMembers.userId, userId)
          )
        )
        .limit(1);

      if (existingMembership.length > 0) {
        return c.json({ error: 'Already a member of this room' }, 400);
      }

      // Add user to room
      const [newMembership] = await db
        .insert(roomMembers)
        .values({
          roomId: room[0].id,
          userId: userId,
          isAdmin: false,
        })
        .returning();

      return c.json(newMembership, 201);
    } catch (error) {
      return c.json({ error: 'Failed to join chat room' }, 500);
    }
  }
);

// Message Routes

// Get messages for a room
messagingRouter.get('/rooms/:publicId/messages', authenticateToken, async (c) => {
  try {
    const publicId = c.req.param('publicId');
    const userId = (c.get('user') as User).id;
    const limit = Number(c.req.query('limit') || '50');
    const offset = Number(c.req.query('offset') || '0');

    // Check if user is a member of this room
    const roomMembership = await db
      .select({ roomId: chatRooms.id })
      .from(chatRooms)
      .innerJoin(roomMembers, eq(chatRooms.id, roomMembers.roomId))
      .where(
        and(
          eq(chatRooms.publicId, publicId),
          eq(roomMembers.userId, userId)
        )
      )
      .limit(1);

    if (roomMembership.length === 0) {
      return c.json({ error: 'Not authorized to view messages' }, 403);
    }

    const roomMessages = await db
      .select({
        message: messages,
        sender: {
          publicId: users.publicId,
          firstName: users.firstName,
          lastName: users.lastName,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.roomId, roomMembership[0].roomId))
      .orderBy(desc(messages.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json(roomMessages);
  } catch (error) {
    return c.json({ error: 'Failed to fetch messages' }, 500);
  }
});

// Send message
messagingRouter.post(
  '/rooms/:publicId/messages',
  authenticateToken,
  validateRequest(insertMessageSchema),
  async (c) => {
    try {
      const publicId = c.req.param('publicId');
      const messageData: CreateMessageRequest = await c.req.json();
      const userId = (c.get('user') as User).id;

      // Check if user is a member of this room
      const roomMembership = await db
        .select({ roomId: chatRooms.id })
        .from(chatRooms)
        .innerJoin(roomMembers, eq(chatRooms.id, roomMembers.roomId))
        .where(
          and(
            eq(chatRooms.publicId, publicId),
            eq(roomMembers.userId, userId)
          )
        )
        .limit(1);

      if (roomMembership.length === 0) {
        return c.json({ error: 'Not authorized to send messages' }, 403);
      }

      const [newMessage] = await db
        .insert(messages)
        .values({
          ...messageData,
          roomId: roomMembership[0].roomId,
          senderId: userId,
        })
        .returning();

      // Update room's updatedAt timestamp
      await db
        .update(chatRooms)
        .set({ updatedAt: new Date() })
        .where(eq(chatRooms.id, roomMembership[0].roomId));

      return c.json(newMessage, 201);
    } catch (error) {
      return c.json({ error: 'Failed to send message' }, 500);
    }
  }
);

// Get room members
messagingRouter.get('/rooms/:publicId/members', authenticateToken, async (c) => {
  try {
    const publicId = c.req.param('publicId');
    const userId = (c.get('user') as User).id;

    // Check if user is a member of this room
    const roomCheck = await db
      .select({ roomId: chatRooms.id })
      .from(chatRooms)
      .innerJoin(roomMembers, eq(chatRooms.id, roomMembers.roomId))
      .where(
        and(
          eq(chatRooms.publicId, publicId),
          eq(roomMembers.userId, userId)
        )
      )
      .limit(1);

    if (roomCheck.length === 0) {
      return c.json({ error: 'Not authorized to view members' }, 403);
    }

    const members = await db
      .select({
        membership: roomMembers,
        user: {
          publicId: users.publicId,
          firstName: users.firstName,
          lastName: users.lastName,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(roomMembers)
      .innerJoin(users, eq(roomMembers.userId, users.id))
      .where(eq(roomMembers.roomId, roomCheck[0].roomId));

    return c.json(members);
  } catch (error) {
    return c.json({ error: 'Failed to fetch room members' }, 500);
  }
});