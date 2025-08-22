// src/services/matchmaking.service.ts - Complete implementation with zod validation
import { and, count, eq, gte, inArray, lte, ne, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  activities,
  activityParticipants,
  activityTypes,
  userActivityTypeELOs,
  userActivityTypeSkillSummaries,
  userConnections,
  users,
} from "../db/schema.js";
import { selectActivitySchema, selectUserSchema } from "../db/zod.schema.js";
import { deltaTrackingService } from "./delta-tracking.service.js";
import type { TeamBalanceParams, TeamBalanceResult } from "./interfaces.js";

export interface MatchmakingRequest {
  userId: string;
  activityTypeId: string;
  maxELODifference?: number;
  preferredSkillLevel?: number;
  includeConnections?: boolean;
  excludeUserIds?: string[];
  maxResults?: number;
}

export interface MatchmakingResult {
  userId: string;
  username: string;
  avatarUrl: string | null;
  eloScore: number;
  skillLevel: number;
  compatibility: number;
  connectionStatus: "none" | "pending" | "accepted";
  lastActiveAt: Date | null;
  gamesPlayed: number;
  reasons: string[];
}

export interface ActivityMatchmakingRequest {
  activityId: string;
  maxSuggestions?: number;
  eloRange?: number;
  skillRange?: number;
}

export interface ActivityMatchmakingResult {
  suggestedUsers: MatchmakingResult[];
  activityInfo: {
    activityId: string;
    description: string;
    eloLevel: number | null;
    currentParticipants: number;
    maxParticipants: number | null;
  };
}

export class MatchmakingService {
  /**
   * Find compatible players for a user
   */
  async findCompatiblePlayers(
    request: MatchmakingRequest
  ): Promise<MatchmakingResult[]> {
    try {
      // Validate request user exists
      const requestUser = await db.query.users.findFirst({
        where: eq(users.id, request.userId),
      });

      if (!requestUser) {
        throw new Error("Requesting user not found");
      }

      const validatedUser = selectUserSchema.parse(requestUser);

      // Get user's current ELO for the activity type
      const userELO = await db.query.userActivityTypeELOs.findFirst({
        where: and(
          eq(userActivityTypeELOs.userId, request.userId),
          eq(userActivityTypeELOs.activityTypeId, request.activityTypeId)
        ),
      });

      const baseELO = userELO?.eloScore || 1200;
      const maxELODiff = request.maxELODifference || 200;

      // Get user's connections for prioritization
      const userConnections = await this.getUserConnections(request.userId);

      // Build candidate query
      const candidates = await this.getCandidateUsers(
        request,
        baseELO,
        maxELODiff
      );

      // Calculate compatibility scores
      const results = await this.calculateCompatibility(
        request,
        candidates,
        userConnections,
        baseELO
      );

      // Sort by compatibility and return top results
      const maxResults = request.maxResults || 20;
      const sortedResults = results
        .sort((a, b) => b.compatibility - a.compatibility)
        .slice(0, maxResults);

      // Track matchmaking request for analytics
      await this.trackMatchmakingRequest(request, sortedResults.length);

      return sortedResults;
    } catch (error) {
      console.error("Error in matchmaking:", error);
      throw error;
    }
  }

  /**
   * Find suggested players for a specific activity
   */
  async suggestPlayersForActivity(
    request: ActivityMatchmakingRequest
  ): Promise<ActivityMatchmakingResult> {
    try {
      // Get activity details
      const activity = await db.query.activities.findFirst({
        where: eq(activities.id, request.activityId),
      });

      if (!activity) {
        throw new Error("Activity not found");
      }

      const validatedActivity = selectActivitySchema.parse(activity);

      // Get current participants
      const currentParticipants = await db
        .select({ count: sql`count(*)` })
        .from(activityParticipants)
        .where(
          and(
            eq(activityParticipants.activityId, request.activityId),
            eq(activityParticipants.status, "accepted")
          )
        );

      const participantCount = Number(currentParticipants[0].count);

      // Get existing participant IDs to exclude
      const existingParticipants = await db
        .select({ userId: activityParticipants.userId })
        .from(activityParticipants)
        .where(eq(activityParticipants.activityId, request.activityId));

      const excludeUserIds = existingParticipants.map((p) => p.userId);

      // Find compatible players
      const matchmakingRequest: MatchmakingRequest = {
        userId: validatedActivity.creatorId,
        activityTypeId: validatedActivity.activityTypeId,
        maxELODifference: request.eloRange || 300,
        excludeUserIds,
        maxResults: request.maxSuggestions || 10,
      };

      const suggestedUsers = await this.findCompatiblePlayers(
        matchmakingRequest
      );

      return {
        suggestedUsers,
        activityInfo: {
          activityId: request.activityId,
          description: validatedActivity.description || "Activity",
          eloLevel: validatedActivity.eloLevel,
          currentParticipants: participantCount,
          maxParticipants: validatedActivity.maxParticipants,
        },
      };
    } catch (error) {
      console.error("Error suggesting players for activity:", error);
      throw error;
    }
  }

