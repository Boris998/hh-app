// src/routes/delta.router.ts - Delta polling API endpoints

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth.js';
import { deltaTrackingService } from '../services/delta-tracking.service.js';

export const deltaRouter = new Hono();

// Request schemas
const getDeltasSchema = z.object({
  clientType: z.enum(['web', 'mobile']).default('web'),
  forceRefresh: z.boolean().default(false),
  entityTypes: z.array(z.enum(['elo', 'activity', 'skill_rating', 'connection', 'matchmaking']))
    .optional(),
});

const updateCursorSchema = z.object({
  cursors: z.object({
    lastELOSync: z.string().pipe(z.coerce.date()).optional(),
    lastActivitySync: z.string().pipe(z.coerce.date()).optional(),
    lastSkillRatingSync: z.string().pipe(z.coerce.date()).optional(),
    lastConnectionSync: z.string().pipe(z.coerce.date()).optional(),
    lastMatchmakingSync: z.string().pipe(z.coerce.date()).optional(),
  }),
  clientType: z.enum(['web', 'mobile']).default('web'),
});

const deltaMetrics = z.object({
    totalPollingRequests: z.number().optional(),
    averageResponseTime: z.number().optional(),
    changesPerMinute: z.number().optional(),
    activeUsers: z.number().optional(),
    errorRate: z.number().optional(),
})

/**
 * GET /delta/changes - Get delta changes for the authenticated user
 * 
 * This is the main endpoint that frontend clients will poll for updates
 */
deltaRouter.get('/changes',
  authenticateToken,
  zValidator('query', getDeltasSchema),
  async (c) => {
    try {
      const user = c.get('user');
      const { clientType, forceRefresh, entityTypes } = c.req.valid('query');

      console.log(`🔄 Delta request from ${user.username} (${clientType})`);

      // Get user deltas
      const deltaResponse = await deltaTrackingService.getUserDeltas(
        user.id,
        clientType,
        forceRefresh
      );

      // Filter by entity types if specified
      if (entityTypes && entityTypes.length > 0) {
        deltaResponse.changes = deltaResponse.changes.filter(
          change => entityTypes.includes(change.entityType as any)
        );
        deltaResponse.hasChanges = deltaResponse.changes.length > 0;
        deltaResponse.metadata.totalChanges = deltaResponse.changes.length;
      }

      // Set cache headers for efficient polling
      c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      c.header('X-Poll-Interval', deltaResponse.recommendedPollInterval.toString());

      return c.json({
        status: 'success',
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
        error: 'Failed to get delta changes',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
  }
);

/**
 * GET /delta/status - Get delta tracking status and statistics
 */
deltaRouter.get('/status',
  authenticateToken,
  async (c) => {
    try {
      const user = c.get('user');

      // Get user cursor info
      const cursor = await deltaTrackingService.getOrCreateUserCursor(user.id, 'web');

      return c.json({
        status: 'success',
        data: {
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
              preferredPollInterval: cursor.preferredPollInterval,
            },
            systemInfo: {
              serverTime: new Date().toISOString(),
              uptime: process.uptime(),
            }
          }
        }
      });

    } catch (error) {
      console.error('Error getting delta status:', error);
      return c.json({ 
        error: 'Failed to get delta status' 
      }, 500);
    }
  }
);

/**
 * POST /delta/reset - Reset user's delta cursor (force full refresh)
 */
deltaRouter.post('/reset',
  authenticateToken,
  async (c) => {
    try {
      const user = c.get('user');

      console.log(`🔄 Resetting delta cursor for ${user.username}`);

      // Force refresh by getting deltas with forceRefresh = true
      const deltaResponse = await deltaTrackingService.getUserDeltas(
        user.id,
        'web',
        true // Force refresh
      );

      return c.json({
        status: 'success',
        data: {
          message: 'Delta cursor reset successfully',
          changesReturned: deltaResponse.changes.length,
          newCursors: deltaResponse.newCursors,
        }
      });

    } catch (error) {
      console.error('Error resetting delta cursor:', error);
      return c.json({ 
        error: 'Failed to reset delta cursor' 
      }, 500);
    }
  }
);

/**
 * POST /delta/cursors - Manually update delta cursors (advanced use)
 */
deltaRouter.post('/cursors',
  authenticateToken,
  zValidator('json', updateCursorSchema),
  async (c) => {
    try {
      const user = c.get('user');
      const { cursors, clientType } = c.req.valid('json');

      console.log(`📝 Manually updating cursors for ${user.username}`);

      // This is typically used by clients that want to manage their own cursor state
      // For example, after processing a batch of changes locally

      await deltaTrackingService.updateUserCursor(user.id, cursors as any, clientType);

      return c.json({
        status: 'success',
        data: {
          message: 'Delta cursors updated successfully',
          updatedCursors: cursors,
        }
      });

    } catch (error) {
      console.error('Error updating delta cursors:', error);
      return c.json({ 
        error: 'Failed to update delta cursors' 
      }, 500);
    }
  }
);

/**
 * GET /delta/health - Health check for delta system
 */
deltaRouter.get('/health', async (c) => {
  try {
    // Basic health check - ensure delta tracking service is responsive
    const startTime = Date.now();
    
    // Test database connectivity with a simple query
    await deltaTrackingService.cleanupOldDeltas(30); // This won't delete anything but tests DB
    
    const responseTime = Date.now() - startTime;

    return c.json({
      status: 'healthy',
      data: {
        deltaSystem: {
          status: 'operational',
          responseTime: `${responseTime}ms`,
          timestamp: new Date().toISOString(),
        },
        database: {
          status: 'connected',
          responseTime: `${responseTime}ms`,
        }
      }
    });

  } catch (error) {
    return c.json({
      status: 'unhealthy',
      error: 'Delta system health check failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export default deltaRouter;