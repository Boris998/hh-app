// src/db/activity-chat.schema.ts - Chat system validation schemas
import { z } from 'zod';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { activityChatRooms, activityChatMessages, activityChatReadStatus } from './schema.js';

// 🆕 Chat Room Schemas
export const insertActivityChatRoomSchema = createInsertSchema(activityChatRooms, {
  name: z.string().min(1, 'Chat room name is required').max(200, 'Name too long'),
  description: z.string().max(500, 'Description too long').optional(),
  isActive: z.boolean().default(true),
  autoDeleteAfterHours: z.number().int().min(1).max(8760).nullable().optional(), // 1 hour to 1 year
});

export const updateActivityChatRoomSchema = insertActivityChatRoomSchema
  .pick({
    name: true,
    description: true,
    isActive: true,
    autoDeleteAfterHours: true,
  })
  .partial();

export const selectActivityChatRoomSchema = createSelectSchema(activityChatRooms);

// 🆕 Chat Message Schemas
export const insertActivityChatMessageSchema = createInsertSchema(activityChatMessages, {
  content: z.string().min(1, 'Message content is required').max(500, 'Message too long'),
  messageType: z.enum(['text', 'system', 'image', 'file']).default('text'),
  metadata: z.record(z.any()).optional(),
});

export const updateActivityChatMessageSchema = z.object({
  content: z.string().min(1, 'Message content is required').max(500, 'Message too long'),
});

export const selectActivityChatMessageSchema = createSelectSchema(activityChatMessages);

// 🆕 Chat Read Status Schemas
export const insertActivityChatReadStatusSchema = createInsertSchema(activityChatReadStatus);
export const updateActivityChatReadStatusSchema = insertActivityChatReadStatusSchema.partial();
export const selectActivityChatReadStatusSchema = createSelectSchema(activityChatReadStatus);

// 🆕 API Request/Response Types
export type CreateActivityChatRoomRequest = z.infer<typeof insertActivityChatRoomSchema>;
export type UpdateActivityChatRoomRequest = z.infer<typeof updateActivityChatRoomSchema>;
export type ActivityChatRoom = z.infer<typeof selectActivityChatRoomSchema>;

export type CreateActivityChatMessageRequest = z.infer<typeof insertActivityChatMessageSchema>;
export type UpdateActivityChatMessageRequest = z.infer<typeof updateActivityChatMessageSchema>;
export type ActivityChatMessage = z.infer<typeof selectActivityChatMessageSchema>;

export type ActivityChatReadStatus = z.infer<typeof selectActivityChatReadStatusSchema>;

// 🆕 Enhanced API Types with Relations
export type ActivityChatRoomWithDetails = ActivityChatRoom & {
  activity: {
    id: string;
    name: string;
    description: string;
    dateTime: Date;
    completionStatus: string;
  };
  messageCount: number;
  unreadCount: number;
  lastMessage?: {
    id: string;
    content: string;
    senderName: string;
    createdAt: Date;
  };
  participants: Array<{
    id: string;
    username: string;
    avatarUrl?: string;
  }>;
};

export type ActivityChatMessageWithSender = ActivityChatMessage & {
  sender: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
  isOwnMessage: boolean;
};

// 🆕 Chat Settings Schema
export const chatSettingsSchema = z.object({
  isActive: z.boolean(),
  autoDeleteAfterHours: z.number().int().min(1).max(8760).nullable(),
  allowImageUploads: z.boolean().default(false),
  maxMessageLength: z.number().int().min(100).max(2000).default(500),
});

export type ChatSettings = z.infer<typeof chatSettingsSchema>;

// 🆕 System Message Generation Schema
export const systemMessageTypeSchema = z.enum([
  'user_joined',
  'user_left', 
  'activity_started',
  'activity_completed',
  'activity_cancelled',
  'chat_enabled',
  'chat_disabled',
  'results_recorded'
]);

export type SystemMessageType = z.infer<typeof systemMessageTypeSchema>;

export const createSystemMessageSchema = z.object({
  type: systemMessageTypeSchema,
  userId: z.string().uuid().optional(),
  username: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

// 🆕 Chat Statistics Schema
export const chatStatisticsSchema = z.object({
  totalMessages: z.number().int(),
  activeParticipants: z.number().int(),
  averageMessagesPerUser: z.number(),
  chatDuration: z.number().int(), // minutes
  mostActiveUser: z.object({
    username: z.string(),
    messageCount: z.number().int(),
  }).optional(),
});

export type ChatStatistics = z.infer<typeof chatStatisticsSchema>;

// 🆕 Validation Functions
export const validateChatRoomAccess = (userId: string, activityParticipants: string[]) => {
  return activityParticipants.includes(userId);
};

export const validateMessageContent = (content: string, messageType: string) => {
  if (messageType === 'text') {
    // Basic profanity filter placeholder
    const bannedWords = ['spam', 'abuse']; // Extend as needed
    const lowerContent = content.toLowerCase();
    return !bannedWords.some(word => lowerContent.includes(word));
  }
  return true;
};

export const generateChatRoomName = (activityName: string, activityType: string) => {
  return `${activityType} - ${activityName}`;
};

export const generateSystemMessage = (type: SystemMessageType, data: any): string => {
  switch (type) {
    case 'user_joined':
      return `${data.username} joined the activity`;
    case 'user_left':
      return `${data.username} left the activity`;
    case 'activity_started':
      return `Activity has started`;
    case 'activity_completed':
      return `Activity has been completed`;
    case 'activity_cancelled':
      return `Activity has been cancelled`;
    case 'chat_enabled':
      return `Chat has been enabled for this activity`;
    case 'chat_disabled':
      return `Chat has been disabled for this activity`;
    case 'results_recorded':
      return `Results have been recorded for this activity`;
    default:
      return `System update`;
  }
};