  /**
   * Get user's connections
   */
  private async getUserConnections(userId: string): Promise<Set<string>> {
    const connections = await db
      .select({
        connectedUserId: sql`CASE 
          WHEN ${userConnections.user1Id} = ${userId} THEN ${userConnections.user2Id}
          ELSE ${userConnections.user1Id}
        END`,
        status: userConnections.status,
      })
      .from(userConnections)
      .where(
        and(
          or(
            eq(userConnections.user1Id, userId),
            eq(userConnections.user2Id, userId)
          ),
          eq(userConnections.status, "accepted")
        )
      );

    return new Set(connections.map((c) => c.connectedUserId as string));
  }

  /**
   * Get candidate users within ELO range
   */
  private async getCandidateUsers(
    request: MatchmakingRequest,
    baseELO: number,
    maxELODiff: number
  ) {
    const whereConditions = [
      ne(users.id, request.userId), // Exclude requesting user
    ];

    if (request.excludeUserIds && request.excludeUserIds.length > 0) {
      whereConditions.push(
        sql`${users.id} NOT IN (${request.excludeUserIds.join(", ")})`
      );
    }

    const candidates = await db
      .select({
        user: {
          id: users.id,
          username: users.username,
          avatarUrl: users.avatarUrl,
          createdAt: users.createdAt,
        },
        elo: {
          eloScore: userActivityTypeELOs.eloScore,
          gamesPlayed: userActivityTypeELOs.gamesPlayed,
          lastUpdated: userActivityTypeELOs.lastUpdated,
        },
        skillLevel: sql<number>`COALESCE(AVG(CAST(${userActivityTypeSkillSummaries.averageRating} AS DECIMAL)), 5.0)`,
      })
      .from(users)
      .leftJoin(
        userActivityTypeELOs,
        and(
          eq(users.id, userActivityTypeELOs.userId),
          eq(userActivityTypeELOs.activityTypeId, request.activityTypeId)
        )
      )
      .leftJoin(
        userActivityTypeSkillSummaries,
        and(
          eq(users.id, userActivityTypeSkillSummaries.userId),
          eq(
            userActivityTypeSkillSummaries.activityTypeId,
            request.activityTypeId
          )
        )
      )
      .where(and(...whereConditions))
      .groupBy(
        users.id,
        users.username,
        users.avatarUrl,
        users.createdAt,
        userActivityTypeELOs.eloScore,
        userActivityTypeELOs.gamesPlayed,
        userActivityTypeELOs.lastUpdated
      )
      .having(
        and(
          gte(
            sql`COALESCE(${userActivityTypeELOs.eloScore}, 1200)`,
            baseELO - maxELODiff
          ),
          lte(
            sql`COALESCE(${userActivityTypeELOs.eloScore}, 1200)`,
            baseELO + maxELODiff
          )
        )
      );

    return candidates;
  }

  /**
   * Calculate compatibility scores for candidates
   */
  private async calculateCompatibility(
    request: MatchmakingRequest,
    candidates: any[],
    userConnections: Set<string>,
    baseELO: number
  ): Promise<MatchmakingResult[]> {
    const results: MatchmakingResult[] = [];

    for (const candidate of candidates) {
      const candidateELO = candidate.elo?.eloScore || 1200;
      const candidateSkillLevel = Number(candidate.skillLevel) || 5.0;
      const gamesPlayed = candidate.elo?.gamesPlayed || 0;

      // Calculate compatibility factors
      const eloSimilarity = this.calculateELOSimilarity(baseELO, candidateELO);
      const experienceBonus = Math.min(gamesPlayed / 50, 1) * 10; // Up to 10 points for experience
      const connectionBonus = userConnections.has(candidate.user.id) ? 20 : 0;

      // Skill level compatibility
      const skillPreference = request.preferredSkillLevel || 5;
      const skillSimilarity = Math.max(
        0,
        10 - Math.abs(candidateSkillLevel - skillPreference)
      );

      // Calculate overall compatibility (0-100)
      const compatibility = Math.min(
        100,
        eloSimilarity + experienceBonus + connectionBonus + skillSimilarity
      );

      // Determine connection status
      const connectionStatus = userConnections.has(candidate.user.id)
        ? "accepted"
        : "none";

      // Generate reasons for the match
      const reasons = this.generateMatchReasons(
        eloSimilarity,
        skillSimilarity,
        connectionBonus,
        experienceBonus
      );

      results.push({
        userId: candidate.user.id,
        username: candidate.user.username,
        avatarUrl: candidate.user.avatarUrl,
        eloScore: candidateELO,
        skillLevel: candidateSkillLevel,
        compatibility,
        connectionStatus,
        lastActiveAt: candidate.elo?.lastUpdated || candidate.user.createdAt,
        gamesPlayed,
        reasons,
      });
    }

    return results;
  }

