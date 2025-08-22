// src/services/delta-tracking.service.ts - Complete fixed implementation with zod validation
import { db } from "../db/client.js";
import {
  entityChangeLog,
  userDeltaCursors,
  deltaSummaries,
} from "../db/delta-tracking.schema.js";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import {
  type EntityChangeLog,
  type InsertEntityChangeLog,
  type UserDeltaCursor,
  type InsertUserDeltaCursor,
  type UpdateUserDeltaCursor,
  type DeltaChangeInput,
  type UserDeltaResponse,
  type DeltaQuery,
  insertEntityChangeLogSchema,
  insertUserDeltaCursorSchema,
  updateUserDeltaCursorSchema,
  deltaChangeInputSchema,
  deltaQuerySchema,
} from "../db/delta-tracking.schema.js";

export class DeltaTrackingService {
  /**
   * Track a change in the system (main method used by routers)
   */
  async trackChange(change: DeltaChangeInput): Promise<void> {
    try {
      const validatedChange = deltaChangeInputSchema.parse(change);

      await db.insert(entityChangeLog).values({
        entityType: validatedChange.entityType,
        entityId: validatedChange.entityId,
        changeType: validatedChange.changeType,
        affectedUserId: validatedChange.affectedUserId || null,
        relatedEntityId: validatedChange.relatedEntityId || null,
        previousData: validatedChange.previousData || null,
        newData: validatedChange.newData,
        changeDetails: validatedChange.changeDetails || null,
        triggeredBy: validatedChange.triggeredBy || null,
        changeSource: validatedChange.changeSource || "system",
      });

      console.log(
        `📊 Delta tracked: ${validatedChange.entityType}:${validatedChange.changeType} for entity ${validatedChange.entityId}`
      );
    } catch (error) {
      console.error("Failed to track delta change:", error);
    }
  }

  /**
   * Legacy method for backwards compatibility
   */
  async logChange(change: DeltaChangeInput): Promise<void> {
    return this.trackChange(change);
  }

  /**
   * Log ELO change (called from ELO processing service)
   */
  async logELOChange(
    userId: string,
    activityTypeId: string,
    oldELO: number,
    newELO: number,
    activityId: string,
    triggeredBy?: string
  ): Promise<void> {
    await this.trackChange({
      entityType: "elo",
      entityId: `${userId}-${activityTypeId}`,
      changeType: "update",
      affectedUserId: userId,
      relatedEntityId: activityId,
      previousData: { eloScore: oldELO },
      newData: {
        eloScore: newELO,
        change: newELO - oldELO,
        activityTypeId,
      },
      changeDetails: {
        activityId,
        eloChange: newELO - oldELO,
        previousELO: oldELO,
        newELO: newELO,
      },
      triggeredBy,
      changeSource: "system",
    });
  }

  /**
   * Log activity change
   */
  async logActivityChange(
    activityId: string,
    changeType: "create" | "update" | "delete",
    affectedUserIds: string[],
    previousData?: any,
    newData?: any,
    triggeredBy?: string
  ): Promise<void> {
    for (const userId of affectedUserIds) {
      await this.trackChange({
        entityType: "activity",
        entityId: activityId,
        changeType,
        affectedUserId: userId,
        relatedEntityId: activityId,
        previousData,
        newData,
        triggeredBy,
        changeSource: "user_action",
      });
    }
  }

  /**
   * Log skill rating change
   */
  async logSkillRatingChange(
    ratingId: string,
    changeType: "create" | "update" | "delete",
    ratedUserId: string,
    ratingUserId: string,
    activityId: string,
    skillData: any,
    triggeredBy?: string
  ): Promise<void> {
    await this.trackChange({
      entityType: "skill_rating",
      entityId: ratingId,
      changeType,
      affectedUserId: ratedUserId,
      relatedEntityId: activityId,
      newData: skillData,
      changeDetails: {
        ratingUserId,
        activityId,
      },
      triggeredBy,
      changeSource: "user_action",
    });
  }

