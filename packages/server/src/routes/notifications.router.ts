// src/routes/notifications.router.ts - Notifications router with Zod validation
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth.js';
import { db } from '../db/client.js';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import {
  users,
  activities,
  activityParticipants,
  userConnections
} from '../db/schema.js';
import { paginationSchema, type Pagination } from '../db/zod.schema.js';

export const notificationsRouter = new Hono();

// Validation schemas
const notificationIdSchema = z.object({
  notificationId: z.string().uuid('Invalid notification ID')
});

const markReadSchema = z.object({
  read: z.boolean().default(true)
});

// GET /notifications/count - Get unread notifications count
notificationsRouter.get('/count', authenticateToken, async (c) => {
  try {
    const user = c.get('user');
    const userId = user.id;

    console.log(`🔔 Fetching notification count for user: ${userId}`);

    // Calculate notifications from various sources
    let totalCount = 0;

    // 1. Pending activity invitations
    const pendingInvitations = await db
      .select({ count: count() })
      .from(activityParticipants)
      .innerJoin(activities, eq(activities.id, activityParticipants.activityId))
      .where(
        and(
          eq(activityParticipants.userId, userId),
          eq(activityParticipants.status, 'pending'),
          // Only count future activities
          sql`${activities.dateTime} > NOW()`
        )
      );

    totalCount += pendingInvitations[0]?.count || 0;

    // 2. Pending friend requests
    const pendingFriendRequests = await db
      .select({ count: count() })
      .from(userConnections)
      .where(
        and(
          eq(userConnections.user2Id, userId), // Received requests
          eq(userConnections.status, 'pending')
        )
      );

    totalCount += pendingFriendRequests[0]?.count || 0;

    // 3. Recent completed activities needing skill ratings (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const completedActivitiesNeedingRatings = await db
      .select({ count: count() })
      .from(activityParticipants)
      .innerJoin(activities, eq(activities.id, activityParticipants.activityId))
      .where(
        and(
          eq(activityParticipants.userId, userId),
          eq(activities.completionStatus, 'completed'),
          sql`${activities.dateTime} >= ${sevenDaysAgo.toISOString()}`,
          // User hasn't submitted ratings yet
          sql`NOT EXISTS(
            SELECT 1 FROM user_activity_skill_ratings 
            WHERE rating_user_id = ${userId} 
            AND activity_id = ${activities.id}
          )`
        )
      );

    totalCount += completedActivitiesNeedingRatings[0]?.count || 0;

    console.log(`✅ Total notification count: ${totalCount}`);

    return c.json({
      success: true,
      data: { count: totalCount },
      breakdown: {
        pendingInvitations: pendingInvitations[0]?.count || 0,
        pendingFriendRequests: pendingFriendRequests[0]?.count || 0,
        ratingsNeeded: completedActivitiesNeedingRatings[0]?.count || 0
      }
    });

  } catch (error) {
    console.error('Error fetching notification count:', error);
    return c.json({ 
      success: false, 
      error: 'Failed to fetch notification count' 
    }, 500);
  }
});

