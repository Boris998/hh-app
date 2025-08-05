// src/services/elo-processing.service.ts - Complete ELO Processing with Delta Integration

import { db } from "../db/client.js";
import {
  activities,
  activityParticipants,
  activityTypes,
  activityELOStatus,
  userActivityTypeELOs,
  userActivitySkillRatings,
  users,
} from "../db/schema.js";
import { eq, and, inArray, isNull, sql } from "drizzle-orm";
import { deltaTrackingService } from "./delta-tracking.service.js";
import {
  eloCalculationService,
  type ELOCalculationResult,
} from "./elo-calc.service.js";

export interface ActivityCompletionData {
  activityId: string;
  results: Array<{
    userId: string;
    finalResult: "win" | "loss" | "draw";
    performanceNotes?: string;
  }>;
  completedBy: string;
  completedAt: Date;
}

export interface ELOProcessingStats {
  totalActivitiesProcessed: number;
  successfulCalculations: number;
  failedCalculations: number;
  averageProcessingTime: number;
  playersAffected: number;
}

export class ELOProcessingService {
  private processingQueue: Map<string, Promise<ELOCalculationResult[]>> = new Map();

  /**
   * Main trigger when activity is marked as completed
   * Enhanced with delta tracking
   */
  async onActivityCompletion(
    completionData: ActivityCompletionData
  ): Promise<ELOCalculationResult[] | null> {
    const { activityId, results, completedBy } = completionData;

    console.log(`🏁 Activity completion triggered for: ${activityId}`);
    console.log(`📊 Results for ${results.length} participants`);

    try {
      // Step 1: Validate completion data
      await this.validateCompletionData(completionData);

      // Step 2: Update participant results in database
      await this.updateParticipantResults(activityId, results);

      // Step 3: Mark activity as completed
      await this.markActivityCompleted(activityId, completedBy);

      // Step 4: Log activity completion to delta system
      const participantIds = results.map(r => r.userId);
      await deltaTrackingService.logActivityChange(
        activityId,
        'update',
        participantIds,
        { completionStatus: 'scheduled' },
        { 
          completionStatus: 'completed',
          results: results.map(r => ({ userId: r.userId, result: r.finalResult })),
          completedAt: completionData.completedAt,
          completedBy: completedBy
        },
        completedBy
      );

      // Step 5: Check if activity qualifies for ELO calculation
      const isELOEligible = await this.checkELOEligibility(activityId);

      if (!isELOEligible) {
        console.log(`ℹ️  Activity ${activityId} is not eligible for ELO calculation`);
        return null;
      }

      // Step 6: Initialize ELO calculation status
      await this.initializeELOStatus(activityId);

      // Step 7: Queue ELO calculation (async processing)
      const calculationPromise = this.processELOCalculation(activityId, completedBy);
      this.processingQueue.set(activityId, calculationPromise);

      // Return promise for immediate processing
      return await calculationPromise;
    } catch (error) {
      console.error(`❌ Activity completion failed for ${activityId}:`, error);
      
      // Log error to delta system
      await deltaTrackingService.logActivityChange(
        activityId,
        'update',
        results.map(r => r.userId),
        undefined,
        { 
          completionStatus: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        completedBy
      );
      
      throw error;
    }
  }

  /**
   * Process ELO calculation with comprehensive delta tracking
   */
  private async processELOCalculation(
    activityId: string,
    triggeredBy?: string
  ): Promise<ELOCalculationResult[]> {
    const startTime = Date.now();
    console.log(`🎯 Starting ELO calculation for activity: ${activityId}`);

    try {
      // Step 1: Get activity and participant data
      const activityData = await this.getActivityForELOCalculation(activityId);
      
      // Step 2: Perform ELO calculations
      const eloResults = await eloCalculationService.calculateActivityELO(activityId);
      
      // Step 3: Apply ELO changes to database with delta tracking
      await this.applyELOChangesWithDelta(eloResults, activityId, triggeredBy);

      // Step 4: Log individual skill bonuses if any
      await this.logSkillBonusDeltas(eloResults, activityId, triggeredBy);

      // Step 5: Update processing stats
      const processingTime = Date.now() - startTime;
      await this.updateProcessingStats(activityId, eloResults, processingTime, true);

      // Step 6: Log completion summary to delta system
      const participantIds = eloResults.map(r => r.userId);
      await deltaTrackingService.logActivityChange(
        activityId,
        'update',
        participantIds,
        undefined,
        {
          eloProcessingComplete: true,
          processingTime: processingTime,
          playersAffected: eloResults.length,
          averageELOChange: eloResults.reduce((sum, r) => sum + Math.abs(r.eloChange), 0) / eloResults.length
        },
        triggeredBy
      );

      console.log(`✅ ELO calculation completed for ${activityId} in ${processingTime}ms`);
      this.logELOResults(eloResults);
      
      return eloResults;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      await this.updateProcessingStats(activityId, [], processingTime, false);
      
      // Log error with delta tracking
      const participantIds = await this.getActivityParticipantIds(activityId);
      await deltaTrackingService.logActivityChange(
        activityId,
        'update',
        participantIds,
        undefined,
        {
          eloProcessingError: true,
          error: error instanceof Error ? error.message : 'Unknown error',
          processingTime: processingTime
        },
        triggeredBy
      );
      
      console.error(`❌ ELO calculation failed for ${activityId}:`, error);
      throw error;
    } finally {
      // Remove from processing queue
      this.processingQueue.delete(activityId);
    }
  }

  /**
   * Apply ELO changes with comprehensive delta tracking
   */
  private async applyELOChangesWithDelta(
    eloResults: ELOCalculationResult[],
    activityId: string,
    triggeredBy?: string
  ): Promise<void> {
    console.log(`📈 Applying ${eloResults.length} ELO changes with delta tracking`);

    // Get activity type ID for delta logging
    const activityTypeId = await this.getActivityTypeId(activityId);

    // Use transaction for atomic updates
    await db.transaction(async (tx) => {
      for (const result of eloResults) {
        // Update ELO in database
        await tx
          .update(userActivityTypeELOs)
          .set({
            eloScore: result.newELO,
            gamesPlayed: sql`${userActivityTypeELOs.gamesPlayed} + 1`,
            peakELO: sql`GREATEST(${userActivityTypeELOs.peakELO}, ${result.newELO})`,
            lastUpdated: new Date(),
            version: sql`${userActivityTypeELOs.version} + 1`, // Optimistic locking
          })
          .where(
            and(
              eq(userActivityTypeELOs.userId, result.userId),
              eq(userActivityTypeELOs.activityTypeId, activityTypeId)
            )
          );

        // Log ELO change to delta system with detailed information
        await deltaTrackingService.logELOChange(
          result.userId,
          activityTypeId,
          result.oldELO,
          result.newELO,
          activityId,
          triggeredBy
        );
      }
    });

    console.log(`✅ Applied ${eloResults.length} ELO changes with delta tracking`);
  }

  /**
   * Log skill bonus deltas for transparency
   */
  private async logSkillBonusDeltas(
    eloResults: ELOCalculationResult[],
    activityId: string,
    triggeredBy?: string
  ): Promise<void> {
    for (const result of eloResults) {
      if (result.skillBonus !== 0) {
        await deltaTrackingService.logChange({
          entityType: 'elo',
          entityId: `${result.userId}-skill-bonus`,
          changeType: 'create',
          affectedUserId: result.userId,
          relatedEntityId: activityId,
          newData: {
            skillBonus: result.skillBonus,
            reason: result.reason,
            baseELOChange: result.eloChange - result.skillBonus,
            totalELOChange: result.eloChange
          },
          changeDetails: {
            activityId,
            expectedScore: result.expectedScore,
            actualScore: result.actualScore,
            kFactor: result.kFactor
          },
          triggeredBy,
          changeSource: 'system'
        });
      }
    }
  }

  /**
   * Get activity participant IDs (helper method)
   */
  private async getActivityParticipantIds(activityId: string): Promise<string[]> {
    const participants = await db
      .select({ userId: activityParticipants.userId })
      .from(activityParticipants)
      .where(
        and(
          eq(activityParticipants.activityId, activityId),
          eq(activityParticipants.status, 'accepted')
        )
      );
    
    return participants.map(p => p.userId);
  }

  /**
   * Helper method to get activity type ID
   */
  private async getActivityTypeId(activityId: string): Promise<string> {
    const [activity] = await db
      .select({ activityTypeId: activities.activityTypeId })
      .from(activities)
      .where(eq(activities.id, activityId))
      .limit(1);
    
    if (!activity) {
      throw new Error(`Activity ${activityId} not found`);
    }
    
    return activity.activityTypeId;
  }

  /**
   * Get activity data for ELO calculation
   */
  private async getActivityForELOCalculation(activityId: string) {
    const [activity] = await db
      .select({
        id: activities.id,
        activityTypeId: activities.activityTypeId,
        isELORated: activities.isELORated,
        completionStatus: activities.completionStatus,
        description: activities.description,
      })
      .from(activities)
      .where(eq(activities.id, activityId))
      .limit(1);

    if (!activity) {
      throw new Error(`Activity ${activityId} not found`);
    }

    if (!activity.isELORated) {
      throw new Error(`Activity ${activityId} is not ELO-rated`);
    }

    if (activity.completionStatus !== 'completed') {
      throw new Error(`Activity ${activityId} is not completed`);
    }

    return activity;
  }

  /**
   * Validate completion data thoroughly
   */
  private async validateCompletionData(data: ActivityCompletionData): Promise<void> {
    const { activityId, results, completedBy } = data;

    // Check if activity exists
    const [activity] = await db
      .select({
        id: activities.id,
        creatorId: activities.creatorId,
        completionStatus: activities.completionStatus,
      })
      .from(activities)
      .where(eq(activities.id, activityId))
      .limit(1);

    if (!activity) {
      throw new Error(`Activity ${activityId} not found`);
    }

    if (activity.completionStatus === 'completed') {
      throw new Error(`Activity ${activityId} is already completed`);
    }

    // Check if completedBy user has permission (creator or participant)
    const isCreator = activity.creatorId === completedBy;
    
    if (!isCreator) {
      const [participant] = await db
        .select()
        .from(activityParticipants)
        .where(
          and(
            eq(activityParticipants.activityId, activityId),
            eq(activityParticipants.userId, completedBy),
            eq(activityParticipants.status, 'accepted')
          )
        )
        .limit(1);

      if (!participant) {
        throw new Error(`User ${completedBy} does not have permission to complete this activity`);
      }
    }

    // Check if all result users are participants
    const participantIds = results.map(r => r.userId);
    const participants = await db
      .select({ userId: activityParticipants.userId })
      .from(activityParticipants)
      .where(
        and(
          eq(activityParticipants.activityId, activityId),
          inArray(activityParticipants.userId, participantIds),
          eq(activityParticipants.status, 'accepted')
        )
      );

    if (participants.length !== participantIds.length) {
      const missingUsers = participantIds.filter(
        id => !participants.some(p => p.userId === id)
      );
      throw new Error(`Users not found as accepted participants: ${missingUsers.join(', ')}`);
    }

    // Validate result values
    const validResults = ['win', 'loss', 'draw'];
    const invalidResults = results.filter(r => !validResults.includes(r.finalResult));
    
    if (invalidResults.length > 0) {
      throw new Error(`Invalid results: ${invalidResults.map(r => r.finalResult).join(', ')}`);
    }

    // Validate result distribution (basic logic)
    const wins = results.filter(r => r.finalResult === 'win').length;
    const losses = results.filter(r => r.finalResult === 'loss').length;
    const draws = results.filter(r => r.finalResult === 'draw').length;

    if (draws > 0 && (wins > 0 || losses > 0)) {
      throw new Error('Cannot have draws mixed with wins/losses');
    }

    if (draws === 0 && wins === 0) {
      throw new Error('Must have at least one winner');
    }
  }

  /**
   * Update participant results in database
   */
  private async updateParticipantResults(
    activityId: string,
    results: Array<{ userId: string; finalResult: string; performanceNotes?: string }>
  ): Promise<void> {
    console.log(`📝 Updating results for ${results.length} participants`);

    for (const result of results) {
      await db
        .update(activityParticipants)
        .set({
          finalResult: result.finalResult as any,
          performanceNotes: result.performanceNotes,
        })
        .where(
          and(
            eq(activityParticipants.activityId, activityId),
            eq(activityParticipants.userId, result.userId)
          )
        );
    }

    console.log(`✅ Updated participant results`);
  }

  /**
   * Mark activity as completed
   */
  private async markActivityCompleted(activityId: string, completedBy: string): Promise<void> {
    await db
      .update(activities)
      .set({
        completionStatus: 'completed',
        updatedAt: new Date(),
      })
      .where(eq(activities.id, activityId));

    console.log(`✅ Activity ${activityId} marked as completed by ${completedBy}`);
  }

  /**
   * Check if activity is eligible for ELO calculation
   */
  private async checkELOEligibility(activityId: string): Promise<boolean> {
    const [activity] = await db
      .select({
        isELORated: activities.isELORated,
        completionStatus: activities.completionStatus,
        activityTypeId: activities.activityTypeId,
      })
      .from(activities)
      .where(eq(activities.id, activityId))
      .limit(1);

    if (!activity) {
      console.log(`❌ Activity ${activityId} not found`);
      return false;
    }
    
    if (!activity.isELORated) {
      console.log(`ℹ️  Activity ${activityId} is not ELO-rated`);
      return false;
    }
    
    if (activity.completionStatus !== 'completed') {
      console.log(`ℹ️  Activity ${activityId} is not completed`);
      return false;
    }

    // Check minimum participants
    const participantCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(activityParticipants)
      .where(
        and(
          eq(activityParticipants.activityId, activityId),
          eq(activityParticipants.status, 'accepted')
        )
      );

    if (participantCount[0].count < 2) {
      console.log(`ℹ️  Activity ${activityId} has insufficient participants (${participantCount[0].count})`);
      return false;
    }

    // Check activity type ELO settings
    const [activityType] = await db
      .select({
        defaultELOSettings: activityTypes.defaultELOSettings,
      })
      .from(activityTypes)
      .where(eq(activityTypes.id, activity.activityTypeId))
      .limit(1);

    if (!activityType?.defaultELOSettings) {
      console.log(`ℹ️  Activity type has no ELO settings configured`);
      return false;
    }

    return true;
  }

  /**
   * Initialize ELO calculation status
   */
  private async initializeELOStatus(activityId: string): Promise<void> {
    await db
      .insert(activityELOStatus)
      .values({
        activityId,
        status: 'pending',
        lockedBy: `server-${process.pid}`,
        lockedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: activityELOStatus.activityId,
        set: {
          status: 'pending',
          lockedBy: `server-${process.pid}`,
          lockedAt: new Date(),
          retryCount: sql`${activityELOStatus.retryCount} + 1`,
          errorMessage: null,
        },
      });

    console.log(`🔒 ELO calculation status initialized for ${activityId}`);
  }

  /**
   * Log ELO calculation results in a readable format
   */
  private logELOResults(results: ELOCalculationResult[]): void {
    if (results.length === 0) {
      console.log('📊 No ELO changes to display');
      return;
    }

    console.log('\n📊 ELO CALCULATION RESULTS:');
    console.log('─'.repeat(80));
    console.log('Player'.padEnd(20) + 'Old ELO'.padEnd(10) + 'New ELO'.padEnd(10) + 'Change'.padEnd(8) + 'Skill Bonus'.padEnd(12) + 'Reason');
    console.log('─'.repeat(80));

    for (const result of results) {
      const playerDisplay = result.userId.substring(0, 18).padEnd(20);
      const oldELO = result.oldELO.toString().padEnd(10);
      const newELO = result.newELO.toString().padEnd(10);
      const change = (result.eloChange >= 0 ? "+" : "") + result.eloChange.toString().padEnd(7);
      const skillBonus = (result.skillBonus >= 0 ? "+" : "") + result.skillBonus.toString().padEnd(12);
      const reason = result.reason.substring(0, 30);

      console.log(`${playerDisplay} ${oldELO} ${newELO} ${change} ${skillBonus} ${reason}`);
    }

    const totalChanges = results.reduce((sum, r) => sum + Math.abs(r.eloChange), 0);
    const avgChange = totalChanges / results.length;
    console.log('─'.repeat(80));
    console.log(`📈 Average ELO change: ${avgChange.toFixed(1)} points`);
    console.log(`🎯 Players affected: ${results.length}`);
  }

  /**
   * Update processing statistics for monitoring
   */
  private async updateProcessingStats(
    activityId: string,
    results: ELOCalculationResult[],
    processingTime: number,
    success: boolean
  ): Promise<void> {
    try {
      if (success) {
        await db
          .update(activityELOStatus)
          .set({
            status: 'completed',
            completedAt: new Date(),
            errorMessage: null,
            lockedBy: null,
            lockedAt: null,
          })
          .where(eq(activityELOStatus.activityId, activityId));

        console.log(`📊 ELO calculation completed successfully for activity ${activityId}`);
        console.log(`⚡ Processing time: ${processingTime}ms`);
        console.log(`👥 Players affected: ${results.length}`);

        if (results.length > 0) {
          const avgChange = results.reduce((sum, r) => sum + Math.abs(r.eloChange), 0) / results.length;
          console.log(`📈 Average ELO change: ${avgChange.toFixed(1)} points`);
        }
      } else {
        await db
          .update(activityELOStatus)
          .set({
            status: 'error',
            errorMessage: 'ELO calculation failed',
            retryCount: sql`${activityELOStatus.retryCount} + 1`,
            lockedBy: null,
            lockedAt: null,
          })
          .where(eq(activityELOStatus.activityId, activityId));

        console.log(`❌ ELO calculation failed for activity ${activityId}`);
        console.log(`⏱️  Failed after: ${processingTime}ms`);
      }
    } catch (error) {
      console.error(`Failed to update processing stats for activity ${activityId}:`, error);
    }
  }

  /**
   * Get current processing status for an activity
   */
  async getProcessingStatus(activityId: string): Promise<{
    status: string;
    inProgress: boolean;
    error?: string;
    completedAt?: Date;
    processingTime?: number;
    retryCount?: number;
  }> {
    const [status] = await db
      .select()
      .from(activityELOStatus)
      .where(eq(activityELOStatus.activityId, activityId))
      .limit(1);

    if (!status) {
      return { status: 'not_started', inProgress: false };
    }

    const processingTime = status.completedAt && status.lockedAt ? 
      status.completedAt.getTime() - status.lockedAt.getTime() : undefined;

    return {
      status: status.status,
      inProgress: ['pending', 'calculating'].includes(status.status),
      error: status.errorMessage || undefined,
      completedAt: status.completedAt || undefined,
      processingTime,
      retryCount: status.retryCount || undefined,
    };
  }

  /**
   * Manual ELO recalculation (admin function)
   */
  async recalculateActivityELO(
    activityId: string,
    adminUserId: string
  ): Promise<ELOCalculationResult[]> {
    console.log(`🔧 Manual ELO recalculation for ${activityId} by admin ${adminUserId}`);

    // Reset ELO status
    await db
      .update(activityELOStatus)
      .set({
        status: 'pending',
        lockedBy: `admin-${adminUserId}`,
        lockedAt: new Date(),
        errorMessage: null,
        retryCount: 0,
      })
      .where(eq(activityELOStatus.activityId, activityId));

    // Process ELO calculation
    return await this.processELOCalculation(activityId, adminUserId);
  }

  /**
   * Batch process multiple activities (for bulk operations)
   */
  async batchProcessActivities(activityIds: string[], adminUserId: string): Promise<{
    successful: string[];
    failed: Array<{ activityId: string; error: string }>;
  }> {
    console.log(`🔄 Batch processing ${activityIds.length} activities`);
    
    const successful: string[] = [];
    const failed: Array<{ activityId: string; error: string }> = [];

    for (const activityId of activityIds) {
      try {
        await this.recalculateActivityELO(activityId, adminUserId);
        successful.push(activityId);
      } catch (error) {
        failed.push({
          activityId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    console.log(`✅ Batch processing complete: ${successful.length} successful, ${failed.length} failed`);
    return { successful, failed };
  }

  /**
   * Get processing queue status (for monitoring)
   */
  getQueueStatus(): {
    queueSize: number;
    processingActivities: string[];
  } {
    return {
      queueSize: this.processingQueue.size,
      processingActivities: Array.from(this.processingQueue.keys()),
    };
  }

  /**
   * Clean up stale ELO processing locks (run periodically)
   */
  async cleanupStaleLocks(maxAgeMinutes: number = 10): Promise<number> {
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - maxAgeMinutes);

    const result = await db
      .update(activityELOStatus)
      .set({
        status: 'error',
        errorMessage: 'Processing timeout - lock cleared',
        lockedBy: null,
        lockedAt: null,
      })
      .where(
        and(
          eq(activityELOStatus.status, 'pending'),
          sql`${activityELOStatus.lockedAt} < ${cutoffTime}`
        )
      ).returning({ count: sql<number>`count(*)` });

      const affectedRows = result[0]?.count || 0;
    console.log(`🧹 Cleaned up stale ELO processing locks`);
    return affectedRows;
  }
}

export const eloProcessingService = new ELOProcessingService();