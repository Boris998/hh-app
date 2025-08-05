// src/services/delta-tracking.service.ts - Delta tracking and calculation service

import { db } from "../db/client.js";
import {
  entityChangeLog,
  userDeltaCursors,
  deltaSummaries,
  type DeltaChange,
  type UserDeltaResponse,
} from "../db/delta-tracking.schema.js";
import { users } from "../db/schema.js"; // Only import what we actually use
import { eq, and, gte, desc, sql } from "drizzle-orm";

export class DeltaTrackingService {
  /**
   * Log a change to the delta tracking system
   */
  async logChange(change: {
    entityType:
      | "elo"
      | "activity"
      | "skill_rating"
      | "connection"
      | "matchmaking";
    entityId: string;
    changeType: "create" | "update" | "delete";
    affectedUserId?: string;
    relatedEntityId?: string;
    previousData?: any;
    newData: any;
    changeDetails?: any;
    triggeredBy?: string;
    changeSource?: string;
  }): Promise<void> {
    try {
      await db.insert(entityChangeLog).values({
        entityType: change.entityType,
        entityId: change.entityId,
        changeType: change.changeType,
        affectedUserId: change.affectedUserId,
        relatedEntityId: change.relatedEntityId,
        previousData: change.previousData || null,
        newData: change.newData,
        changeDetails: change.changeDetails || null,
        triggeredBy: change.triggeredBy,
        changeSource: change.changeSource || "system",
      });

      console.log(
        `📊 Delta logged: ${change.entityType}:${change.changeType} for entity ${change.entityId}`
      );
    } catch (error) {
      console.error("Failed to log delta change:", error);
      // Don't throw - delta logging failures shouldn't break main functionality
    }
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
    await this.logChange({
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
    // Log change for each affected user
    for (const userId of affectedUserIds) {
      await this.logChange({
        entityType: "activity",
        entityId: activityId,
        changeType,
        affectedUserId: userId,
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
    ratedUserId: string,
    activityId: string,
    skillData: any,
    triggeredBy?: string
  ): Promise<void> {
    await this.logChange({
      entityType: "skill_rating",
      entityId: ratingId,
      changeType: "create",
      affectedUserId: ratedUserId,
      relatedEntityId: activityId,
      newData: skillData,
      triggeredBy,
      changeSource: "user_action",
    });
  }

  /**
   * Get delta changes for a user since their last sync
   */
  async getUserDeltas(
    userId: string,
    clientType: "web" | "mobile" = "web",
    forceRefresh: boolean = false
  ): Promise<UserDeltaResponse> {
    console.log(`🔄 Getting deltas for user ${userId} (${clientType})`);

    try {
      // Get or create user delta cursor
      const cursor = await this.getOrCreateUserCursor(userId, clientType);

      // Determine sync timestamps
      const syncTimestamps = {
        elo: forceRefresh ? new Date(0) : cursor.lastELOSync || new Date(0),
        activity: forceRefresh
          ? new Date(0)
          : cursor.lastActivitySync || new Date(0),
        skillRating: forceRefresh
          ? new Date(0)
          : cursor.lastSkillRatingSync || new Date(0),
        connection: forceRefresh
          ? new Date(0)
          : cursor.lastConnectionSync || new Date(0),
        matchmaking: forceRefresh
          ? new Date(0)
          : cursor.lastMatchmakingSync || new Date(0),
      };

      // Query changes since last sync
      const changes = await db
        .select({
          id: entityChangeLog.id,
          entityType: entityChangeLog.entityType,
          entityId: entityChangeLog.entityId,
          changeType: entityChangeLog.changeType,
          affectedUserId: entityChangeLog.affectedUserId,
          relatedEntityId: entityChangeLog.relatedEntityId,
          previousData: entityChangeLog.previousData,
          newData: entityChangeLog.newData,
          changeDetails: entityChangeLog.changeDetails,
          triggeredBy: entityChangeLog.triggeredBy,
          changeSource: entityChangeLog.changeSource,
          createdAt: entityChangeLog.createdAt,
        })
        .from(entityChangeLog)
        .where(
          and(
            eq(entityChangeLog.affectedUserId, userId),
            // Get changes newer than the oldest sync timestamp
            gte(
              entityChangeLog.createdAt,
              this.getOldestSyncTime(syncTimestamps)
            )
          )
        )
        .orderBy(desc(entityChangeLog.createdAt))
        .limit(100); // Prevent overwhelming responses

      // Filter changes by entity type and sync time
      const filteredChanges = changes.filter((change) => {
        const syncTime = this.getSyncTimeForEntityType(
          change.entityType as any,
          syncTimestamps
        );
        return change.createdAt > syncTime;
      });

      // Update cursor timestamps
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

      // Update cursor in database
      if (filteredChanges.length > 0) {
        await this.updateUserCursor(userId, newCursors, clientType);
      }

      // Calculate metadata
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

      // Calculate adaptive poll interval
      const recommendedPollInterval = this.calculateAdaptivePollInterval(
        filteredChanges.length,
        clientType,
        cursor.lastActiveAt || new Date()
      );

      const response: UserDeltaResponse = {
        hasChanges: filteredChanges.length > 0,
        changes: filteredChanges as DeltaChange[],
        newCursors,
        metadata,
        recommendedPollInterval,
      };

      console.log(
        `📊 Delta response: ${filteredChanges.length} changes, next poll in ${recommendedPollInterval}ms`
      );
      return response;
    } catch (error) {
      console.error("Error getting user deltas:", error);
      throw error;
    }
  }

  /**
   * Get or create user delta cursor (PUBLIC method for router access)
   */
  async getOrCreateUserCursor(userId: string, clientType: "web" | "mobile") {
    const existing = await db
      .select()
      .from(userDeltaCursors)
      .where(eq(userDeltaCursors.userId, userId))
      .limit(1);

    if (existing.length > 0) {
      // Update last active time
      await db
        .update(userDeltaCursors)
        .set({
          lastActiveAt: new Date(),
          clientType,
        })
        .where(eq(userDeltaCursors.userId, userId));

      return existing[0];
    }

    // Create new cursor
    const [newCursor] = await db
      .insert(userDeltaCursors)
      .values({
        userId,
        clientType,
        lastActiveAt: new Date(),
      })
      .returning();

    return newCursor;
  }

  /**
   * Update user cursor timestamps (PUBLIC method for router access)
   */
  async updateUserCursor(
    userId: string,
    cursors: Record<string, Date>,
    clientType: "web" | "mobile"
  ): Promise<void> {
    await db
      .update(userDeltaCursors)
      .set({
        lastELOSync: cursors.lastELOSync,
        lastActivitySync: cursors.lastActivitySync,
        lastSkillRatingSync: cursors.lastSkillRatingSync,
        lastConnectionSync: cursors.lastConnectionSync,
        lastMatchmakingSync: cursors.lastMatchmakingSync,
        lastActiveAt: new Date(),
        clientType,
        updatedAt: new Date(),
      })
      .where(eq(userDeltaCursors.userId, userId));
  }

  /**
   * Helper functions
   */
  private getOldestSyncTime(syncTimestamps: Record<string, Date>): Date {
    const times = Object.values(syncTimestamps).map((d) => d.getTime());
    return new Date(Math.min(...times));
  }

  private getSyncTimeForEntityType(
    entityType:
      | "elo"
      | "activity"
      | "skill_rating"
      | "connection"
      | "matchmaking",
    syncTimestamps: Record<string, Date>
  ): Date {
    const mapping = {
      elo: syncTimestamps.elo,
      activity: syncTimestamps.activity,
      skill_rating: syncTimestamps.skillRating,
      connection: syncTimestamps.connection,
      matchmaking: syncTimestamps.matchmaking,
    };
    return mapping[entityType];
  }

  private hasChangesOfType(changes: any[], entityType: string): boolean {
    return changes.some((c) => c.entityType === entityType);
  }

  /**
   * Calculate adaptive polling interval based on activity
   */
  private calculateAdaptivePollInterval(
    changeCount: number,
    clientType: "web" | "mobile",
    lastActiveAt: Date
  ): number {
    const baseInterval = clientType === "mobile" ? 10000 : 5000; // Mobile polls less frequently
    const now = new Date();
    const timeSinceActive = now.getTime() - (lastActiveAt || now).getTime();
    const hoursInactive = timeSinceActive / (1000 * 60 * 60);

    // High activity = faster polling
    if (changeCount > 5) return Math.max(baseInterval / 2, 2000);
    if (changeCount > 2) return baseInterval;

    // Slow down for inactive users
    if (hoursInactive > 4) return baseInterval * 4; // Every 20s for web, 40s for mobile
    if (hoursInactive > 1) return baseInterval * 2; // Every 10s for web, 20s for mobile

    return baseInterval;
  }

  /**
   * Clean up old delta records (run periodically)
   */
  async cleanupOldDeltas(daysToKeep: number = 7): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const deleted = await db
      .delete(entityChangeLog)
      .where(gte(entityChangeLog.createdAt, cutoffDate));

    console.log(`🧹 Cleaned up delta records older than ${daysToKeep} days`);
  }
}

export const deltaTrackingService = new DeltaTrackingService();
