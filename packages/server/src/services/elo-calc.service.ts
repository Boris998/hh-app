// src/services/elo-calculation.service.ts - Multi-Player ELO Calculation Engine

import { db } from "../db/client.js";
import {
  userActivityTypeELOs,
  activityELOStatus,
  activities,
  activityParticipants,
  activityTypes,
  userActivitySkillRatings,
  userActivityTypeSkillSummaries,
} from "../db/schema.js";
import { eq, and, inArray, sql } from "drizzle-orm";

// Types for ELO calculation
export interface ParticipantELO {
  userId: string;
  username: string;
  currentELO: number;
  gamesPlayed: number;
  volatility: number;
  team?: string; // For team-based activities
  finalResult: "win" | "loss" | "draw";
  skillPerformanceBonus?: number; // Based on skill ratings received
}

export interface ELOCalculationResult {
  userId: string;
  oldELO: number;
  newELO: number;
  eloChange: number;
  kFactor: number;
  expectedScore: number;
  actualScore: number;
  skillBonus: number;
  reason: string;
}

export interface ActivityELOSettings {
  startingELO: number;
  kFactor: {
    new: number; // First 30 games
    established: number; // 30-100 games
    expert: number; // 100+ games
  };
  provisionalGames: number;
  minimumParticipants: number;
  teamBased: boolean;
  allowDraws: boolean;
  skillInfluence: number; // 0-1, how much skill ratings affect ELO
}

export class ELOCalculationService {
  /**
   * Main entry point for ELO calculation after activity completion
   */
  async calculateActivityELO(
    activityId: string
  ): Promise<ELOCalculationResult[]> {
    console.log(`🎯 Starting ELO calculation for activity: ${activityId}`);

    // Step 1: Acquire lock to prevent race conditions
    const lockAcquired = await this.acquireELOLock(activityId);
    if (!lockAcquired) {
      throw new Error("ELO calculation already in progress for this activity");
    }

    try {
      // Step 2: Validate activity is ready for ELO calculation
      await this.validateActivityForELO(activityId);

      // Step 3: Get activity settings and participants
      const { settings, participants } = await this.getActivityData(activityId);

      // Step 4: Calculate skill performance bonuses
      const participantsWithSkillBonuses = await this.calculateSkillBonuses(
        activityId,
        participants,
        settings.skillInfluence
      );

      // Step 5: Perform ELO calculations based on activity type
      const results = settings.teamBased
        ? await this.calculateTeamELO(participantsWithSkillBonuses, settings)
        : await this.calculateIndividualELO(
            participantsWithSkillBonuses,
            settings
          );

      // Step 6: Apply ELO changes atomically
      await this.applyELOChanges(activityId, results);

      // Step 7: Mark calculation as completed
      await this.completeELOCalculation(activityId, results);

      console.log(
        `✅ ELO calculation completed for ${results.length} participants`
      );
      return results;
    } catch (error) {
      await this.handleELOCalculationError(activityId, error);
      throw error;
    } finally {
      await this.releaseELOLock(activityId);
    }
  }