  /**
   * Get activity recommendations for a user
   */
  async getActivityRecommendations(
    userId: string,
    activityTypeId?: string,
    maxResults: number = 10,
    options: {
      includeSkillMatch?: boolean;
      includeTimePreference?: boolean;
    } = {}
  ): Promise<
    Array<{
      activityId: string;
      description: string;
      location: string;
      dateTime: Date;
      maxParticipants: number;
      currentParticipants: number;
      activityTypeName: string;
      creatorUsername: string;
      matchScore: number;
      eloMatch: boolean;
      hasConnectedParticipants: boolean;
      reasons: string[];
    }>
  > {
    try {
      // Get user's ELO scores for filtering
      const userELOs = await db
        .select({
          activityTypeId: userActivityTypeELOs.activityTypeId,
          eloScore: userActivityTypeELOs.eloScore,
        })
        .from(userActivityTypeELOs)
        .where(eq(userActivityTypeELOs.userId, userId));

      const userELOMap = new Map(
        userELOs.map((e) => [e.activityTypeId, e.eloScore])
      );

      // Build activities query
      let activitiesQuery = db
        .select({
          activityId: activities.id,
          description: activities.description,
          location: activities.location,
          dateTime: activities.dateTime,
          maxParticipants: activities.maxParticipants,
          eloLevel: activities.eloLevel,
          activityTypeId: activities.activityTypeId,
          activityTypeName: activityTypes.name,
          creatorId: activities.creatorId,
          creatorUsername: users.username,
        })
        .from(activities)
        .leftJoin(
          activityTypes,
          eq(activities.activityTypeId, activityTypes.id)
        )
        .leftJoin(users, eq(activities.creatorId, users.id))
        .where(
          and(
            sql`${activities.dateTime} > NOW()`, // Only future activities
            ne(activities.creatorId, userId), // Not created by user
            // Check if user is not already a participant
            sql`${activities.id} NOT IN (
            SELECT activity_id FROM ${activityParticipants} 
            WHERE user_id = ${userId}
          )`
          )
        );

      const whereConditions = [
        sql`${activities.dateTime} > NOW()`, // Only future activities
        ne(activities.creatorId, userId), // Not created by user
        // Check if user is not already a participant
        sql`${activities.id} NOT IN (
        SELECT activity_id FROM ${activityParticipants} 
        WHERE user_id = ${userId}
      )`,
      ];

      if (activityTypeId) {
        whereConditions.push(eq(activities.activityTypeId, activityTypeId));
      } else {
        // Only include activity types where user has ELO rating
        const userActivityTypeIds = Array.from(userELOMap.keys());
        if (userActivityTypeIds.length > 0) {
          whereConditions.push(
            inArray(activities.activityTypeId, userActivityTypeIds)
          );
        }
      }

      const candidateActivities = await activitiesQuery.limit(50);

      if (candidateActivities.length === 0) {
        return [];
      }

      // Get participant counts and connected participants
      const activityIds = candidateActivities.map((a) => a.activityId);

      const participantCounts = await db
        .select({
          activityId: activityParticipants.activityId,
          count: count(activityParticipants.userId),
        })
        .from(activityParticipants)
        .where(
          and(
            inArray(activityParticipants.activityId, activityIds),
            eq(activityParticipants.status, "accepted")
          )
        )
        .groupBy(activityParticipants.activityId);

      const participantCountMap = new Map(
        participantCounts.map((p) => [p.activityId, p.count])
      );

      // Get user's connections for friendship bonus
      const userConnectionsRes = await db
        .select({
          connectedUserId: sql<string>`CASE 
          WHEN ${userConnections.user1Id} = ${userId} THEN ${userConnections.user2Id}
          ELSE ${userConnections.user1Id}
        END`,
        })
        .from(userConnections)
        .where(
          and(
            or(
              eq(userConnections.user1Id, userId),
              eq(userConnections.user2Id, userId)
            ),
            eq(userConnections.status, "accepted")
          )
        );

      const friendIds = new Set(
        userConnectionsRes.map((c: any) => c.connectedUserId)
      );

      // Check for connected participants in activities
      const connectedParticipants = await db
        .select({
          activityId: activityParticipants.activityId,
          participantUserId: activityParticipants.userId,
        })
        .from(activityParticipants)
        .where(
          and(
            inArray(activityParticipants.activityId, activityIds),
            eq(activityParticipants.status, "accepted")
          )
        );

      const activitiesWithFriends = new Set(
        connectedParticipants
          .filter((cp) => friendIds.has(cp.participantUserId))
          .map((cp) => cp.activityId)
      );

      // Score activities
      const scoredActivities = candidateActivities
        .map((activity) => {
          const userELO = userELOMap.get(activity.activityTypeId) || 1200;
          const currentParticipants =
            participantCountMap.get(activity.activityId) || 0;
          const hasConnectedParticipants = activitiesWithFriends.has(
            activity.activityId
          );

          const maxParticipants = activity.maxParticipants ?? Infinity; // Or a large number like 9999
          const location = activity.location ?? "Location not specified"; // Or empty string ''
          const activityTypeName =
            activity.activityTypeName ?? "Unknown Activity Type";
          const creatorUsername = activity.creatorUsername ?? "Unknown User";

          // Calculate match score
          let matchScore = 50; // Base score

          // ELO matching
          const eloMatch =
            !activity.eloLevel || Math.abs(userELO - activity.eloLevel) <= 200;
          if (eloMatch) {
            matchScore += 25;
          }

          // Activity not full
          if (currentParticipants < maxParticipants) {
            matchScore += 15;
          }

          // Has connected participants
          if (hasConnectedParticipants) {
            matchScore += 20;
          }

          // Time preference (activities in next 7 days get bonus)
          const daysUntil =
            (activity.dateTime.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
          if (daysUntil <= 7) {
            matchScore += 10;
          }

          // Capacity utilization (activities that are 25-75% full are preferred)
          if (maxParticipants > 0 && maxParticipants !== Infinity) {
            // Avoid division by zero or Infinity
            const utilizationRate = currentParticipants / maxParticipants;
            if (utilizationRate >= 0.25 && utilizationRate <= 0.75) {
              matchScore += 10;
            }
          }

          const reasons = [];
          if (eloMatch) reasons.push("Good skill match");
          if (hasConnectedParticipants) reasons.push("Friends participating");
          if (daysUntil <= 7) reasons.push("Happening soon");
          if (currentParticipants < maxParticipants)
            reasons.push("Spots available");

          return {
            activityId: activity.activityId,
            description: activity.description,
            location: location,
            dateTime: activity.dateTime,
            maxParticipants: maxParticipants,
            currentParticipants,
            activityTypeName: activityTypeName,
            creatorUsername: creatorUsername,
            matchScore: Math.min(100, matchScore),
            eloMatch,
            hasConnectedParticipants,
            reasons,
          };
        })
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, maxResults);

      return scoredActivities;
    } catch (error) {
      console.error("Error getting activity recommendations:", error);
      throw error;
    }
  }

