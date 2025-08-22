// src/services/elo-processing.service.ts - Complete ELO Processing with zod validation
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  activities,
  activityELOStatus,
  activityParticipants,
  userActivityTypeELOs,
} from "../db/schema.js";
import {
  insertUserActivityTypeELOSchema,
  selectActivitySchema,
  selectUserActivityTypeELOSchema,
  updateUserActivityTypeELOSchema,
  type Activity,
  type InsertUserActivityTypeELO,
  type UpdateUserActivityTypeELO,
} from "../db/zod.schema.js";
import { deltaTrackingService } from "./delta-tracking.service.js";
import {
  eloCalculationService,
  type ELOCalculationResult,
} from "./elo-calc.service.js";
import type { ELOSimulationParams, ELOSimulationResult } from "./interfaces.js";

export interface ActivityCompletionData {
  activityId: string;
  results: Array<{
    userId: string;
    finalResult: "win" | "loss" | "draw";
    performanceNotes?: string;
  }>;
}

interface ELOProcessingResult {
  success: boolean;
  activityId: string;
  participantsProcessed: number;
  // Add the missing property definition:
  eloChanges: Array<{
    userId: string;
    oldELO: number;
    newELO: number;
    change: number;
  }>;
  participantUpdates?: Array<{
    userId: string;
    oldELO: number;
    newELO: number;
    change: number;
    skillBonus: number;
    reason: string;
  }>;
  processingTime?: number;
  // Keep any existing properties like 'error'
  error?: string;
}

export class ELOProcessingService {
  private processingQueue = new Set<string>();
  private readonly maxConcurrentProcessing = 3;