  /**
   * Get delta changes for a user since last sync
   */
  async getUserDeltas(
    userId: string,
    since?: Date,
    entityTypes?: string[],
    clientType: "web" | "mobile" = "web"
  ): Promise<UserDeltaResponse> {
    try {
      const cursor = await this.getOrCreateUserCursor(userId, clientType);

      const sinceDate = since || cursor.lastELOSync || new Date(0);

      const whereConditions = [
        eq(entityChangeLog.affectedUserId, userId),
        gte(entityChangeLog.createdAt, sinceDate),
      ];

      if (entityTypes && entityTypes.length > 0) {
        whereConditions.push(
          sql`${entityChangeLog.entityType} = ANY(${entityTypes})`
        );
      }

      const changes = await db
        .select()
        .from(entityChangeLog)
        .where(and(...whereConditions))
        .orderBy(desc(entityChangeLog.createdAt))
        .limit(100);

      const filteredChanges = this.filterChangesByCursors(changes, cursor);

      const now = new Date();
      const newCursors = {
        lastELOSync: this.hasChangesOfType(filteredChanges, "elo")
          ? now
          : cursor.lastELOSync || now,
        lastActivitySync: this.hasChangesOfType(filteredChanges, "activity")
          ? now
          : cursor.lastActivitySync || now,
        lastSkillRatingSync: this.hasChangesOfType(
          filteredChanges,
          "skill_rating"
        )
          ? now
          : cursor.lastSkillRatingSync || now,
        lastConnectionSync: this.hasChangesOfType(filteredChanges, "connection")
          ? now
          : cursor.lastConnectionSync || now,
        lastMatchmakingSync: this.hasChangesOfType(
          filteredChanges,
          "matchmaking"
        )
          ? now
          : cursor.lastMatchmakingSync || now,
      };

      if (filteredChanges.length > 0) {
        await this.updateUserCursor(userId, newCursors, clientType);
      }

      const changeTypes = filteredChanges.reduce((acc, change) => {
        acc[change.entityType] = (acc[change.entityType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const metadata = {
        totalChanges: filteredChanges.length,
        changeTypes,
        oldestChange:
          filteredChanges.length > 0
            ? new Date(
                Math.min(...filteredChanges.map((c) => c.createdAt.getTime()))
              )
            : undefined,
        newestChange:
          filteredChanges.length > 0
            ? new Date(
                Math.max(...filteredChanges.map((c) => c.createdAt.getTime()))
              )
            : undefined,
      };

      const recommendedPollInterval = this.calculatePollInterval(
        filteredChanges.length,
        clientType,
        cursor.lastActiveAt
      );

      return {
        hasChanges: filteredChanges.length > 0,
        changes: filteredChanges as EntityChangeLog[],
        newCursors,
        metadata,
        recommendedPollInterval,
      };
    } catch (error) {
      console.error("Error getting user deltas:", error);
      return {
        hasChanges: false,
        changes: [],
        newCursors: {
          lastELOSync: new Date(),
          lastActivitySync: new Date(),
          lastSkillRatingSync: new Date(),
          lastConnectionSync: new Date(),
          lastMatchmakingSync: new Date(),
        },
        metadata: {
          totalChanges: 0,
          changeTypes: {},
        },
        recommendedPollInterval: 30000,
      };
    }
  }

  /**
   * Get or create user delta cursor
   */
  async getOrCreateUserCursor(
    userId: string,
    clientType: "web" | "mobile"
  ): Promise<UserDeltaCursor> {
    const existing = await db.query.userDeltaCursors.findFirst({
      where: eq(userDeltaCursors.userId, userId),
    });

    if (existing) {
      // Ensure clientType is not null
      const updatedClientType = existing.clientType || clientType;

      await db
        .update(userDeltaCursors)
        .set({
          lastActiveAt: new Date(),
          clientType: updatedClientType,
          updatedAt: new Date(),
        })
        .where(eq(userDeltaCursors.userId, userId));

      return {
        ...existing,
        lastActiveAt: new Date(),
        clientType: updatedClientType,
      } as UserDeltaCursor;
    }

    const cursorData: InsertUserDeltaCursor = {
      userId,
      clientType,
      lastActiveAt: new Date(),
    };

    const validatedCursor = insertUserDeltaCursorSchema.parse(cursorData);

    const [newCursor] = await db
      .insert(userDeltaCursors)
      .values(validatedCursor)
      .returning();

    // Ensure clientType is not null in the returned cursor
    return {
      ...newCursor,
      clientType: newCursor.clientType || clientType,
    } as UserDeltaCursor;
  }

  /**
   * Filter changes based on entity-specific cursor timestamps
   */
  private filterChangesByCursors(
    changes: any[],
    cursor: UserDeltaCursor
  ): EntityChangeLog[] {
    if (!cursor) return changes as EntityChangeLog[];

    return changes.filter((change) => {
      const changeTime = new Date(change.createdAt);

      switch (change.entityType) {
        case "elo":
          return changeTime > (cursor.lastELOSync || new Date(0));
        case "activity":
          return changeTime > (cursor.lastActivitySync || new Date(0));
        case "skill_rating":
          return changeTime > (cursor.lastSkillRatingSync || new Date(0));
        case "connection":
          return changeTime > (cursor.lastConnectionSync || new Date(0));
        case "matchmaking":
          return changeTime > (cursor.lastMatchmakingSync || new Date(0));
        default:
          return true;
      }
    }) as EntityChangeLog[];
  }

  /**
   * Check if there are changes of a specific type
   */
  private hasChangesOfType(
    changes: EntityChangeLog[],
    entityType: string
  ): boolean {
    return changes.some((change) => change.entityType === entityType);
  }

  /**
   * Update user cursor in database
   */
  private async updateUserCursor(
    userId: string,
    cursors: any,
    clientType: "web" | "mobile"
  ): Promise<void> {
    try {
      const updateData: UpdateUserDeltaCursor = {
        lastELOSync: cursors.lastELOSync,
        lastActivitySync: cursors.lastActivitySync,
        lastSkillRatingSync: cursors.lastSkillRatingSync,
        lastConnectionSync: cursors.lastConnectionSync,
        lastMatchmakingSync: cursors.lastMatchmakingSync,
        lastActiveAt: new Date(),
        clientType,
        updatedAt: new Date(),
      };

      const validatedUpdate = updateUserDeltaCursorSchema.parse(updateData);

      await db
        .update(userDeltaCursors)
        .set(validatedUpdate)
        .where(eq(userDeltaCursors.userId, userId));
    } catch (error) {
      console.error("Error updating user cursor:", error);
    }
  }

  /**
 * Get changes for user (used by delta router /changes endpoint)
 * This is an alias/wrapper around getUserDeltas for consistency
 */
async getChangesForUser(
  userId: string,
  since?: string,
  entityType?: string,
  limit: number = 50
): Promise<EntityChangeLog[]> {
  try {
    const sinceDate = since ? new Date(since) : undefined;
    const entityTypes = entityType ? [entityType] : undefined;
    
    const response = await this.getUserDeltas(
      userId, 
      sinceDate, 
      entityTypes, 
      'web'
    );
    
    return response.changes;
  } catch (error) {
    console.error('Error getting changes for user:', error);
    return [];
  }
}

/**
 * Check if delta tracking service is healthy
 */
async isServiceHealthy(): Promise<boolean> {
  try {
    // Test database connectivity by trying to read from entity change log
    await db
      .select({ count: sql<number>`count(*)` })
      .from(entityChangeLog)
      .limit(1);
    
    return true;
  } catch (error) {
    console.error('Delta service health check failed:', error);
    return false;
  }
}

/**
 * Get delta changes with full response structure (main method for delta router)
 */
async getDeltaChanges(
  userId: string,
  since?: string,
  clientType: 'web' | 'mobile' | 'desktop' = 'web',
  limit: number = 50,
  entityType?: string
): Promise<{
  changes: EntityChangeLog[];
  hasChanges: boolean;
  lastSync: string;
  recommendedPollInterval: number;
  metadata: {
    totalChanges: number;
    entityTypes?: string[];
  };
}> {
  try {
    const sinceDate = since ? new Date(since) : undefined;
    const entityTypes = entityType ? [entityType] : undefined;
    
    // Use mobile for desktop client type since the service only supports 'web' | 'mobile'
    const serviceClientType = clientType === 'desktop' ? 'mobile' : clientType;
    
    const response = await this.getUserDeltas(
      userId,
      sinceDate,
      entityTypes,
      serviceClientType
    );

    return {
      changes: response.changes,
      hasChanges: response.hasChanges,
      lastSync: new Date().toISOString(),
      recommendedPollInterval: response.recommendedPollInterval,
      metadata: {
        totalChanges: response.metadata.totalChanges,
        entityTypes: entityTypes,
      }
    };
  } catch (error) {
    console.error('Error getting delta changes:', error);
    return {
      changes: [],
      hasChanges: false,
      lastSync: new Date().toISOString(),
      recommendedPollInterval: 30000, // 30 seconds fallback
      metadata: {
        totalChanges: 0,
      }
    };
  }
}

/**
 * Test delta tracking functionality
 */
async testDeltaTracking(): Promise<boolean> {
  try {
    // Create a test change entry
    const testEntityId = 'test-' + Date.now();
    await this.trackChange({
      entityType: 'test',
      entityId: testEntityId,
      changeType: 'create',
      newData: { test: true },
      changeSource: 'system_test',
    });

    // Try to read it back
    const changes = await db
      .select()
      .from(entityChangeLog)
      .where(eq(entityChangeLog.entityId, testEntityId))
      .limit(1);

    // Clean up test data
    if (changes.length > 0) {
      await db
        .delete(entityChangeLog)
        .where(eq(entityChangeLog.entityId, testEntityId));
    }

    return changes.length > 0;
  } catch (error) {
    console.error('Delta tracking test failed:', error);
    return false;
  }
}

/**
 * Get delta system health information
 */
async getDeltaSystemHealth(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    database: boolean;
    recentActivity: boolean;
    errorRate: number;
  };
}> {
  try {
    // Check database connectivity
    const dbHealthy = await this.isServiceHealthy();
    
    // Check for recent activity (changes in last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentChanges = await db
      .select({ count: sql<number>`count(*)` })
      .from(entityChangeLog)
      .where(gte(entityChangeLog.createdAt, oneHourAgo));
    
    const hasRecentActivity = (recentChanges[0]?.count || 0) > 0;
    
    // Simple error rate calculation (could be enhanced)
    const errorRate = 0; // Placeholder - would need error tracking
    
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (!dbHealthy) {
      status = 'unhealthy';
    } else if (!hasRecentActivity) {
      status = 'degraded';
    }
    
    return {
      status,
      checks: {
        database: dbHealthy,
        recentActivity: hasRecentActivity,
        errorRate,
      }
    };
  } catch (error) {
    console.error('Error getting delta system health:', error);
    return {
      status: 'unhealthy',
      checks: {
        database: false,
        recentActivity: false,
        errorRate: 1,
      }
    };
  }
}

/**
 * Reset user cursor for troubleshooting
 */
async resetUserCursor(
  userId: string,
  clientType: 'web' | 'mobile' = 'web',
  entityType?: string
): Promise<{
  success: boolean;
  message: string;
  cursor?: UserDeltaCursor;
}> {
  try {
    const now = new Date();
    
    if (entityType && entityType !== 'all') {
      // Reset specific entity type cursor
      const updateData: Partial<UpdateUserDeltaCursor> = {
        lastActiveAt: now,
        updatedAt: now,
      };
      
      switch (entityType) {
        case 'elo':
          updateData.lastELOSync = now;
          break;
        case 'activity':
          updateData.lastActivitySync = now;
          break;
        case 'skill_rating':
          updateData.lastSkillRatingSync = now;
          break;
        case 'connection':
          updateData.lastConnectionSync = now;
          break;
        case 'matchmaking':
          updateData.lastMatchmakingSync = now;
          break;
        default:
          throw new Error(`Unknown entity type: ${entityType}`);
      }
      
      await db
        .update(userDeltaCursors)
        .set(updateData)
        .where(eq(userDeltaCursors.userId, userId));
        
      return {
        success: true,
        message: `Reset ${entityType} cursor for user`,
      };
    } else {
      // Reset all cursors
      const updateData: UpdateUserDeltaCursor = {
        lastELOSync: now,
        lastActivitySync: now,
        lastSkillRatingSync: now,
        lastConnectionSync: now,
        lastMatchmakingSync: now,
        lastActiveAt: now,
        clientType,
        updatedAt: now,
      };
      
      const validatedUpdate = updateUserDeltaCursorSchema.parse(updateData);
      
      await db
        .update(userDeltaCursors)
        .set(validatedUpdate)
        .where(eq(userDeltaCursors.userId, userId));
      
      // Get the updated cursor
      const cursor = await this.getOrCreateUserCursor(userId, clientType);
      
      return {
        success: true,
        message: 'Reset all cursors for user',
        cursor,
      };
    }
  } catch (error) {
    console.error('Error resetting user cursor:', error);
    return {
      success: false,
      message: 'Failed to reset user cursor',
    };
  }
}

/**
 * Manual sync for testing/admin purposes
 */
async manualSync(
  userId: string,
  entityType: string,
  forceFullSync: boolean = false
): Promise<{
  success: boolean;
  message: string;
  changesFound: number;
}> {
  try {
    if (forceFullSync) {
      // Reset cursor first to get all changes
      await this.resetUserCursor(userId, 'web', entityType);
    }
    
    // Get changes
    const response = await this.getUserDeltas(
      userId,
      forceFullSync ? new Date(0) : undefined,
      entityType === 'all' ? undefined : [entityType],
      'web'
    );
    
    return {
      success: true,
      message: `Manual sync completed for ${entityType}`,
      changesFound: response.changes.length,
    };
  } catch (error) {
    console.error('Error in manual sync:', error);
    return {
      success: false,
      message: 'Manual sync failed',
      changesFound: 0,
    };
  }
}

/**
 * Get user-specific delta statistics
 */
async getDeltaStatistics(userId: string): Promise<{
  totalChanges: number;
  changesByType: Record<string, number>;
  last24Hours: number;
  lastWeek: number;
}> {
  try {
    // Get total changes for user
    const totalChanges = await db
      .select({ count: sql<number>`count(*)` })
      .from(entityChangeLog)
      .where(eq(entityChangeLog.affectedUserId, userId));
    
    // Get changes by type
    const changesByTypeResult = await db
      .select({
        entityType: entityChangeLog.entityType,
        count: sql<number>`count(*)`
      })
      .from(entityChangeLog)
      .where(eq(entityChangeLog.affectedUserId, userId))
      .groupBy(entityChangeLog.entityType);
    
    const changesByType = changesByTypeResult.reduce((acc, item) => {
      acc[item.entityType] = item.count;
      return acc;
    }, {} as Record<string, number>);
    
    // Get last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last24HoursResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(entityChangeLog)
      .where(and(
        eq(entityChangeLog.affectedUserId, userId),
        gte(entityChangeLog.createdAt, twentyFourHoursAgo)
      ));
    
    // Get last week
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const lastWeekResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(entityChangeLog)
      .where(and(
        eq(entityChangeLog.affectedUserId, userId),
        gte(entityChangeLog.createdAt, oneWeekAgo)
      ));
    
    return {
      totalChanges: totalChanges[0]?.count || 0,
      changesByType,
      last24Hours: last24HoursResult[0]?.count || 0,
      lastWeek: lastWeekResult[0]?.count || 0,
    };
  } catch (error) {
    console.error('Error getting delta statistics:', error);
    return {
      totalChanges: 0,
      changesByType: {},
      last24Hours: 0,
      lastWeek: 0,
    };
  }
}

  /**
   * Calculate adaptive polling interval
   */
  private calculatePollInterval(
    changeCount: number,
    clientType: "web" | "mobile",
    lastActiveAt?: Date | null
  ): number {
    const baseInterval = clientType === "web" ? 5000 : 10000;
    const now = new Date();
    const timeSinceActive = now.getTime() - (lastActiveAt || now).getTime();
    const hoursInactive = timeSinceActive / (1000 * 60 * 60);

    if (changeCount > 5) return Math.max(baseInterval / 2, 2000);
    if (changeCount > 2) return baseInterval;

    if (hoursInactive > 4) return baseInterval * 4;
    if (hoursInactive > 1) return baseInterval * 2;

    return baseInterval;
  }

  /**
   * Clean up old delta records (run periodically)
   */
  async cleanupOldDeltas(daysToKeep: number = 7): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    await db
      .delete(entityChangeLog)
      .where(sql`${entityChangeLog.createdAt} < ${cutoffDate.toISOString()}`);

    console.log(`🧹 Cleaned up delta records older than ${daysToKeep} days`);
  }
}

export const deltaTrackingService = new DeltaTrackingService();