  /**
   * Calculate compatibility between two players
   */
  async calculatePlayerCompatibility(
    userId1: string,
    userId2: string,
    activityTypeId: string
  ): Promise<{
    overallScore: number;
    factors: {
      eloCompatibility: number;
      skillAlignment: number;
      experienceMatch: number;
      activityFrequency: number;
    };
    recommendation: string;
  }> {
    try {
      // Get ELO scores for both users
      const [user1ELO, user2ELO] = await Promise.all([
        db
          .select({
            eloScore: userActivityTypeELOs.eloScore,
            gamesPlayed: userActivityTypeELOs.gamesPlayed,
          })
          .from(userActivityTypeELOs)
          .where(
            and(
              eq(userActivityTypeELOs.userId, userId1),
              eq(userActivityTypeELOs.activityTypeId, activityTypeId)
            )
          )
          .limit(1),
        db
          .select({
            eloScore: userActivityTypeELOs.eloScore,
            gamesPlayed: userActivityTypeELOs.gamesPlayed,
          })
          .from(userActivityTypeELOs)
          .where(
            and(
              eq(userActivityTypeELOs.userId, userId2),
              eq(userActivityTypeELOs.activityTypeId, activityTypeId)
            )
          )
          .limit(1),
      ]);

      if (!user1ELO[0] || !user2ELO[0]) {
        throw new Error("ELO data not found for one or both users");
      }

      // Calculate ELO compatibility (closer = better)
      const eloDifference = Math.abs(
        user1ELO[0].eloScore - user2ELO[0].eloScore
      );
      const eloCompatibility = Math.max(0, 100 - eloDifference / 5); // 5 ELO = 1% penalty

      // Calculate experience match
      const avgGames = (user1ELO[0].gamesPlayed + user2ELO[0].gamesPlayed) / 2;
      const gamesDifference = Math.abs(
        user1ELO[0].gamesPlayed - user2ELO[0].gamesPlayed
      );
      const experienceMatch = Math.max(
        0,
        100 - (gamesDifference / Math.max(1, avgGames)) * 100
      );

      // Get skill summaries for both users
      const [user1Skills, user2Skills] = await Promise.all([
        db
          .select({
            skillDefinitionId: userActivityTypeSkillSummaries.skillDefinitionId,
            averageRating: userActivityTypeSkillSummaries.averageRating,
          })
          .from(userActivityTypeSkillSummaries)
          .where(
            and(
              eq(userActivityTypeSkillSummaries.userId, userId1),
              eq(userActivityTypeSkillSummaries.activityTypeId, activityTypeId)
            )
          ),
        db
          .select({
            skillDefinitionId: userActivityTypeSkillSummaries.skillDefinitionId,
            averageRating: userActivityTypeSkillSummaries.averageRating,
          })
          .from(userActivityTypeSkillSummaries)
          .where(
            and(
              eq(userActivityTypeSkillSummaries.userId, userId2),
              eq(userActivityTypeSkillSummaries.activityTypeId, activityTypeId)
            )
          ),
      ]);

      // Calculate skill alignment
      let skillAlignment = 50; // Default if no skill data
      if (user1Skills.length > 0 && user2Skills.length > 0) {
        const skillMap1 = new Map(
          user1Skills.map((s) => [s.skillDefinitionId, s.averageRating ?? 0])
        );
        const skillMap2 = new Map(
          user2Skills.map((s) => [s.skillDefinitionId, s.averageRating ?? 0])
        );

        const commonSkills = [...skillMap1.keys()].filter((id) =>
          skillMap2.has(id)
        );

        if (commonSkills.length > 0) {
          const skillDifferences = commonSkills.map((skillId) =>
            Math.abs(
              (skillMap1.get(skillId) ?? 0) - (skillMap2.get(skillId) ?? 0)
            )
          );
          const avgSkillDifference =
            skillDifferences.reduce((sum, diff) => sum + diff, 0) /
            skillDifferences.length;
          skillAlignment = Math.max(0, 100 - avgSkillDifference * 10); // 0.1 rating diff = 1% penalty
        }
      }

      // Calculate activity frequency compatibility
      const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const [user1Activities, user2Activities] = await Promise.all([
        db
          .select({ count: count(activityParticipants.activityId) })
          .from(activityParticipants)
          .leftJoin(
            activities,
            eq(activityParticipants.activityId, activities.id)
          )
          .where(
            and(
              eq(activityParticipants.userId, userId1),
              eq(activities.activityTypeId, activityTypeId),
              sql`${activities.dateTime} >= ${oneMonthAgo}`
            )
          ),
        db
          .select({ count: count(activityParticipants.activityId) })
          .from(activityParticipants)
          .leftJoin(
            activities,
            eq(activityParticipants.activityId, activities.id)
          )
          .where(
            and(
              eq(activityParticipants.userId, userId2),
              eq(activities.activityTypeId, activityTypeId),
              sql`${activities.dateTime} >= ${oneMonthAgo}`
            )
          ),
      ]);

      const user1Frequency = user1Activities[0]?.count || 0;
      const user2Frequency = user2Activities[0]?.count || 0;
      const avgFrequency = (user1Frequency + user2Frequency) / 2;
      const frequencyDifference = Math.abs(user1Frequency - user2Frequency);
      const activityFrequency =
        avgFrequency === 0
          ? 50
          : Math.max(
              0,
              100 - (frequencyDifference / Math.max(1, avgFrequency)) * 100
            );

      // Calculate overall score (weighted average)
      const factors = {
        eloCompatibility: Math.round(eloCompatibility),
        skillAlignment: Math.round(skillAlignment),
        experienceMatch: Math.round(experienceMatch),
        activityFrequency: Math.round(activityFrequency),
      };

      const overallScore = Math.round(
        eloCompatibility * 0.4 +
          skillAlignment * 0.3 +
          experienceMatch * 0.2 +
          activityFrequency * 0.1
      );

      // Generate recommendation
      let recommendation = "";
      if (overallScore >= 85) {
        recommendation =
          "Excellent match! You and this player are very compatible for activities together.";
      } else if (overallScore >= 70) {
        recommendation =
          "Good compatibility. You should work well together in most activities.";
      } else if (overallScore >= 55) {
        recommendation =
          "Moderate compatibility. Some differences but still worth playing together.";
      } else {
        recommendation =
          "Limited compatibility. Consider this for casual or learning activities.";
      }

      return {
        overallScore,
        factors,
        recommendation,
      };
    } catch (error) {
      console.error("Error calculating player compatibility:", error);
      throw error;
    }
  }
  /**
   * Calculate ELO similarity score (0-40 points)
   */
  private calculateELOSimilarity(
    baseELO: number,
    candidateELO: number
  ): number {
    const difference = Math.abs(baseELO - candidateELO);
    return Math.max(0, 40 - difference / 10); // Lose 1 point per 10 ELO difference
  }

