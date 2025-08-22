// src/services/elo-calc.service.ts - Updated with zod validation
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  activities,
  activityParticipants,
  activityTypes,
  userActivitySkillRatings,
  userActivityTypeELOs,
  userActivityTypeSkillSummaries
} from "../db/schema.js";
import {
  selectActivitySchema,
  selectUserActivitySkillRatingSchema
} from "../db/zod.schema.js";

// Types for ELO calculation
export interface ParticipantELO {
  userId: string;
  username: string;
  currentELO: number;
  gamesPlayed: number;
  volatility: number;
  team?: string;
  finalResult: "win" | "loss" | "draw";
  skillPerformanceBonus?: number;
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
    new: number;
    established: number;
    expert: number;
  };
  provisionalGames: number;
  minimumParticipants: number;
  teamBased: boolean;
  allowDraws: boolean;
  skillInfluence: number;
}

export class ELOCalculationService {
  /**
   * Main entry point for ELO calculation after activity completion
   */
  async calculateActivityELO(
    activityId: string
  ): Promise<ELOCalculationResult[]> {
    console.log(`🎯 Starting ELO calculation for activity: ${activityId}`);

    try {
      // Validate activity is ready for ELO calculation
      await this.validateActivityForELO(activityId);

      // Get activity settings and participants
      const { settings, participants } = await this.getActivityData(activityId);

      // Calculate skill performance bonuses
      const participantsWithSkillBonuses = await this.calculateSkillBonuses(
        activityId,
        participants,
        settings.skillInfluence
      );

      // Perform ELO calculations based on activity type
      const results = settings.teamBased
        ? await this.calculateTeamBasedELO(
            participantsWithSkillBonuses,
            settings
          )
        : await this.calculateIndividualELO(
            participantsWithSkillBonuses,
            settings
          );

      console.log(
        `📈 ELO calculation completed for ${results.length} participants`
      );
      this.logELOResults(results);

      return results;
    } catch (error) {
      console.error(
        `❌ ELO calculation failed for activity ${activityId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Validate that activity is ready for ELO calculation
   */
  private async validateActivityForELO(activityId: string): Promise<void> {
    const activity = await db.query.activities.findFirst({
      where: eq(activities.id, activityId),
    });

    if (!activity) {
      throw new Error("Activity not found");
    }

    // Validate with zod schema
    const validatedActivity = selectActivitySchema.parse(activity);

    if (validatedActivity.completionStatus !== "completed") {
      throw new Error("Activity must be completed before ELO calculation");
    }

    if (!validatedActivity.isELORated) {
      throw new Error("Activity is not ELO-rated");
    }

    // Check participants have results
    const participantsWithResults = await db
      .select({ count: sql`count(*)` })
      .from(activityParticipants)
      .where(
        and(
          eq(activityParticipants.activityId, activityId),
          eq(activityParticipants.status, "accepted"),
          sql`${activityParticipants.finalResult} IS NOT NULL`
        )
      );

    const totalParticipants = await db
      .select({ count: sql`count(*)` })
      .from(activityParticipants)
      .where(
        and(
          eq(activityParticipants.activityId, activityId),
          eq(activityParticipants.status, "accepted")
        )
      );

    if (participantsWithResults[0].count !== totalParticipants[0].count) {
      throw new Error("Not all participants have results recorded");
    }
  }

  /**
   * Get activity data and settings
   */
  private async getActivityData(activityId: string): Promise<{
    settings: ActivityELOSettings;
    participants: ParticipantELO[];
  }> {
    // Get activity and activity type
    const activityQuery = await db
      .select({
        activity: activities,
        activityType: activityTypes,
      })
      .from(activities)
      .leftJoin(activityTypes, eq(activities.activityTypeId, activityTypes.id))
      .where(eq(activities.id, activityId));

    if (activityQuery.length === 0) {
      throw new Error("Activity or activity type not found");
    }

    const { activity, activityType } = activityQuery[0];

    // Validate with zod
    const validatedActivity = selectActivitySchema.parse(activity);

    // Get ELO settings from activity type
    const settings: ActivityELOSettings = {
      startingELO: 1200,
      kFactor: {
        new: 40,
        established: 24,
        expert: 16,
      },
      provisionalGames: 10,
      minimumParticipants: 2,
      teamBased: activityType?.name?.toLowerCase().includes("team") || false,
      allowDraws: true,
      skillInfluence: 0.3, // 30% influence from skill ratings
    };

    // Get participants with ELO data
    const participantsQuery = await db
      .select({
        userId: activityParticipants.userId,
        team: activityParticipants.team,
        finalResult: activityParticipants.finalResult,
        currentELO: userActivityTypeELOs.eloScore,
        gamesPlayed: userActivityTypeELOs.gamesPlayed,
        volatility: userActivityTypeELOs.volatility,
        username: sql`COALESCE(users.username, 'Unknown')`,
      })
      .from(activityParticipants)
      .leftJoin(
        userActivityTypeELOs,
        and(
          eq(activityParticipants.userId, userActivityTypeELOs.userId),
          eq(
            userActivityTypeELOs.activityTypeId,
            validatedActivity.activityTypeId
          )
        )
      )
      .leftJoin(sql`users`, eq(activityParticipants.userId, sql`users.id`))
      .where(
        and(
          eq(activityParticipants.activityId, activityId),
          eq(activityParticipants.status, "accepted")
        )
      );

    const participants: ParticipantELO[] = participantsQuery.map((p) => ({
      userId: p.userId,
      username: p.username as string,
      currentELO: p.currentELO || settings.startingELO,
      gamesPlayed: p.gamesPlayed || 0,
      volatility: p.volatility || 50,
      team: p.team || undefined,
      finalResult: p.finalResult as "win" | "loss" | "draw",
      skillPerformanceBonus: 0,
    }));

    if (participants.length < settings.minimumParticipants) {
      throw new Error(
        `Insufficient participants for ELO calculation (minimum: ${settings.minimumParticipants})`
      );
    }

    return { settings, participants };
  }

  /**
   * Calculate skill performance bonuses
   */
  private async calculateSkillBonuses(
    activityId: string,
    participants: ParticipantELO[],
    skillInfluence: number
  ): Promise<ParticipantELO[]> {
    if (skillInfluence === 0) {
      return participants;
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

      // Validate skill ratings with zod
      const validatedRatings = skillRatings.map((rating) =>
        selectUserActivitySkillRatingSchema.parse(rating)
      );

      // Calculate weighted average of skill ratings
      let totalWeightedRating = 0;
      let totalWeight = 0;

      for (const rating of validatedRatings) {
        const weight = (rating.confidence || 5) / 5;
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
          ? skillSummaries.reduce(
              (sum, s) => sum + parseFloat(s.averageRating || "0"),
              0
            ) / skillSummaries.length
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
   * Calculate ELO for individual competitions
   */
  private async calculateIndividualELO(
    participants: ParticipantELO[],
    settings: ActivityELOSettings
  ): Promise<ELOCalculationResult[]> {
    const results: ELOCalculationResult[] = [];

    for (const participant of participants) {
      const kFactor = this.getKFactor(participant.gamesPlayed, settings);

      // Calculate expected score against all other participants
      const opponents = participants.filter(
        (p) => p.userId !== participant.userId
      );
      let totalExpectedScore = 0;
      let totalActualScore = 0;

      for (const opponent of opponents) {
        const expectedScore = this.calculateExpectedScore(
          participant.currentELO,
          opponent.currentELO
        );
        totalExpectedScore += expectedScore;

        // Actual score based on results
        if (
          participant.finalResult === "win" &&
          opponent.finalResult === "loss"
        ) {
          totalActualScore += 1;
        } else if (
          participant.finalResult === "loss" &&
          opponent.finalResult === "win"
        ) {
          totalActualScore += 0;
        } else if (
          participant.finalResult === "draw" ||
          opponent.finalResult === "draw"
        ) {
          totalActualScore += 0.5;
        }
      }

      // Normalize scores
      const avgExpectedScore = totalExpectedScore / opponents.length;
      const avgActualScore = totalActualScore / opponents.length;

      // Calculate ELO change
      const baseELOChange = Math.round(
        kFactor * (avgActualScore - avgExpectedScore)
      );
      const skillBonus = participant.skillPerformanceBonus || 0;
      const totalELOChange = baseELOChange + skillBonus;

      const newELO = Math.max(100, participant.currentELO + totalELOChange); // Minimum ELO of 100

      results.push({
        userId: participant.userId,
        oldELO: participant.currentELO,
        newELO,
        eloChange: totalELOChange,
        kFactor,
        expectedScore: avgExpectedScore,
        actualScore: avgActualScore,
        skillBonus,
        reason: this.getELOChangeReason(
          avgActualScore,
          avgExpectedScore,
          skillBonus
        ),
      });
    }

    return results;
  }

  /**
   * Calculate ELO for team-based competitions
   */
  private async calculateTeamBasedELO(
    participants: ParticipantELO[],
    settings: ActivityELOSettings
  ): Promise<ELOCalculationResult[]> {
    // Group participants by team
    const teams = participants.reduce((acc, p) => {
      const teamName = p.team || "default";
      if (!acc[teamName]) acc[teamName] = [];
      acc[teamName].push(p);
      return acc;
    }, {} as Record<string, ParticipantELO[]>);

    const teamNames = Object.keys(teams);
    if (teamNames.length < 2) {
      throw new Error("Team-based activity requires at least 2 teams");
    }

    // Calculate team averages
    const teamAverages = teamNames.map((teamName) => ({
      teamName,
      averageELO:
        teams[teamName].reduce((sum, p) => sum + p.currentELO, 0) /
        teams[teamName].length,
      result: teams[teamName][0].finalResult, // Assume all team members have same result
    }));

    const results: ELOCalculationResult[] = [];

    // Calculate ELO changes for each participant
    for (const participant of participants) {
      const kFactor = this.getKFactor(participant.gamesPlayed, settings);
      const participantTeam = teamAverages.find(
        (t) => t.teamName === (participant.team || "default")
      )!;
      const opposingTeams = teamAverages.filter(
        (t) => t.teamName !== participantTeam.teamName
      );

      let totalExpectedScore = 0;
      let totalActualScore = 0;

      for (const opposingTeam of opposingTeams) {
        const expectedScore = this.calculateExpectedScore(
          participantTeam.averageELO,
          opposingTeam.averageELO
        );
        totalExpectedScore += expectedScore;

        if (
          participantTeam.result === "win" &&
          opposingTeam.result === "loss"
        ) {
          totalActualScore += 1;
        } else if (
          participantTeam.result === "loss" &&
          opposingTeam.result === "win"
        ) {
          totalActualScore += 0;
        } else {
          totalActualScore += 0.5;
        }
      }

      const avgExpectedScore = totalExpectedScore / opposingTeams.length;
      const avgActualScore = totalActualScore / opposingTeams.length;

      const baseELOChange = Math.round(
        kFactor * (avgActualScore - avgExpectedScore)
      );
      const skillBonus = participant.skillPerformanceBonus || 0;
      const totalELOChange = baseELOChange + skillBonus;

      const newELO = Math.max(100, participant.currentELO + totalELOChange);

      results.push({
        userId: participant.userId,
        oldELO: participant.currentELO,
        newELO,
        eloChange: totalELOChange,
        kFactor,
        expectedScore: avgExpectedScore,
        actualScore: avgActualScore,
        skillBonus,
        reason: this.getELOChangeReason(
          avgActualScore,
          avgExpectedScore,
          skillBonus
        ),
      });
    }

    return results;
  }

  /**
   * Calculate expected score using ELO formula
   */
  private calculateExpectedScore(
    playerELO: number,
    opponentELO: number
  ): number {
    return 1 / (1 + Math.pow(10, (opponentELO - playerELO) / 400));
  }

  /**
   * Get K-factor based on games played
   */
  private getKFactor(
    gamesPlayed: number,
    settings: ActivityELOSettings
  ): number {
    if (gamesPlayed < settings.provisionalGames) {
      return settings.kFactor.new;
    } else if (gamesPlayed < 100) {
      return settings.kFactor.established;
    } else {
      return settings.kFactor.expert;
    }
  }

  /**
   * Generate reason for ELO change
   */
  private getELOChangeReason(
    actualScore: number,
    expectedScore: number,
    skillBonus: number
  ): string {
    const performance =
      actualScore > expectedScore
        ? "Above expected"
        : actualScore < expectedScore
        ? "Below expected"
        : "As expected";
    const bonus =
      skillBonus > 0
        ? " +skill bonus"
        : skillBonus < 0
        ? " -skill penalty"
        : "";
    return `${performance}${bonus}`;
  }

  /**
   * Log ELO calculation results
   */
  private logELOResults(results: ELOCalculationResult[]): void {
    console.log("🏆 ELO CALCULATION RESULTS");
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

    for (const result of results) {
      const playerDisplay = result.userId.substring(0, 18).padEnd(20);
      const oldELO = result.oldELO.toString().padEnd(10);
      const newELO = result.newELO.toString().padEnd(10);
      const change =
        (result.eloChange >= 0 ? "+" : "") +
        result.eloChange.toString().padEnd(7);
      const skillBonus =
        (result.skillBonus >= 0 ? "+" : "") +
        result.skillBonus.toString().padEnd(12);
      const reason = result.reason.substring(0, 30);

      console.log(
        `${playerDisplay} ${oldELO} ${newELO} ${change} ${skillBonus} ${reason}`
      );
    }

    const totalChanges = results.reduce(
      (sum, r) => sum + Math.abs(r.eloChange),
      0
    );
    const avgChange = totalChanges / results.length;
    console.log("─".repeat(80));
    console.log(`📈 Average ELO change: ${avgChange.toFixed(1)} points`);
    console.log(`🎯 Players affected: ${results.length}`);
  }
}

export const eloCalculationService = new ELOCalculationService();
