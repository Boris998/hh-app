// src/services/elo-processing.service.ts - ELO Processing Pipeline & Triggers

import { db } from '../db/client.js';
import { 
  activities, 
  activityParticipants, 
  activityTypes,
  activityELOStatus,
  userActivityTypeELOs,
  userActivitySkillRatings 
} from '../db/schema.js';
import { eq, and, inArray, isNull } from 'drizzle-orm';
import { eloCalculationService, type ELOCalculationResult } from './elo-calc.service.js';

export interface ActivityCompletionData {
  activityId: string;
  results: Array<{
    userId: string;
    finalResult: 'win' | 'loss' | 'draw';
    performanceNotes?: string;
  }>;
  completedBy: string; // User ID of who marked activity complete
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
   * This is called from the enhanced-activities.router.ts completion endpoint
   */
  async onActivityCompletion(completionData: ActivityCompletionData): Promise<ELOCalculationResult[] | null> {
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
      
      // Step 4: Check if activity qualifies for ELO calculation
      const isELOEligible = await this.checkELOEligibility(activityId);
      
      if (!isELOEligible) {
        console.log(`ℹ️  Activity ${activityId} is not eligible for ELO calculation`);
        return null;
      }
      
      // Step 5: Initialize ELO calculation status
      await this.initializeELOStatus(activityId);
      
      // Step 6: Queue ELO calculation (async processing)
      const calculationPromise = this.processELOCalculation(activityId);
      this.processingQueue.set(activityId, calculationPromise);
      
      // Return promise for immediate processing (can be awaited or run in background)
      return await calculationPromise;
      
    } catch (error) {
      console.error(`❌ Failed to process activity completion for ${activityId}:`, error);
      await this.handleProcessingError(activityId, error);
      throw error;
    }
  }

  /**
   * Process ELO calculation with comprehensive error handling
   */
  private async processELOCalculation(activityId: string): Promise<ELOCalculationResult[]> {
    const startTime = Date.now();
    
    try {
      console.log(`🧮 Starting ELO calculation for activity: ${activityId}`);
      
      // Run the ELO calculation
      const results = await eloCalculationService.calculateActivityELO(activityId);
      
      const processingTime = Date.now() - startTime;
      console.log(`⚡ ELO calculation completed in ${processingTime}ms`);
      console.log(`📈 Updated ELO for ${results.length} players`);
      
      // Log summary of changes
      this.logELOChanges(activityId, results);
      
      // Update processing stats
      await this.updateProcessingStats(activityId, results, processingTime, true);
      
      // Clean up processing queue
      this.processingQueue.delete(activityId);
      
      return results;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`💥 ELO calculation failed for ${activityId} after ${processingTime}ms:`, error);
      
      await this.updateProcessingStats(activityId, [], processingTime, false);
      this.processingQueue.delete(activityId);
      
      throw error;
    }
  }

  /**
   * Validate that completion data is correct and complete
   */
  private async validateCompletionData(data: ActivityCompletionData): Promise<void> {
    const { activityId, results } = data;
    
    // Check activity exists and is not already completed
    const [activity] = await db
      .select({
        id: activities.id,
        completionStatus: activities.completionStatus,
        isELORated: activities.isELORated,
        activityTypeId: activities.activityTypeId,
      })
      .from(activities)
      .where(eq(activities.id, activityId))
      .limit(1);

    if (!activity) {
      throw new Error('Activity not found');
    }

    if (activity.completionStatus === 'completed') {
      throw new Error('Activity is already completed');
    }

    // Validate all result participants are actual activity participants
    const participantIds = results.map(r => r.userId);
    const actualParticipants = await db
      .select({ userId: activityParticipants.userId })
      .from(activityParticipants)
      .where(
        and(
          eq(activityParticipants.activityId, activityId),
          eq(activityParticipants.status, 'accepted'),
          inArray(activityParticipants.userId, participantIds)
        )
      );

    if (actualParticipants.length !== participantIds.length) {
      throw new Error('Some result participants are not actual activity participants');
    }

    // Validate result values
    const validResults = ['win', 'loss', 'draw'];
    for (const result of results) {
      if (!validResults.includes(result.finalResult)) {
        throw new Error(`Invalid result value: ${result.finalResult}`);
      }
    }

    // Get activity type to validate result logic
    const [activityType] = await db
      .select({
        teamBased: activityTypes.isSoloPerformable,
        allowDraws: activityTypes.defaultELOSettings,
      })
      .from(activityTypes)
      .where(eq(activityTypes.id, activity.activityTypeId))
      .limit(1);

    if (activityType) {
      const settings = activityType.allowDraws as any;
      const hasDraws = results.some(r => r.finalResult === 'draw');
      
      if (hasDraws && settings?.allowDraws === false) {
        throw new Error('This activity type does not allow draws');
      }
    }
  }

  /**
   * Update participant results in the database
   */
  private async updateParticipantResults(
    activityId: string, 
    results: ActivityCompletionData['results']
  ): Promise<void> {
    console.log(`📝 Updating results for ${results.length} participants`);
    
    await db.transaction(async (tx) => {
      for (const result of results) {
        await tx
          .update(activityParticipants)
          .set({
            finalResult: result.finalResult,
            performanceNotes: result.performanceNotes,
          })
          .where(
            and(
              eq(activityParticipants.activityId, activityId),
              eq(activityParticipants.userId, result.userId)
            )
          );
      }
    });
    
    console.log(`✅ Updated participant results in database`);
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
    
    console.log(`✅ Activity ${activityId} marked as completed`);
  }

  /**
   * Check if activity is eligible for ELO calculation
   */
  private async checkELOEligibility(activityId: string): Promise<boolean> {
    const [activity] = await db
      .select({
        isELORated: activities.isELORated,
        activityTypeId: activities.activityTypeId,
      })
      .from(activities)
      .where(eq(activities.id, activityId))
      .limit(1);

    if (!activity || !activity.isELORated) {
      return false;
    }

    // Check minimum participants
    const participantCount = await db
      .select({ count: activityParticipants.id })
      .from(activityParticipants)
      .where(
        and(
          eq(activityParticipants.activityId, activityId),
          eq(activityParticipants.status, 'accepted')
        )
      );

    if (participantCount.length < 2) {
      console.log(`⚠️  Activity ${activityId} has insufficient participants for ELO`);
      return false;
    }

    // Check if ELO calculation already completed
    const [eloStatus] = await db
      .select({ status: activityELOStatus.status })
      .from(activityELOStatus)
      .where(eq(activityELOStatus.activityId, activityId))
      .limit(1);

    if (eloStatus?.status === 'completed') {
      console.log(`ℹ️  ELO already calculated for activity ${activityId}`);
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
        retryCount: 0,
      })
      .onConflictDoUpdate({
        target: activityELOStatus.activityId,
        set: {
          status: 'pending',
          retryCount: 0,
          errorMessage: null,
        }
      });
  }

  /**
   * Handle processing errors with retry logic
   */
  private async handleProcessingError(activityId: string, error: any): Promise<void> {
    try {
      const [currentStatus] = await db
        .select({
          retryCount: activityELOStatus.retryCount,
          status: activityELOStatus.status,
        })
        .from(activityELOStatus)
        .where(eq(activityELOStatus.activityId, activityId))
        .limit(1);

      const retryCount = (currentStatus?.retryCount || 0) + 1;
      const maxRetries = 3;

      if (retryCount < maxRetries) {
        console.log(`🔄 Scheduling retry ${retryCount}/${maxRetries} for activity ${activityId}`);
        
        await db
          .update(activityELOStatus)
          .set({
            status: 'pending',
            retryCount,
            errorMessage: error.message,
          })
          .where(eq(activityELOStatus.activityId, activityId));

        // Schedule retry with exponential backoff
        const retryDelay = Math.pow(2, retryCount) * 1000; // 2s, 4s, 8s
        setTimeout(() => {
          this.retryELOCalculation(activityId);
        }, retryDelay);
        
      } else {
        console.error(`💀 Max retries exceeded for activity ${activityId}`);
        
        await db
          .update(activityELOStatus)
          .set({
            status: 'error',
            retryCount,
            errorMessage: `Max retries exceeded: ${error.message}`,
          })
          .where(eq(activityELOStatus.activityId, activityId));
      }
    } catch (statusError) {
      console.error(`Failed to update error status for activity ${activityId}:`, statusError);
    }
  }

  /**
   * Retry ELO calculation
   */
  private async retryELOCalculation(activityId: string): Promise<void> {
    try {
      console.log(`🔁 Retrying ELO calculation for activity: ${activityId}`);
      
      // Check if already processed
      if (this.processingQueue.has(activityId)) {
        console.log(`⏸️  ELO calculation already in progress for ${activityId}`);
        return;
      }

      const calculationPromise = this.processELOCalculation(activityId);
      this.processingQueue.set(activityId, calculationPromise);
      
      await calculationPromise;
      
    } catch (error) {
      console.error(`Failed retry for activity ${activityId}:`, error);
      await this.handleProcessingError(activityId, error);
    }
  }

  /**
   * Log ELO changes for debugging and monitoring
   */
  private logELOChanges(activityId: string, results: ELOCalculationResult[]): void {
    console.log(`\n📊 ELO Changes Summary for Activity ${activityId}:`);
    console.log(`${'Player'.padEnd(20)} ${'Old ELO'.padEnd(10)} ${'New ELO'.padEnd(10)} ${'Change'.padEnd(8)} ${'Skill Bonus'.padEnd(12)}`);
    console.log('─'.repeat(70));
    
    for (const result of results) {
      const playerDisplay = result.userId.slice(0, 18).padEnd(20);
      const oldELO = result.oldELO.toString().padEnd(10);
      const newELO = result.newELO.toString().padEnd(10);
      const change = (result.eloChange >= 0 ? '+' : '') + result.eloChange.toString().padEnd(7);
      const skillBonus = (result.skillBonus >= 0 ? '+' : '') + result.skillBonus.toString().padEnd(12);
      
      console.log(`${playerDisplay} ${oldELO} ${newELO} ${change} ${skillBonus}`);
    }
    
    const totalChanges = results.reduce((sum, r) => sum + Math.abs(r.eloChange), 0);
    const avgChange = totalChanges / results.length;
    console.log(`\n📈 Average ELO change: ${avgChange.toFixed(1)} points`);
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
    // In a production system, this would update monitoring/metrics tables
    // For now, just log the stats
    const stats = {
      activityId,
      success,
      processingTime,
      playersAffected: results.length,
      timestamp: new Date(),
    };
    
    console.log(`📊 Processing Stats:`, stats);
    
    // Could store in a separate stats table for monitoring dashboard
    // await db.insert(eloProcessingStats).values(stats);
  }

  /**
   * Get current processing status for an activity
   */
  async getProcessingStatus(activityId: string): Promise<{
    status: string;
    inProgress: boolean;
    error?: string;
    completedAt?: Date;
  }> {
    const [dbStatus] = await db
      .select()
      .from(activityELOStatus)
      .where(eq(activityELOStatus.activityId, activityId))
      .limit(1);

    const inProgress = this.processingQueue.has(activityId);
    
    return {
      status: dbStatus?.status || 'not_started',
      inProgress,
      error: dbStatus?.errorMessage || undefined,
      completedAt: dbStatus?.completedAt || undefined,
    };
  }

  /**
   * Manual trigger for ELO recalculation (admin function)
   */
  async recalculateActivityELO(activityId: string, adminUserId: string): Promise<ELOCalculationResult[]> {
    console.log(`🔧 Manual ELO recalculation triggered by admin ${adminUserId} for activity ${activityId}`);
    
    // Reset ELO status to allow recalculation
    await db
      .update(activityELOStatus)
      .set({
        status: 'pending',
        retryCount: 0,
        errorMessage: null,
        lockedBy: null,
        lockedAt: null,
      })
      .where(eq(activityELOStatus.activityId, activityId));
    
    // Process calculation
    return await this.processELOCalculation(activityId);
  }

  /**
   * Batch process multiple activities (for system maintenance)
   */
  async batchProcessPendingELO(): Promise<ELOProcessingStats> {
    console.log(`🔄 Starting batch processing of pending ELO calculations`);
    
    const pendingActivities = await db
      .select({ activityId: activityELOStatus.activityId })
      .from(activityELOStatus)
      .where(eq(activityELOStatus.status, 'pending'));

    const stats: ELOProcessingStats = {
      totalActivitiesProcessed: pendingActivities.length,
      successfulCalculations: 0,
      failedCalculations: 0,
      averageProcessingTime: 0,
      playersAffected: 0,
    };

    let totalProcessingTime = 0;

    for (const { activityId } of pendingActivities) {
      const startTime = Date.now();
      
      try {
        const results = await this.processELOCalculation(activityId);
        stats.successfulCalculations++;
        stats.playersAffected += results.length;
        
        const processingTime = Date.now() - startTime;
        totalProcessingTime += processingTime;
        
        console.log(`✅ Batch processed activity ${activityId} in ${processingTime}ms`);
        
      } catch (error) {
        stats.failedCalculations++;
        console.error(`❌ Batch processing failed for activity ${activityId}:`, error);
      }
    }

    stats.averageProcessingTime = stats.totalActivitiesProcessed > 0 
      ? totalProcessingTime / stats.totalActivitiesProcessed 
      : 0;

    console.log(`🏁 Batch processing completed:`, stats);
    return stats;
  }

  /**
   * Check for stale ELO calculations and recover
   */
  async recoverStaleCalculations(): Promise<number> {
    const staleTimeout = 10 * 60 * 1000; // 10 minutes
    const staleTimestamp = new Date(Date.now() - staleTimeout);
    
    const staleCalculations = await db
      .select({ activityId: activityELOStatus.activityId })
      .from(activityELOStatus)
      .where(
        and(
          eq(activityELOStatus.status, 'calculating'),
          // lt(activityELOStatus.lockedAt, staleTimestamp) // Uncomment when implementing
        )
      );

    console.log(`🚨 Found ${staleCalculations.length} stale ELO calculations`);

    for (const { activityId } of staleCalculations) {
      console.log(`🔄 Recovering stale calculation for activity ${activityId}`);
      
      await db
        .update(activityELOStatus)
        .set({
          status: 'pending',
          lockedBy: null,
          lockedAt: null,
        })
        .where(eq(activityELOStatus.activityId, activityId));
    }

    return staleCalculations.length;
  }
}

export const eloProcessingService = new ELOProcessingService();