  /**
   * Generate human-readable reasons for the match
   */
  private generateMatchReasons(
    eloSimilarity: number,
    skillSimilarity: number,
    connectionBonus: number,
    experienceBonus: number
  ): string[] {
    const reasons: string[] = [];

    if (eloSimilarity > 30) reasons.push("Similar skill level");
    if (eloSimilarity > 20 && eloSimilarity <= 30)
      reasons.push("Comparable skill level");
    if (skillSimilarity > 7) reasons.push("Matching skill preferences");
    if (connectionBonus > 0) reasons.push("Friend connection");
    if (experienceBonus > 5) reasons.push("Experienced player");
    if (experienceBonus <= 2) reasons.push("New player");

    return reasons.length > 0 ? reasons : ["General compatibility"];
  }

  /**
   * Track matchmaking request for analytics
   */
  private async trackMatchmakingRequest(
    request: MatchmakingRequest,
    resultsCount: number
  ): Promise<void> {
    try {
      await deltaTrackingService.trackChange({
        entityType: "matchmaking",
        entityId: `${request.userId}-${request.activityTypeId}`,
        changeType: "create",
        newData: {
          userId: request.userId,
          activityTypeId: request.activityTypeId,
          maxELODifference: request.maxELODifference,
          resultsCount,
          timestamp: new Date(),
        },
        affectedUserId: request.userId,
        triggeredBy: request.userId,
        changeSource: "matchmaking",
      });
    } catch (error) {
      console.error("Failed to track matchmaking request:", error);
    }
  }