  /**
   * Main entry point: Process ELO changes when an activity is completed
   */
  async onActivityCompletion(
    completionData: ActivityCompletionData
  ): Promise<ELOProcessingResult> {
    const { activityId, results } = completionData;
    const startTime = Date.now();

    // Prevent duplicate processing
    if (this.processingQueue.has(activityId)) {
      throw new Error(
        `ELO processing already in progress for activity ${activityId}`
      );
    }

    // Check concurrent processing limit
    if (this.processingQueue.size >= this.maxConcurrentProcessing) {
      throw new Error("Maximum concurrent ELO processing limit reached");
    }

    this.processingQueue.add(activityId);

    try {
      console.log(`🎯 Starting ELO processing for activity: ${activityId}`);

      // Step 1: Acquire processing lock
      const lockAcquired = await this.acquireELOLock(activityId);
      if (!lockAcquired) {
        throw new Error("Failed to acquire ELO processing lock");
      }

      // Step 2: Validate activity and get data
      const activityData = await this.getValidatedActivityData(activityId);
      if (!activityData.isELORated) {
        throw new Error("Activity is not ELO-rated");
      }

      // Step 3: Get participants with current ELO ratings
      const participants = await this.getParticipantsWithELO(
        activityId,
        activityData.activityTypeId
      );

      // Step 4: Validate completion results
      this.validateCompletionResults(results, participants);

      // Step 5: Update participant results in database
      await this.updateParticipantResults(activityId, results);

      // Step 6: Perform ELO calculations using the complex engine
      const eloResults = await eloCalculationService.calculateActivityELO(
        activityId
      );

      // Step 7: Apply ELO changes with validation
      const participantUpdates = await this.applyELOChangesWithValidation(
        eloResults,
        activityId,
        activityData.activityTypeId
      );

      // Step 8: Mark processing as completed
      await this.completeELOProcessing(activityId);

      const processingTime = Date.now() - startTime;

      // Step 9: Log success with delta tracking
      await this.logProcessingSuccess(
        activityId,
        participantUpdates,
        processingTime
      );

      console.log(
        `✅ ELO processing completed for ${activityId} in ${processingTime}ms`
      );
      this.logELOResults(participantUpdates);
      const eloChanges = participantUpdates.map((u) => ({
        userId: u.userId,
        oldELO: u.oldELO,
        newELO: u.newELO,
        change: u.change,
      }));

      return {
        success: true,
        activityId,
        participantsProcessed: participantUpdates.length, // Add this
        eloChanges, // Add this
        participantUpdates, // Optional, but include if you want the detailed data
        processingTime, // Optional, but include if you want the time
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ ELO processing failed for ${activityId}:`, error);

      await this.markELOProcessingError(
        activityId,
        error instanceof Error ? error.message : "Unknown error"
      );

      await this.logProcessingError(activityId, error, processingTime);

      return {
        success: false,
        activityId,
        participantsProcessed: 0, // Add this
        eloChanges: [], // Add this
        participantUpdates: [], // Optional: explicitly show empty
        processingTime, // Optional: include time even for errors
        error: error instanceof Error ? error.message : "Unknown error",
      };
    } finally {
      this.processingQueue.delete(activityId);
    }
  }

  // Add the missing methods to the existing ELOProcessingService class

  async simulateELOChanges(
    params: ELOSimulationParams
  ): Promise<ELOSimulationResult> {
    console.log(`📊 Simulating ELO changes for activity: ${params.activityId}`);

    // TODO: Implement actual ELO simulation logic
    // This is a placeholder implementation for now
    const simulatedChanges = params.participants.map((participant: any) => {
      const baseChange = 10; // Placeholder calculation
      const variation = Math.random() * 20 - 10; // ±10 variation
      const change = Math.round(baseChange + variation);

      return {
        userId: participant.userId,
        username: participant.username,
        currentELO: participant.currentELO,
        newELO: participant.currentELO + change,
        change: change,
        explanation: `Simulated change based on ${
          params.results.find((r: any) => r.userId === participant.userId)
            ?.expectedResult || "participation"
        }`,
      };
    });

    return {
      success: true,
      participants: simulatedChanges,
      summary: {
        totalELOChange: simulatedChanges.reduce(
          (sum: number, p: any) => sum + p.change,
          0
        ),
        averageChange:
          simulatedChanges.reduce((sum: number, p: any) => sum + p.change, 0) /
          simulatedChanges.length,
        largestGain: Math.max(...simulatedChanges.map((p: any) => p.change)),
        largestLoss: Math.min(...simulatedChanges.map((p: any) => p.change)),
      },
    };
  }

  async reprocessActivity(activityId: string): Promise<ELOProcessingResult> {
    console.log(`🔄 Reprocessing ELO for activity: ${activityId}`);

    try {
      // 1. Get the activity and participants with results
      const activity = await db.query.activities.findFirst({
        where: eq(activities.id, activityId),
        with: {
          activityType: true,
        },
      });

      if (
        !activity ||
        !activity.isELORated ||
        activity.completionStatus !== "completed"
      ) {
        return {
          success: false,
          activityId,
          participantsProcessed: 0,
          eloChanges: [],
          error: "Activity not found, not ELO-rated, or not completed",
        };
      }

      // 2. Get participants with their final results
      const participants = await db
        .select({
          userId: activityParticipants.userId,
          finalResult: activityParticipants.finalResult,
          currentELO: userActivityTypeELOs.eloScore,
          gamesPlayed: userActivityTypeELOs.gamesPlayed,
        })
        .from(activityParticipants)
        .leftJoin(
          userActivityTypeELOs,
          and(
            eq(userActivityTypeELOs.userId, activityParticipants.userId),
            eq(userActivityTypeELOs.activityTypeId, activity.activityTypeId)
          )
        )
        .where(
          and(
            eq(activityParticipants.activityId, activityId),
            eq(activityParticipants.status, "accepted")
          )
        );

      if (participants.length === 0) {
        return {
          success: false,
          activityId,
          participantsProcessed: 0,
          eloChanges: [],
          error: "No participants with results found",
        };
      }

      // 3. Recalculate ELO changes (simplified algorithm)
      const eloChanges = [];
      const kFactor = 32; // Standard K-factor

      for (const participant of participants) {
        const currentELO = participant.currentELO || 1200;
        const games = participant.gamesPlayed || 0;

        // Simple ELO calculation based on result
        let scoreMultiplier = 0.5; // Draw default
        if (participant.finalResult === "win") scoreMultiplier = 1.0;
        if (participant.finalResult === "loss") scoreMultiplier = 0.0;

        // Expected score (simplified - in real implementation would compare against opponents)
        const expectedScore = 0.5;
        const actualScore = scoreMultiplier;

        const change = Math.round(kFactor * (actualScore - expectedScore));
        const newELO = currentELO + change;

        // 4. Update the database
        await db
          .insert(userActivityTypeELOs)
          .values({
            userId: participant.userId,
            activityTypeId: activity.activityTypeId,
            eloScore: newELO,
            gamesPlayed: games + 1,
            peakELO: Math.max(currentELO, newELO),
            lastUpdated: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              userActivityTypeELOs.userId,
              userActivityTypeELOs.activityTypeId,
            ],
            set: {
              eloScore: newELO,
              gamesPlayed: games + 1,
              peakELO: sql`GREATEST(${userActivityTypeELOs.peakELO}, ${newELO})`,
              lastUpdated: new Date(),
              version: sql`${userActivityTypeELOs.version} + 1`,
            },
          });

        eloChanges.push({
          userId: participant.userId,
          oldELO: currentELO,
          newELO,
          change,
        });
      }

      // Mark ELO processing as completed
      await db
        .update(activityELOStatus)
        .set({
          status: "completed",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(activityELOStatus.activityId, activityId));

      return {
        success: true,
        activityId,
        participantsProcessed: participants.length,
        eloChanges,
      };
    } catch (error) {
      console.error("Error reprocessing ELO:", error);
      return {
        success: false,
        activityId,
        participantsProcessed: 0,
        eloChanges: [],
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get validated activity data
   */
  private async getValidatedActivityData(
    activityId: string
  ): Promise<Activity> {
    const activity = await db.query.activities.findFirst({
      where: eq(activities.id, activityId),
    });

    if (!activity) {
      throw new Error("Activity not found");
    }

    // Validate with zod schema
    return selectActivitySchema.parse(activity);
  }

  /**
   * Get participants with their current ELO ratings, creating records if needed
   */
  private async getParticipantsWithELO(
    activityId: string,
    activityTypeId: string
  ) {
    const participantsQuery = await db
      .select({
        userId: activityParticipants.userId,
        status: activityParticipants.status,
        team: activityParticipants.team,
        finalResult: activityParticipants.finalResult,
        currentELO: userActivityTypeELOs.eloScore,
        gamesPlayed: userActivityTypeELOs.gamesPlayed,
        peakELO: userActivityTypeELOs.peakELO,
        volatility: userActivityTypeELOs.volatility,
        version: userActivityTypeELOs.version,
        seasonELO: userActivityTypeELOs.seasonELO,
        lastUpdated: userActivityTypeELOs.lastUpdated,
      })
      .from(activityParticipants)
      .leftJoin(
        userActivityTypeELOs,
        and(
          eq(activityParticipants.userId, userActivityTypeELOs.userId),
          eq(userActivityTypeELOs.activityTypeId, activityTypeId)
        )
      )
      .where(
        and(
          eq(activityParticipants.activityId, activityId),
          eq(activityParticipants.status, "accepted")
        )
      );

    // Ensure all participants have ELO records
    const participantsWithELO = [];

    for (const participant of participantsQuery) {
      if (participant.currentELO === null) {
        // Create initial ELO record for new participants
        const initialELOData: InsertUserActivityTypeELO = {
          userId: participant.userId,
          activityTypeId,
          eloScore: 1200, // Default starting ELO
          gamesPlayed: 0,
          peakELO: 1200,
          volatility: 50, // High volatility for new players
          version: 1,
          seasonELO: null,
        };

        const validatedELO =
          insertUserActivityTypeELOSchema.parse(initialELOData);

        const [newELO] = await db
          .insert(userActivityTypeELOs)
          .values(validatedELO)
          .returning();

        // Validate the returned ELO record
        const validatedNewELO = selectUserActivityTypeELOSchema.parse(newELO);

        participantsWithELO.push({
          ...participant,
          currentELO: validatedNewELO.eloScore,
          gamesPlayed: validatedNewELO.gamesPlayed,
          peakELO: validatedNewELO.peakELO,
          volatility: validatedNewELO.volatility,
          version: validatedNewELO.version,
          seasonELO: validatedNewELO.seasonELO,
          lastUpdated: validatedNewELO.lastUpdated,
        });
      } else {
        participantsWithELO.push(participant);
      }
    }

    return participantsWithELO;
  }

  /**
   * Validate completion results match participants
   */
  private validateCompletionResults(
    results: ActivityCompletionData["results"],
    participants: any[]
  ) {
    const participantIds = participants.map((p) => p.userId);
    const resultIds = results.map((r) => r.userId);

    // Check all participants have results
    const missingResults = participantIds.filter(
      (id) => !resultIds.includes(id)
    );
    if (missingResults.length > 0) {
      throw new Error(
        `Missing results for participants: ${missingResults.join(", ")}`
      );
    }

    // Check no extra results
    const extraResults = resultIds.filter((id) => !participantIds.includes(id));
    if (extraResults.length > 0) {
      throw new Error(
        `Results provided for non-participants: ${extraResults.join(", ")}`
      );
    }

    // Validate result values
    const validResults = ["win", "loss", "draw"];
    for (const result of results) {
      if (!validResults.includes(result.finalResult)) {
        throw new Error(
          `Invalid result '${result.finalResult}' for user ${result.userId}`
        );
      }
    }
  }

  /**
   * Update participant results in the database
   */
  private async updateParticipantResults(
    activityId: string,
    results: ActivityCompletionData["results"]
  ): Promise<void> {
    for (const result of results) {
      await db
        .update(activityParticipants)
        .set({
          finalResult: result.finalResult,
          performanceNotes: result.performanceNotes || null,
        })
        .where(
          and(
            eq(activityParticipants.activityId, activityId),
            eq(activityParticipants.userId, result.userId)
          )
        );
    }
  }

  /**
   * Apply ELO changes with proper validation and delta tracking
   */
  private async applyELOChangesWithValidation(
    eloResults: ELOCalculationResult[],
    activityId: string,
    activityTypeId: string
  ) {
    const participantUpdates = [];

    for (const result of eloResults) {
      const oldELO = result.oldELO;
      const newELO = result.newELO;
      const change = result.eloChange;

      // Get current ELO record for optimistic locking
      const currentRecord = await db.query.userActivityTypeELOs.findFirst({
        where: and(
          eq(userActivityTypeELOs.userId, result.userId),
          eq(userActivityTypeELOs.activityTypeId, activityTypeId)
        ),
      });

      if (!currentRecord) {
        throw new Error(`ELO record not found for user ${result.userId}`);
      }

      // Prepare update data with validation
      const updateData: UpdateUserActivityTypeELO = {
        eloScore: newELO,
        gamesPlayed: currentRecord.gamesPlayed + 1,
        lastUpdated: new Date(),
        peakELO: Math.max(currentRecord.peakELO || oldELO, newELO),
        volatility: Math.max((currentRecord.volatility || 50) - 1, 10), // Decrease volatility over time
        version: (currentRecord.version || 0) + 1, // Optimistic locking
      };

      // Validate update data with zod
      const validatedUpdate = updateUserActivityTypeELOSchema.parse(updateData);

      // Apply update with optimistic locking check
      const whereConditions = [
        eq(userActivityTypeELOs.userId, result.userId),
        eq(userActivityTypeELOs.activityTypeId, activityTypeId),
      ];

      // Add version check only if version exists and is not null
      if (
        currentRecord.version !== null &&
        currentRecord.version !== undefined
      ) {
        whereConditions.push(
          eq(userActivityTypeELOs.version, currentRecord.version)
        );
      }

      const updateResult = await db
        .update(userActivityTypeELOs)
        .set(validatedUpdate)
        .where(and(...whereConditions))
        .returning();

      if (updateResult.length === 0) {
        throw new Error(
          `Failed to update ELO record for user ${result.userId} - possible concurrent modification`
        );
      }

      // Log ELO change for delta tracking
      await deltaTrackingService.logELOChange(
        result.userId,
        activityTypeId,
        oldELO,
        newELO,
        activityId,
        "system"
      );

      participantUpdates.push({
        userId: result.userId,
        oldELO,
        newELO,
        change,
        skillBonus: result.skillBonus || 0,
        reason: result.reason || "ELO calculation",
      });
    }

    return participantUpdates;
  }

  /**
   * Acquire processing lock with timeout handling
   */
  private async acquireELOLock(activityId: string): Promise<boolean> {
    const serverId = process.env.SERVER_ID || "system";
    const lockTimeout = 5 * 60 * 1000; // 5 minutes
    const now = new Date();

    try {
      // Check existing status
      const existing = await db.query.activityELOStatus.findFirst({
        where: eq(activityELOStatus.activityId, activityId),
      });

      if (existing) {
        if (existing.status === "completed") {
          throw new Error("ELO already processed for this activity");
        }
        if (existing.status === "calculating") {
          // Check if lock is stale
          const lockAge = existing.lockedAt
            ? now.getTime() - existing.lockedAt.getTime()
            : 0;
          if (lockAge < lockTimeout) {
            return false; // Still locked
          }
        }
      }

      // Acquire or update lock
      await db
        .insert(activityELOStatus)
        .values({
          activityId,
          status: "calculating",
          lockedBy: serverId,
          lockedAt: now,
        })
        .onConflictDoUpdate({
          target: activityELOStatus.activityId,
          set: {
            status: "calculating",
            lockedBy: serverId,
            lockedAt: now,
            errorMessage: null,
          },
        });

      return true;
    } catch (error) {
      console.error("Failed to acquire ELO lock:", error);
      return false;
    }
  }

  /**
   * Mark ELO processing as completed
   */
  private async completeELOProcessing(activityId: string): Promise<void> {
    await db
      .update(activityELOStatus)
      .set({
        status: "completed",
        completedAt: new Date(),
        lockedBy: null,
        lockedAt: null,
        errorMessage: null,
      })
      .where(eq(activityELOStatus.activityId, activityId));
  }

  /**
   * Mark ELO processing as failed
   */
  private async markELOProcessingError(
    activityId: string,
    errorMessage: string
  ): Promise<void> {
    await db
      .update(activityELOStatus)
      .set({
        status: "error",
        errorMessage,
        lockedBy: null,
        lockedAt: null,
        retryCount: sql`${activityELOStatus.retryCount} + 1`,
      })
      .where(eq(activityELOStatus.activityId, activityId));
  }

  /**
   * Log successful processing with delta tracking
   */
  private async logProcessingSuccess(
    activityId: string,
    participantUpdates: any[],
    processingTime: number
  ): Promise<void> {
    const participantIds = participantUpdates.map((u) => u.userId);

    await deltaTrackingService.logActivityChange(
      activityId,
      "update",
      participantIds,
      undefined,
      {
        eloProcessingComplete: true,
        processingTime,
        playersAffected: participantUpdates.length,
        averageELOChange:
          participantUpdates.reduce((sum, u) => sum + Math.abs(u.change), 0) /
          participantUpdates.length,
        totalELOChange: participantUpdates.reduce(
          (sum, u) => sum + u.change,
          0
        ),
      },
      "system"
    );
  }

  /**
   * Log processing error with delta tracking
   */
  private async logProcessingError(
    activityId: string,
    error: any,
    processingTime: number
  ): Promise<void> {
    const participantIds = await this.getActivityParticipantIds(activityId);

    await deltaTrackingService.logActivityChange(
      activityId,
      "update",
      participantIds,
      undefined,
      {
        eloProcessingError: true,
        error: error instanceof Error ? error.message : "Unknown error",
        processingTime,
      },
      "system"
    );
  }

  /**
   * Get participant IDs for an activity
   */
  private async getActivityParticipantIds(
    activityId: string
  ): Promise<string[]> {
    const participants = await db
      .select({ userId: activityParticipants.userId })
      .from(activityParticipants)
      .where(eq(activityParticipants.activityId, activityId));

    return participants.map((p) => p.userId);
  }

  /**
   * Log ELO results for debugging
   */
  private logELOResults(participantUpdates: any[]): void {
    console.log("🏆 ELO PROCESSING RESULTS");
    console.log("─".repeat(80));
    console.log(
      "Player".padEnd(20) +
        "Old ELO".padEnd(10) +
        "New ELO".padEnd(10) +
        "Change".padEnd(8) +
        "Skill Bonus".padEnd(12) +
        "Reason"
    );
    console.log("─".repeat(80));

    for (const result of participantUpdates) {
      const playerDisplay = result.userId.substring(0, 18).padEnd(20);
      const oldELO = result.oldELO.toString().padEnd(10);
      const newELO = result.newELO.toString().padEnd(10);
      const change =
        (result.change >= 0 ? "+" : "") + result.change.toString().padEnd(7);
      const skillBonus =
        (result.skillBonus >= 0 ? "+" : "") +
        result.skillBonus.toString().padEnd(12);
      const reason = result.reason.substring(0, 30);

      console.log(
        `${playerDisplay} ${oldELO} ${newELO} ${change} ${skillBonus} ${reason}`
      );
    }

    const totalChanges = participantUpdates.reduce(
      (sum, r) => sum + Math.abs(r.change),
      0
    );
    const avgChange = totalChanges / participantUpdates.length;
    console.log("─".repeat(80));
    console.log(`📈 Average ELO change: ${avgChange.toFixed(1)} points`);
    console.log(`🎯 Players affected: ${participantUpdates.length}`);
  }

  /**
   * Get ELO processing status for an activity
   */
  async getELOProcessingStatus(activityId: string) {
    return await db.query.activityELOStatus.findFirst({
      where: eq(activityELOStatus.activityId, activityId),
    });
  }

  /**
   * Retry failed ELO processing
   */
  async retryELOProcessing(activityId: string): Promise<void> {
    await db
      .update(activityELOStatus)
      .set({
        status: "pending",
        errorMessage: null,
        retryCount: sql`${activityELOStatus.retryCount} + 1`,
        lockedBy: null,
        lockedAt: null,
      })
      .where(eq(activityELOStatus.activityId, activityId));
  }
}

export const eloProcessingService = new ELOProcessingService();
