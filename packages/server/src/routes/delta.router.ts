// src/routes/delta.router.ts - Using actual deltaTrackingService methods

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth.js';
import { deltaTrackingService } from '../services/delta-tracking.service.js';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';

export const deltaRouter = new Hono();

// Validation schemas based on what your service supports
const getChangesSchema = z.object({
  since: z.string().optional(), // ISO timestamp
  limit: z.number().int().min(1).max(100).default(50),
  entityType: z.enum(['activity', 'elo', 'skill_rating', 'connection', 'message', 'user','activity_chat_message', 'team_member', 'team', 'test']).optional(),
  clientType: z.enum(['web', 'mobile', 'desktop']).default('web'),
});

/**
 * GET /delta/changes - Get delta changes using actual service method
 */
deltaRouter.get('/changes',
  authenticateToken,
  zValidator('query', getChangesSchema),
  async (c) => {
    try {
      const user = c.get('user');
      const { since, limit, entityType, clientType } = c.req.valid('query');

      console.log(`🔄 Getting delta changes for ${user.username}, since: ${since || 'beginning'}`);

      // Use the actual service method that exists
      const deltaResponse = await deltaTrackingService.getDeltaChanges(
        user.id,
        since,
        clientType,
        limit,
        entityType
      );

      // Set cache headers for efficient polling
      c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      c.header('X-Poll-Interval', deltaResponse.recommendedPollInterval.toString());

      return c.json({
        success: true,
        data: deltaResponse,
        metadata: {
          timestamp: new Date().toISOString(),
          userId: user.id,
          clientType,
          recommendedNextPoll: new Date(Date.now() + deltaResponse.recommendedPollInterval).toISOString(),
        }
      });

    } catch (error) {
      console.error('Error getting delta changes:', error);
      return c.json({ 
        success: false,
        error: 'Failed to get delta changes',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  }
);

/**
 * GET /delta/status - Get delta status using actual service
 */
deltaRouter.get('/status', authenticateToken, async (c) => {
  try {
    const user = c.get('user');

    console.log(`📊 Getting delta status for ${user.username}`);

    // Get user cursor and statistics
    const [cursor, stats] = await Promise.all([
      deltaTrackingService.getOrCreateUserCursor(user.id, 'web'),
      deltaTrackingService.getDeltaStatistics(user.id)
    ]);

    const response = {
      deltaTracking: {
        enabled: true,
        lastSyncTimes: {
          elo: cursor.lastELOSync,
          activity: cursor.lastActivitySync,
          skillRating: cursor.lastSkillRatingSync,
          connection: cursor.lastConnectionSync,
          matchmaking: cursor.lastMatchmakingSync,
        },
        clientInfo: {
          type: cursor.clientType,
          lastActive: cursor.lastActiveAt,
          preferredPollInterval: 5000,
        },
        statistics: stats,
      },
      systemInfo: {
        serverTime: new Date().toISOString(),
        uptime: process.uptime(),
      }
    };

    return c.json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('Error getting delta status:', error);
    return c.json({ 
      success: false,
      error: 'Failed to get delta status' 
    }, 500);
  }
});

const allowedEntityTypes = [
  'user', 'elo', 'activity', 'skill_rating', 'connection',
  'matchmaking', 'activity_chat_message', 'team_member', 'team', 'test'
] as const; 

/**
 * POST /delta/track - Manually track a change (for testing/admin)
 */
deltaRouter.post('/track',
  authenticateToken,
  zValidator('json', z.object({
    entityType: z.enum(allowedEntityTypes),
    entityId: z.string().uuid(),
    changeType: z.enum(['create', 'update', 'delete']),
    data: z.any().optional(),
  })),
  async (c) => {
    try {
      const user = c.get('user');
      const { entityType, entityId, changeType, data } = c.req.valid('json');

      // Only allow admins or in development
      if (user.role !== 'admin' && process.env.NODE_ENV === 'production') {
        return c.json({
          success: false,
          error: 'Admin access required'
        }, 403);
      }

      console.log(`📝 ${user.username} manually tracking change: ${entityType}/${changeType}`);

      // Use the actual trackChange method
      await deltaTrackingService.trackChange({
        entityType,
        entityId,
        changeType,
        newData: data,
        affectedUserId: user.id,
        triggeredBy: user.id,
      });

      return c.json({
        success: true,
        message: 'Change tracked successfully',
      });

    } catch (error) {
      console.error('Error tracking change:', error);
      return c.json({
        success: false,
        error: 'Failed to track change',
      }, 500);
    }
  }
);

/**
 * POST /delta/reset - Reset user's delta cursor
 */
deltaRouter.post('/reset',
  authenticateToken,
  zValidator('json', z.object({
    entityType: z.enum(['elo', 'activity', 'skill_rating', 'connection', 'all']).default('all'),
    clientType: z.enum(['web', 'mobile']).default('web'),
  })),
  async (c) => {
    try {
      const user = c.get('user');
      const { entityType, clientType } = c.req.valid('json');

      console.log(`🔄 Resetting delta cursor for ${user.username}, entityType: ${entityType}`);

      const result = await deltaTrackingService.resetUserCursor(
        user.id, 
        clientType,
        entityType
      );

      return c.json({
        success: result.success,
        data: result.cursor,
        message: result.message
      });

    } catch (error) {
      console.error('Error resetting delta cursor:', error);
      return c.json({
        success: false,
        error: 'Failed to reset delta cursor'
      }, 500);
    }
  }
);

/**
 * GET /delta/health - Health check using actual service
 */
// Add to delta.router.ts - Fix health endpoint
// Add this to the existing delta router

deltaRouter.get('/health', async (c) => {
  try {
    // Basic health check - verify database connection
    const result = await db.select().from(users).limit(1).execute();
    
    // Check Redis connection if using Redis
    // const redisHealth = await redis.ping();
    
    return c.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'healthy',
        // redis: redisHealth === 'PONG' ? 'healthy' : 'unhealthy',
      },
      version: '1.0.0',
    });
  } catch (error) {
    console.error('Health check failed:', error);
    return c.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      services: {
        database: 'unhealthy',
      },
    }, 503);
  }
});

/**
 * POST /delta/manual-sync - Manual sync for testing (admin only)
 */
deltaRouter.post('/manual-sync',
  authenticateToken,
  zValidator('json', z.object({
    entityType: z.enum(['elo', 'activity', 'skill_rating', 'connection', 'all']),
    forceFullSync: z.boolean().default(false),
  })),
  async (c) => {
    try {
      const user = c.get('user');
      const { entityType, forceFullSync } = c.req.valid('json');

      // Only allow admins or in development mode
      if (user.role !== 'admin' && process.env.NODE_ENV === 'production') {
        return c.json({
          success: false,
          error: 'Manual sync is only available for administrators'
        }, 403);
      }

      console.log(`🔄 Manual delta sync requested by ${user.username} for ${entityType}`);

      const result = await deltaTrackingService.manualSync(
        user.id,
        entityType,
        forceFullSync
      );

      return c.json({
        success: result.success,
        data: { changesFound: result.changesFound },
        message: result.message
      });

    } catch (error) {
      console.error('Error in manual sync:', error);
      return c.json({
        success: false,
        error: 'Manual sync failed'
      }, 500);
    }
  }
);