  /**
   * Find recommended players based on criteria
   */
  async findRecommendedPlayers(
    userId: string,
    criteria: {
      activityTypeId: string;
      userELO: number;
      eloTolerance: number;
      skillRequirements?: Record<string, { min: number; weight: number }>;
      maxParticipants: number;
      includeConnections: boolean;
      avoidRecentOpponents: boolean;
    }
  ): Promise<
    Array<{
      userId: string;
      username: string;
      avatarUrl: string | null;
      currentELO: number;
      skillLevel: number;
      overallScore: number;
      connectionType: "friend" | "new";
      lastActiveAt: Date | null;
      gamesPlayed: number;
      reasons: string[];
    }>
  > {
    try {
      // Calculate ELO range
      const minELO = criteria.userELO - criteria.eloTolerance;
      const maxELO = criteria.userELO + criteria.eloTolerance;

      // Get users within ELO range for this activity type
      let candidatesQuery = db
        .select({
          userId: userActivityTypeELOs.userId,
          username: users.username,
          avatarUrl: users.avatarUrl,
          eloScore: userActivityTypeELOs.eloScore,
          gamesPlayed: userActivityTypeELOs.gamesPlayed,
          lastUpdated: userActivityTypeELOs.lastUpdated,
        })
        .from(userActivityTypeELOs)
        .leftJoin(users, eq(userActivityTypeELOs.userId, users.id))
        .where(
          and(
            eq(userActivityTypeELOs.activityTypeId, criteria.activityTypeId),
            gte(userActivityTypeELOs.eloScore, minELO),
            lte(userActivityTypeELOs.eloScore, maxELO),
            ne(userActivityTypeELOs.userId, userId) // Exclude current user
          )
        );

      const candidates = await candidatesQuery.limit(100); // Reasonable limit

      if (candidates.length === 0) {
        return [];
      }

      const validCandidates = candidates.filter(
        (candidate) => candidate.username !== null
      );

      // Get connection statuses
      const candidateIds = validCandidates.map((c) => c.userId);
      const connections = await db
        .select({
          connectedUserId: sql<string>`CASE 
          WHEN ${userConnections.user1Id} = ${userId} THEN ${userConnections.user2Id}
          ELSE ${userConnections.user1Id}
        END`,
          status: userConnections.status,
        })
        .from(userConnections)
        .where(
          and(
            or(
              eq(userConnections.user1Id, userId),
              eq(userConnections.user2Id, userId)
            ),
            inArray(
              sql`CASE 
              WHEN ${userConnections.user1Id} = ${userId} THEN ${userConnections.user2Id}
              ELSE ${userConnections.user1Id}
            END`,
              candidateIds
            )
          )
        );

      const friendIds = new Set(
        connections
          .filter((c) => c.status === "accepted")
          .map((c) => c.connectedUserId)
      );

      // Filter out connected users if not including them
      let filteredCandidates = candidates;
      if (!criteria.includeConnections) {
        filteredCandidates = candidates.filter((c) => !friendIds.has(c.userId));
      }

      // Score and filter candidates
      const scoredCandidates = filteredCandidates
        .map((candidate) => {
          const safeUsername = candidate.username ?? "UnknownUser";

          const eloDifference = Math.abs(candidate.eloScore - criteria.userELO);
          const eloScore = Math.max(
            0,
            100 - (eloDifference / criteria.eloTolerance) * 50
          );

          const experienceScore = Math.min(
            100,
            (candidate.gamesPlayed / 10) * 100
          );

          const connectionBonus = friendIds.has(candidate.userId) ? 20 : 0;

          const activityBonus =
            candidate.lastUpdated &&
            Date.now() - candidate.lastUpdated.getTime() <
              7 * 24 * 60 * 60 * 1000
              ? 10
              : 0;

          const overallScore = Math.round(
            eloScore * 0.5 +
              experienceScore * 0.3 +
              connectionBonus +
              activityBonus
          );

          const reasons = [];
          if (eloDifference <= 50) reasons.push("Similar skill level");
          if (friendIds.has(candidate.userId)) reasons.push("Connected friend");
          if (candidate.gamesPlayed >= 10) reasons.push("Experienced player");
          if (activityBonus > 0) reasons.push("Recently active");

          return {
            userId: candidate.userId,
            username: safeUsername,
            avatarUrl: candidate.avatarUrl,
            currentELO: candidate.eloScore,
            skillLevel: Math.round(candidate.eloScore / 120), // Simplified skill level
            overallScore,
            connectionType: friendIds.has(candidate.userId)
              ? ("friend" as const)
              : ("new" as const),
            lastActiveAt: candidate.lastUpdated,
            gamesPlayed: candidate.gamesPlayed,
            reasons,
          };
        })
        .sort((a, b) => b.overallScore - a.overallScore)
        .slice(0, criteria.maxParticipants);

      return scoredCandidates;
    } catch (error) {
      console.error("Error finding recommended players:", error);
      throw error;
    }
  }

