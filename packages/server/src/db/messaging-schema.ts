// src/db/messaging-schema.ts - Create this missing file

import { z } from 'zod';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { chatRooms, messages, roomMembers } from './schema.js';

// Chat Room schemas
export const insertChatRoomSchema = createInsertSchema(chatRooms, {
  name: z.string().min(1, 'Room name is required').max(100, 'Room name too long'),
  description: z.string().max(1000, 'Description too long').optional(),
  isPrivate: z.boolean().default(false),
});

export const updateChatRoomSchema = insertChatRoomSchema
  .pick({
    name: true,
    description: true,
    isPrivate: true,
  })
  .partial();

export const selectChatRoomSchema = createSelectSchema(chatRooms);

// Message schemas
export const insertMessageSchema = createInsertSchema(messages, {
  content: z.string().min(1, 'Message content is required').max(5000, 'Message too long'),
  messageType: z.string().max(50).default('text'),
  metadata: z.record(z.any()).optional(),
});

export const selectMessageSchema = createSelectSchema(messages);

// Room Member schemas
export const insertRoomMemberSchema = createInsertSchema(roomMembers, {
  isAdmin: z.boolean().default(false),
});

export const selectRoomMemberSchema = createSelectSchema(roomMembers);

// API request/response types
export type CreateChatRoomRequest = z.infer<typeof insertChatRoomSchema>;
export type UpdateChatRoomRequest = z.infer<typeof updateChatRoomSchema>;
export type ChatRoom = z.infer<typeof selectChatRoomSchema>;

export type CreateMessageRequest = z.infer<typeof insertMessageSchema>;
export type Message = z.infer<typeof selectMessageSchema>;

export type JoinRoomRequest = z.infer<typeof insertRoomMemberSchema>;
export type RoomMember = z.infer<typeof selectRoomMemberSchema>;