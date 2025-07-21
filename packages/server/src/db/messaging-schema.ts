// packages/server/src/db/messaging-schema.ts
import { z } from 'zod';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { chatRooms, roomMembers, messages } from './schema.js';

// Chat Room schemas
export const insertChatRoomSchema = createInsertSchema(chatRooms, {
  name: (schema) => schema.min(1, 'Room name is required').max(100, 'Room name too long'),
  description: (schema) => schema.max(500, 'Description too long').optional().nullable(),
  isPrivate: (schema) => schema.default(false),
});

export const selectChatRoomSchema = createSelectSchema(chatRooms);

export const updateChatRoomSchema = insertChatRoomSchema
  .pick({
    name: true,
    description: true,
    isPrivate: true,
  })
  .partial();

// Room Member schemas
export const insertRoomMemberSchema = createInsertSchema(roomMembers, {
  isAdmin: (schema) => schema.default(false),
});

export const selectRoomMemberSchema = createSelectSchema(roomMembers);

// Message schemas
export const insertMessageSchema = createInsertSchema(messages, {
  content: (schema) => schema.min(1, 'Message content is required').max(5000, 'Message too long'),
  messageType: (schema) => schema.default('text'),
  metadata: (schema) => schema.optional(),
});

export const selectMessageSchema = createSelectSchema(messages);

export const updateMessageSchema = insertMessageSchema
  .pick({
    content: true,
    metadata: true,
  })
  .partial();

// API request/response types
export type CreateChatRoomRequest = z.infer<typeof insertChatRoomSchema>;
export type UpdateChatRoomRequest = z.infer<typeof updateChatRoomSchema>;
export type CreateMessageRequest = z.infer<typeof insertMessageSchema>;
export type UpdateMessageRequest = z.infer<typeof updateMessageSchema>;
export type JoinRoomRequest = z.infer<typeof insertRoomMemberSchema>;

export type ChatRoom = z.infer<typeof selectChatRoomSchema>;
export type RoomMember = z.infer<typeof selectRoomMemberSchema>;
export type Message = z.infer<typeof selectMessageSchema>;