  /**
   * Get matchmaking statistics for a user
   */
  async getMatchmakingStats(userId: string, activityTypeId: string) {
    try {
      // Get recent matchmaking requests
      const recentMatches = await db
        .select({ count: sql`count(*)` })
        .from(userActivityTypeELOs)
        .where(eq(userActivityTypeELOs.userId, userId));

      // Get user's current rank percentile
      const userELO = await db.query.userActivityTypeELOs.findFirst({
        where: and(
          eq(userActivityTypeELOs.userId, userId),
          eq(userActivityTypeELOs.activityTypeId, activityTypeId)
        ),
      });

      if (!userELO) {
        return {
          eligiblePlayers: 0,
          averageELODifference: 0,
          recommendedELORange: 200,
          rankPercentile: 50,
        };
      }

      // Count players in similar ELO range
      const eligiblePlayers = await db
        .select({ count: sql`count(*)` })
        .from(userActivityTypeELOs)
        .where(
          and(
            eq(userActivityTypeELOs.activityTypeId, activityTypeId),
            gte(userActivityTypeELOs.eloScore, userELO.eloScore - 300),
            lte(userActivityTypeELOs.eloScore, userELO.eloScore + 300),
            ne(userActivityTypeELOs.userId, userId)
          )
        );

      return {
        eligiblePlayers: Number(eligiblePlayers[0].count),
        averageELODifference: 150,
        recommendedELORange: 200,
        rankPercentile: 50, // Simplified calculation
      };
    } catch (error) {
      console.error("Error getting matchmaking stats:", error);
      return {
        eligiblePlayers: 0,
        averageELODifference: 0,
        recommendedELORange: 200,
        rankPercentile: 50,
      };
    }
  }