  /**
   * Individual ELO calculation (Free-for-all sports like Golf, Running)
   */
  private async calculateIndividualELO(
    participants: ParticipantELO[],
    settings: ActivityELOSettings
  ): Promise<ELOCalculationResult[]> {
    const results: ELOCalculationResult[] = [];

    // Sort participants by performance (winners first)
    const sortedParticipants = this.sortParticipantsByPerformance(participants);

    // Calculate pairwise ELO changes between all participants
    for (let i = 0; i < sortedParticipants.length; i++) {
      const player = sortedParticipants[i];
      let totalELOChange = 0;
      let totalExpectedScore = 0;
      let totalActualScore = 0;
      const kFactor = this.getKFactor(player, settings);

      // Compare this player against all others
      for (let j = 0; j < sortedParticipants.length; j++) {
        if (i === j) continue;

        const opponent = sortedParticipants[j];
        const expectedScore = this.calculateExpectedScore(
          player.currentELO,
          opponent.currentELO
        );
        const actualScore = this.getActualScore(player, opponent);

        const eloChange = kFactor * (actualScore - expectedScore);
        totalELOChange += eloChange;
        totalExpectedScore += expectedScore;
        totalActualScore += actualScore;
      }

      // Average the changes and apply skill bonus
      const avgELOChange = totalELOChange / (sortedParticipants.length - 1);
      const skillBonus = player.skillPerformanceBonus || 0;
      const finalELOChange = Math.round(avgELOChange + skillBonus);
      const newELO = Math.max(0, player.currentELO + finalELOChange);

      results.push({
        userId: player.userId,
        oldELO: player.currentELO,
        newELO,
        eloChange: finalELOChange,
        kFactor,
        expectedScore: totalExpectedScore / (sortedParticipants.length - 1),
        actualScore: totalActualScore / (sortedParticipants.length - 1),
        skillBonus,
        reason: `Individual performance vs ${
          sortedParticipants.length - 1
        } opponents`,
      });
    }

    return results;
  }

  /**
   * Team-based ELO calculation (Basketball, Football, etc.)
   */
  private async calculateTeamELO(
    participants: ParticipantELO[],
    settings: ActivityELOSettings
  ): Promise<ELOCalculationResult[]> {
    const results: ELOCalculationResult[] = [];

    // Group participants by team
    const teams = this.groupParticipantsByTeam(participants);
    const teamNames = Object.keys(teams);

    if (teamNames.length < 2) {
      throw new Error("Team-based ELO requires at least 2 teams");
    }

    // Calculate team average ELOs
    const teamELOs: Record<string, number> = {};
    for (const teamName of teamNames) {
      const teamMembers = teams[teamName];
      teamELOs[teamName] = this.calculateTeamAverageELO(teamMembers);
    }

    // Determine team results
    const teamResults = this.determineTeamResults(teams);

    // Calculate ELO changes for each team matchup
    for (let i = 0; i < teamNames.length; i++) {
      for (let j = i + 1; j < teamNames.length; j++) {
        const team1Name = teamNames[i];
        const team2Name = teamNames[j];
        const team1ELO = teamELOs[team1Name];
        const team2ELO = teamELOs[team2Name];

        const expectedScore1 = this.calculateExpectedScore(team1ELO, team2ELO);
        const expectedScore2 = 1 - expectedScore1;

        const actualScore1 = this.getTeamActualScore(
          teamResults[team1Name],
          teamResults[team2Name]
        );
        const actualScore2 = 1 - actualScore1;

        // Apply changes to all team members
        this.applyTeamELOChanges(
          teams[team1Name],
          expectedScore1,
          actualScore1,
          settings,
          results
        );
        this.applyTeamELOChanges(
          teams[team2Name],
          expectedScore2,
          actualScore2,
          settings,
          results
        );
      }
    }

    return results;
  }

  /**
   * Calculate expected score using standard ELO formula
   */
  private calculateExpectedScore(
    playerELO: number,
    opponentELO: number
  ): number {
    return 1 / (1 + Math.pow(10, (opponentELO - playerELO) / 400));
  }

  /**
   * Determine K-factor based on player experience and volatility
   */
  private getKFactor(
    player: ParticipantELO,
    settings: ActivityELOSettings
  ): number {
    if (player.gamesPlayed < settings.provisionalGames) {
      // New players get higher K-factor for faster adjustment
      return settings.kFactor.new + Math.max(0, player.volatility - 300) / 10;
    } else if (player.gamesPlayed < 100) {
      return settings.kFactor.established;
    } else {
      return settings.kFactor.expert;
    }
  }