// GET /notifications - Get paginated notifications
notificationsRouter.get(
  '/',
  zValidator('query', paginationSchema),
  authenticateToken,
  async (c) => {
    try {
      const user = c.get('user');
      const userId = user.id;
      const { page, limit } = c.req.valid('query') as Pagination;

      console.log(`📋 Fetching notifications for user: ${userId}, page: ${page}, limit: ${limit}`);

      const offset = (page - 1) * limit;
      const notifications: any[] = [];

      // 1. Get pending activity invitations
      const pendingInvitations = await db
        .select({
          type: sql<string>`'activity_invitation'`,
          id: activityParticipants.id,
          title: sql<string>`'Activity Invitation'`,
          message: sql<string>`CONCAT('You have been invited to ', ${activities.description})`,
          createdAt: activityParticipants.joinedAt,
          isRead: sql<boolean>`false`,
          relatedId: activities.id,
          relatedData: sql<any>`JSON_BUILD_OBJECT(
            'activityId', ${activities.id},
            'description', ${activities.description},
            'location', ${activities.location},
            'dateTime', ${activities.dateTime},
            'creatorUsername', ${users.username}
          )`
        })
        .from(activityParticipants)
        .innerJoin(activities, eq(activities.id, activityParticipants.activityId))
        .innerJoin(users, eq(users.id, activities.creatorId))
        .where(
          and(
            eq(activityParticipants.userId, userId),
            eq(activityParticipants.status, 'pending'),
            // Only count future activities
            sql`${activities.dateTime} > NOW()`
          )
        );

      notifications.push(...pendingInvitations);

      // 2. Get pending friend requests
      const pendingFriendRequests = await db
        .select({
          type: sql<string>`'friend_request'`,
          id: userConnections.id,
          title: sql<string>`'Friend Request'`,
          message: sql<string>`CONCAT(${users.username}, ' wants to connect with you')`,
          createdAt: userConnections.createdAt,
          isRead: sql<boolean>`false`,
          relatedId: userConnections.user1Id,
          relatedData: sql<any>`JSON_BUILD_OBJECT(
            'requesterId', ${userConnections.user1Id},
            'requesterUsername', ${users.username},
            'requesterAvatarUrl', ${users.avatarUrl}
          )`
        })
        .from(userConnections)
        .innerJoin(users, eq(users.id, userConnections.user1Id))
        .where(
          and(
            eq(userConnections.user2Id, userId),
            eq(userConnections.status, 'pending')
          )
        );

      notifications.push(...pendingFriendRequests);

      // 3. Get completed activities needing ratings
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const ratingsNeeded = await db
        .select({
          type: sql<string>`'rating_needed'`,
          id: activities.id,
          title: sql<string>`'Rate Your Teammates'`,
          message: sql<string>`CONCAT('Please rate your teammates for: ', ${activities.description})`,
          createdAt: activities.updatedAt,
          isRead: sql<boolean>`false`,
          relatedId: activities.id,
          relatedData: sql<any>`JSON_BUILD_OBJECT(
            'activityId', ${activities.id},
            'description', ${activities.description},
            'completedAt', ${activities.updatedAt}
          )`
        })
        .from(activities)
        .innerJoin(activityParticipants, eq(activityParticipants.activityId, activities.id))
        .where(
          and(
            eq(activityParticipants.userId, userId),
            eq(activities.completionStatus, 'completed'),
            sql`${activities.dateTime} >= ${sevenDaysAgo.toISOString()}`,
            // User hasn't submitted ratings yet
            sql`NOT EXISTS(
              SELECT 1 FROM user_activity_skill_ratings 
              WHERE rating_user_id = ${userId} 
              AND activity_id = ${activities.id}
            )`
          )
        );

      notifications.push(...ratingsNeeded);

      // Sort by creation date (newest first) and paginate
      const sortedNotifications = notifications
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(offset, offset + limit);

      const totalCount = notifications.length;

      return c.json({
        success: true,
        data: sortedNotifications,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit)
        }
      });

    } catch (error) {
      console.error('Error fetching notifications:', error);
      return c.json({ 
        success: false, 
        error: 'Failed to fetch notifications' 
      }, 500);
    }
  }
);

// POST /notifications/:notificationId/read - Mark notification as read
notificationsRouter.post(
  '/:notificationId/read',
  zValidator('param', notificationIdSchema),
  zValidator('json', markReadSchema),
  authenticateToken,
  async (c) => {
    try {
      const { notificationId } = c.req.valid('param');
      const { read } = c.req.valid('json');
      const user = c.get('user');

      console.log(`📧 Marking notification ${notificationId} as ${read ? 'read' : 'unread'} for user: ${user.username}`);

      // For this simple implementation, we'll just return success
      // In a real app, you'd store notification read status in the database
      
      return c.json({
        success: true,
        message: `Notification marked as ${read ? 'read' : 'unread'}`
      });

    } catch (error) {
      console.error('Error marking notification as read:', error);
      return c.json({ 
        success: false, 
        error: 'Failed to mark notification as read' 
      }, 500);
    }
  }
);

// POST /notifications/read-all - Mark all notifications as read
notificationsRouter.post('/read-all', authenticateToken, async (c) => {
  try {
    const user = c.get('user');

    console.log(`📧 Marking all notifications as read for user: ${user.username}`);

    // For this simple implementation, we'll just return success
    // In a real app, you'd update all notification read statuses in the database
    
    return c.json({
      success: true,
      message: 'All notifications marked as read'
    });

  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return c.json({ 
      success: false, 
      error: 'Failed to mark all notifications as read' 
    }, 500);
  }
});