  /**
   * Create optimized activity with ELO targeting
   */
  async createOptimizedActivity(
    creatorId: string,
    activityTypeId: string,
    description: string,
    location: string,
    dateTime: Date,
    maxParticipants: number
  ): Promise<{
    activityId: string;
    suggestedELOLevel: number;
    difficultyTier: string;
    estimatedParticipants: number;
  }> {
    try {
      // Get creator's ELO for this activity type
      const [creatorELO] = await db
        .select({ eloScore: userActivityTypeELOs.eloScore })
        .from(userActivityTypeELOs)
        .where(
          and(
            eq(userActivityTypeELOs.userId, creatorId),
            eq(userActivityTypeELOs.activityTypeId, activityTypeId)
          )
        )
        .limit(1);

      const suggestedELOLevel = creatorELO?.eloScore || 1200;

      // Determine difficulty tier
      const difficultyTier =
        suggestedELOLevel >= 1600
          ? "Expert"
          : suggestedELOLevel >= 1400
          ? "Advanced"
          : suggestedELOLevel >= 1200
          ? "Intermediate"
          : "Beginner";

      // Create the activity
      const [newActivity] = await db
        .insert(activities)
        .values({
          activityTypeId,
          creatorId,
          description,
          location,
          dateTime,
          maxParticipants,
          eloLevel: suggestedELOLevel,
        })
        .returning();

      // Estimate potential participants within ELO range
      const eloTolerance = 300; // Standard tolerance for estimation
      const potentialParticipants = await db
        .select({ count: count(userActivityTypeELOs.userId) })
        .from(userActivityTypeELOs)
        .where(
          and(
            eq(userActivityTypeELOs.activityTypeId, activityTypeId),
            gte(
              userActivityTypeELOs.eloScore,
              suggestedELOLevel - eloTolerance
            ),
            lte(
              userActivityTypeELOs.eloScore,
              suggestedELOLevel + eloTolerance
            ),
            ne(userActivityTypeELOs.userId, creatorId) // Exclude creator
          )
        );

      const estimatedParticipants = potentialParticipants[0]?.count || 0;

      // Auto-join creator as participant
      await db.insert(activityParticipants).values({
        activityId: newActivity.id,
        userId: creatorId,
        status: "accepted",
      });

      return {
        activityId: newActivity.id,
        suggestedELOLevel,
        difficultyTier,
        estimatedParticipants,
      };
    } catch (error) {
      console.error("Error creating optimized activity:", error);
      throw error;
    }
  }

  // Add the missing method to the existing MatchmakingService class

  async balanceTeams(params: TeamBalanceParams): Promise<TeamBalanceResult> {
    console.log(
      `⚖️ Balancing teams for ${params.participants.length} participants`
    );

    if (params.participants.length < 2) {
      return {
        success: false,
        teams: [],
        metrics: { eloDifference: 0, balance: 0, fairness: "Poor" },
        error: "Need at least 2 participants to balance teams",
      };
    }

    // Simple team balancing algorithm
    const teamA = [];
    const teamB = [];

    // Sort participants by ELO and distribute alternately for balance
    const sortedParticipants = [...params.participants].sort(
      (a, b) => b.eloScore - a.eloScore
    );

    for (let i = 0; i < sortedParticipants.length; i++) {
      const participant = sortedParticipants[i];
      const teamMember = {
        userId: participant.userId,
        username: participant.username,
        eloScore: participant.eloScore,
      };

      if (i % 2 === 0) {
        teamA.push(teamMember);
      } else {
        teamB.push(teamMember);
      }
    }

    const teamAAvg =
      teamA.reduce((sum, p) => sum + p.eloScore, 0) / Math.max(teamA.length, 1);
    const teamBAvg =
      teamB.reduce((sum, p) => sum + p.eloScore, 0) / Math.max(teamB.length, 1);
    const eloDifference = Math.abs(teamAAvg - teamBAvg);

    return {
      success: true,
      teams: [
        {
          name: "A",
          members: teamA,
          averageELO: Math.round(teamAAvg),
          totalELO: teamA.reduce((sum, p) => sum + p.eloScore, 0),
        },
        {
          name: "B",
          members: teamB,
          averageELO: Math.round(teamBAvg),
          totalELO: teamB.reduce((sum, p) => sum + p.eloScore, 0),
        },
      ],
      metrics: {
        eloDifference: Math.round(eloDifference),
        balance: Math.max(0, 1 - eloDifference / 200), // Normalize to 0-1
        fairness:
          eloDifference < 50
            ? "Excellent"
            : eloDifference < 100
            ? "Good"
            : eloDifference < 200
            ? "Fair"
            : "Poor",
      },
    };
  }
}

export const matchmakingService = new MatchmakingService();