  /**
   * Calculate actual score between two players (1 = win, 0.5 = draw, 0 = loss)
   */
  private getActualScore(
    player: ParticipantELO,
    opponent: ParticipantELO
  ): number {
    if (player.finalResult === "win" && opponent.finalResult === "loss")
      return 1;
    if (player.finalResult === "loss" && opponent.finalResult === "win")
      return 0;
    if (player.finalResult === "draw" && opponent.finalResult === "draw")
      return 0.5;

    // For ranking-based activities (like races), compare positions
    return this.comparePlayerRankings(player, opponent);
  }

  /**
   * Calculate skill performance bonus based on peer ratings
   */
  private async calculateSkillBonuses(
    activityId: string,
    participants: ParticipantELO[],
    skillInfluence: number
  ): Promise<ParticipantELO[]> {
    if (skillInfluence === 0) {
      return participants; // No skill influence
    }

    const participantsWithBonuses = [...participants];

    for (const participant of participantsWithBonuses) {
      // Get skill ratings received in this activity
      const skillRatings = await db
        .select({
          ratingValue: userActivitySkillRatings.ratingValue,
          confidence: userActivitySkillRatings.confidence,
        })
        .from(userActivitySkillRatings)
        .where(
          and(
            eq(userActivitySkillRatings.activityId, activityId),
            eq(userActivitySkillRatings.ratedUserId, participant.userId)
          )
        );

      if (skillRatings.length === 0) {
        participant.skillPerformanceBonus = 0;
        continue;
      }

      // Calculate weighted average of skill ratings
      let totalWeightedRating = 0;
      let totalWeight = 0;

      for (const rating of skillRatings) {
        const weight = (rating.confidence || 5) / 5; // Normalize confidence to 0-1
        totalWeightedRating += rating.ratingValue * weight;
        totalWeight += weight;
      }

      const averageSkillRating = totalWeightedRating / totalWeight;

      // Get player's historical skill average for comparison
      const skillSummaries = await db
        .select({
          averageRating: userActivityTypeSkillSummaries.averageRating,
        })
        .from(userActivityTypeSkillSummaries)
        .where(eq(userActivityTypeSkillSummaries.userId, participant.userId));

      const historicalAverage =
        skillSummaries.length > 0
          ? skillSummaries.reduce((sum, s) => sum + (s.averageRating || 0), 0) /
            skillSummaries.length
          : 5; // Default to middle rating

      // Calculate bonus: positive if performed above average, negative if below
      const performanceDelta = averageSkillRating - historicalAverage;
      const maxBonus = 20; // Maximum ELO bonus/penalty from skills
      participant.skillPerformanceBonus = Math.round(
        (performanceDelta / 5) * maxBonus * skillInfluence
      );
    }

    return participantsWithBonuses;
  }

  /**
   * Acquire distributed lock for ELO calculation
   */
  private async acquireELOLock(activityId: string): Promise<boolean> {
    const serverId = process.env.SERVER_ID || "server-1";
    const lockTimeout = 5 * 60 * 1000; // 5 minutes
    const now = new Date();

    try {
      // Try to acquire lock
      const result = await db
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
          },
          where: and(
            eq(activityELOStatus.status, "pending")
            // Allow taking over stale locks
            // or(
            //   isNull(activityELOStatus.lockedAt),
            //   lt(activityELOStatus.lockedAt, new Date(Date.now() - lockTimeout))
            // )
          ),
        })
        .returning();

      return result.length > 0;
    } catch (error) {
      console.error("Failed to acquire ELO lock:", error);
      return false;
    }
  }

  /**
   * Validate that activity is ready for ELO calculation
   */
  private async validateActivityForELO(activityId: string): Promise<void> {
    // Check activity exists and is completed
    const [activity] = await db
      .select({
        completionStatus: activities.completionStatus,
        isELORated: activities.isELORated,
      })
      .from(activities)
      .where(eq(activities.id, activityId))
      .limit(1);

    if (!activity) {
      throw new Error("Activity not found");
    }

    if (activity.completionStatus !== "completed") {
      throw new Error("Activity must be completed before ELO calculation");
    }

    if (!activity.isELORated) {
      throw new Error("Activity is not ELO-rated");
    }

    // Check minimum participants
    const participantCount = await db
      .select({ count: activityParticipants.id })
      .from(activityParticipants)
      .where(
        and(
          eq(activityParticipants.activityId, activityId),
          eq(activityParticipants.status, "accepted")
        )
      );

    if (participantCount.length < 2) {
      throw new Error("Minimum 2 participants required for ELO calculation");
    }
  }

  /**
   * Get activity settings and participant data
   */
  private async getActivityData(activityId: string): Promise<{
    settings: ActivityELOSettings;
    participants: ParticipantELO[];
  }> {
    // Get activity type settings
    const [activityData] = await db
      .select({
        activityType: activityTypes,
        activity: activities,
      })
      .from(activities)
      .leftJoin(activityTypes, eq(activities.activityTypeId, activityTypes.id))
      .where(eq(activities.id, activityId))
      .limit(1);

    if (!activityData?.activityType) {
      throw new Error("Activity type not found");
    }

    const settings: ActivityELOSettings = {
      startingELO: 1200,
      kFactor: { new: 40, established: 20, expert: 16 },
      provisionalGames: 30,
      minimumParticipants: 2,
      teamBased: !activityData.activityType.isSoloPerformable,
      allowDraws: true,
      skillInfluence: 0.3, // 30% influence from skill ratings
      ...(activityData.activityType
        .defaultELOSettings as Partial<ActivityELOSettings>),
    };

    // Get participants with current ELO
    const participantsData = await db
      .select({
        userId: activityParticipants.userId,
        team: activityParticipants.team,
        finalResult: activityParticipants.finalResult,
        elo: userActivityTypeELOs,
      })
      .from(activityParticipants)
      .leftJoin(
        userActivityTypeELOs,
        and(
          eq(activityParticipants.userId, userActivityTypeELOs.userId),
          eq(
            userActivityTypeELOs.activityTypeId,
            activityData.activity.activityTypeId
          )
        )
      )
      .where(
        and(
          eq(activityParticipants.activityId, activityId),
          eq(activityParticipants.status, "accepted")
        )
      );

    const participants: ParticipantELO[] = participantsData.map((p) => ({
      userId: p.userId,
      username: `User-${p.userId.slice(0, 8)}`, // Simplified for now
      currentELO: p.elo?.eloScore || settings.startingELO,
      gamesPlayed: p.elo?.gamesPlayed || 0,
      volatility: p.elo?.volatility || 300,
      team: p.team || undefined,
      finalResult: p.finalResult as "win" | "loss" | "draw",
    }));

    return { settings, participants };
  }

  // Helper methods for team calculations
  private groupParticipantsByTeam(
    participants: ParticipantELO[]
  ): Record<string, ParticipantELO[]> {
    return participants.reduce((teams, participant) => {
      const teamName = participant.team || "solo";
      if (!teams[teamName]) teams[teamName] = [];
      teams[teamName].push(participant);
      return teams;
    }, {} as Record<string, ParticipantELO[]>);
  }

  private calculateTeamAverageELO(teamMembers: ParticipantELO[]): number {
    const totalELO = teamMembers.reduce(
      (sum, member) => sum + member.currentELO,
      0
    );
    return Math.round(totalELO / teamMembers.length);
  }

  private determineTeamResults(
    teams: Record<string, ParticipantELO[]>
  ): Record<string, "win" | "loss" | "draw"> {
    const teamNames = Object.keys(teams);
    const results: Record<string, "win" | "loss" | "draw"> = {};

    // For now, use the result of the first team member (assuming consistent team results)
    for (const teamName of teamNames) {
      results[teamName] = teams[teamName][0]?.finalResult || "draw";
    }

    return results;
  }

  private getTeamActualScore(team1Result: string, team2Result: string): number {
    if (team1Result === "win" && team2Result === "loss") return 1;
    if (team1Result === "loss" && team2Result === "win") return 0;
    return 0.5; // Draw
  }

  private applyTeamELOChanges(
    teamMembers: ParticipantELO[],
    expectedScore: number,
    actualScore: number,
    settings: ActivityELOSettings,
    results: ELOCalculationResult[]
  ): void {
    for (const member of teamMembers) {
      const kFactor = this.getKFactor(member, settings);
      const baseELOChange = kFactor * (actualScore - expectedScore);
      const skillBonus = member.skillPerformanceBonus || 0;
      const finalELOChange = Math.round(baseELOChange + skillBonus);
      const newELO = Math.max(0, member.currentELO + finalELOChange);

      results.push({
        userId: member.userId,
        oldELO: member.currentELO,
        newELO,
        eloChange: finalELOChange,
        kFactor,
        expectedScore,
        actualScore,
        skillBonus,
        reason: `Team performance (${member.team || "unknown"} team)`,
      });
    }
  }

  private sortParticipantsByPerformance(
    participants: ParticipantELO[]
  ): ParticipantELO[] {
    const winLossOrder = { win: 0, draw: 1, loss: 2 };
    return [...participants].sort((a, b) => {
      return winLossOrder[a.finalResult] - winLossOrder[b.finalResult];
    });
  }

  private comparePlayerRankings(
    player: ParticipantELO,
    opponent: ParticipantELO
  ): number {
    // For activities with rankings, this would compare actual positions
    // For now, fallback to win/loss/draw comparison
    return this.getActualScore(player, opponent);
  }

  private async applyELOChanges(
    activityId: string,results: ELOCalculationResult[]
  ): Promise<void> {
    console.log(`💾 Applying ELO changes for ${results.length} participants`);

    await db.transaction(async (tx) => {
      for (const result of results) {
        // Get activity type for this activity
        const [activityType] = await tx
          .select({ activityTypeId: activities.activityTypeId })
          .from(activities)
          .where(eq(activities.id, activityId))
          .limit(1);

        if (!activityType) {
          throw new Error("Activity type not found");
        }

        // Update or insert ELO record
        await tx
          .insert(userActivityTypeELOs)
          .values({
            userId: result.userId,
            activityTypeId: activityType.activityTypeId,
            eloScore: result.newELO,
            gamesPlayed: 1,
            peakELO: result.newELO,
            volatility: 300,
          })
          .onConflictDoUpdate({
            target: [
              userActivityTypeELOs.userId,
              userActivityTypeELOs.activityTypeId,
            ],
            set: {
              eloScore: result.newELO,
              gamesPlayed: sql`${userActivityTypeELOs.gamesPlayed} + 1`,
              peakELO: sql`GREATEST(${userActivityTypeELOs.peakELO}, ${result.newELO})`,
              lastUpdated: new Date(),
              version: sql`${userActivityTypeELOs.version} + 1`,
            },
          });

        console.log(
          `   📈 ${result.userId}: ${result.oldELO} → ${result.newELO} (${
            result.eloChange > 0 ? "+" : ""
          }${result.eloChange})`
        );
      }
    });
  }

  private async completeELOCalculation(
    activityId: string,
    results: ELOCalculationResult[]
  ): Promise<void> {
    await db
      .update(activityELOStatus)
      .set({
        status: "completed",
        completedAt: new Date(),
        errorMessage: null,
      })
      .where(eq(activityELOStatus.activityId, activityId));
  }

  private async handleELOCalculationError(
    activityId: string,
    error: any
  ): Promise<void> {
    await db
      .update(activityELOStatus)
      .set({
        status: "error",
        errorMessage: error.message || "Unknown error",
        retryCount: sql`${activityELOStatus.retryCount} + 1`,
      })
      .where(eq(activityELOStatus.activityId, activityId));
  }

  private async releaseELOLock(activityId: string): Promise<void> {
    // Lock is released by setting status to completed/error in other methods
    console.log(`🔓 Released ELO lock for activity: ${activityId}`);
  }
  
}

export const eloCalculationService = new ELOCalculationService();
