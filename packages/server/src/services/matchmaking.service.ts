// src/services/matchmaking.service.ts - Complete Implementation

import { db } from "../db/client.js";
import {
  activities,
  activityTypes,
  users,
  userActivityTypeELOs,
  userActivityTypeSkillSummaries,
  activityParticipants,
  userConnections,
} from "../db/schema.js";
import {
  eq,
  and,
  inArray,
  between,
  desc,
  asc,
  count,
  avg,
  sql,
} from "drizzle-orm";

// Types for matchmaking system
export interface MatchmakingCriteria {
  activityTypeId: string;
  userELO: number;
  eloTolerance?: number;
  skillRequirements?: Record<string, { min: number; weight: number }>;
  maxParticipants?: number;
  preferredLocation?: string;
  timeRange?: {
    startDate: Date;
    endDate: Date;
  };
  includeConnections?: boolean;
  avoidRecentOpponents?: boolean;
}

export interface PlayerRecommendation {
  userId: string;
  username: string;
  avatarUrl?: string;
  currentELO: number;
  eloCompatibility: number;
  skillCompatibility: number;
  socialCompatibility: number;
  overallScore: number;
  estimatedELOChange: {
    ifWin: number;
    ifLoss: number;
    ifDraw: number;
  };
  lastPlayedTogether?: Date;
  connectionType?: "friend" | "recent_opponent" | "new";
  skillHighlights: Array<{
    skillName: string;
    rating: number;
    meetsRequirement: boolean;
  }>;
}

export interface ActivityRecommendation {
  activityId: string;
  description: string;
  location?: string;
  dateTime: Date;
  participantCount: number;
  maxParticipants?: number;
  activityType: {
    id: string;
    name: string;
    category: string;
  };
  eloLevel: number;
  eloCompatibility: number;
  skillMatch: number;
  openSpots: number;
  estimatedWaitTime?: number;
  participants: Array<{
    userId: string;
    username: string;
    elo: number;
  }>;
}

export interface TeamBalancingResult {
  teams: Array<{
    name: string;
    players: Array<{
      userId: string;
      username: string;
      elo: number;
      skills: Record<string, number>;
    }>;
    averageELO: number;
    skillBalance: Record<string, number>;
  }>;
  balanceScore: number;
  recommendations: string[];
}

export interface OptimizedActivityResult {
  activityId: string;
  suggestedELOLevel: number;
  estimatedParticipants: number;
  difficultyTier: "beginner" | "intermediate" | "advanced" | "expert";
}

export interface PersonalizedFeed {
  recommendedActivities: ActivityRecommendation[];
  friendsActivities: Array<{
    activityId: string;
    description: string;
    friendName: string;
    activityType: string;
    dateTime: Date;
  }>;
  trendingActivities: Array<{
    activityTypeId: string;
    activityTypeName: string;
    activeActivities: number;
    avgELOLevel: number;
  }>;
}

export interface MatchmakingStatistics {
  totalActivitiesCreated: number;
  activitiesWithOptimalBalance: number;
  averageParticipantsPerActivity: number;
  mostPopularActivityTypes: Array<{
    name: string;
    activityCount: number;
    avgELOLevel: number;
  }>;
  eloDistribution: Record<string, number>;
}

export class MatchmakingService {
  /**
   * Find recommended players for a user based on ELO and skills
   */
  async findRecommendedPlayers(
    userId: string,
    criteria: MatchmakingCriteria
  ): Promise<PlayerRecommendation[]> {
    console.log(
      `🎯 Finding player recommendations for ${userId} in ${criteria.activityTypeId}`
    );

    const eloTolerance = criteria.eloTolerance || 200;

    // Get potential players with ELO in range
    const potentialPlayers = await db
      .select({
        user: users,
        elo: userActivityTypeELOs,
      })
      .from(userActivityTypeELOs)
      .leftJoin(users, eq(userActivityTypeELOs.userId, users.id))
      .where(
        and(
          eq(userActivityTypeELOs.activityTypeId, criteria.activityTypeId),
          between(
            userActivityTypeELOs.eloScore,
            criteria.userELO - eloTolerance,
            criteria.userELO + eloTolerance
          )
        )
      )
      .orderBy(desc(userActivityTypeELOs.eloScore));

    // Filter out the requesting user
    const eligiblePlayers = potentialPlayers.filter(
      (p) => p.user?.id !== userId
    );

    // Get social connections
    const connections = await this.getUserConnections(userId);
    const connectionUserIds = new Set(
      connections.map((c) => c.connectedUserId)
    );

    // Get recent opponents
    const recentOpponents = await this.getRecentOpponents(
      userId,
      criteria.activityTypeId,
      30
    );
    const recentOpponentIds = new Set(recentOpponents.map((o) => o.opponentId));

    // Calculate recommendations
    const recommendations: PlayerRecommendation[] = [];

    for (const player of eligiblePlayers) {
      if (!player.user || !player.elo) continue;

      const playerELO = player.elo.eloScore;

      // Calculate ELO compatibility
      const eloDifference = Math.abs(playerELO - criteria.userELO);
      const eloCompatibility = Math.max(
        0,
        100 - (eloDifference / eloTolerance) * 100
      );

      // Calculate social compatibility
      let socialCompatibility = 50;
      let connectionType: PlayerRecommendation["connectionType"] = "new";

      if (connectionUserIds.has(player.user.id)) {
        socialCompatibility = 90;
        connectionType = "friend";
      } else if (recentOpponentIds.has(player.user.id)) {
        socialCompatibility = criteria.avoidRecentOpponents ? 20 : 70;
        connectionType = "recent_opponent";
      }

      // Calculate overall score
      const skillCompatibility = 75; // Simplified for now
      const overallScore =
        eloCompatibility * 0.5 +
        skillCompatibility * 0.3 +
        socialCompatibility * 0.2;

      // Estimate ELO changes
      const estimatedELOChange = this.estimateELOChanges(
        criteria.userELO,
        playerELO,
        32
      );

      recommendations.push({
        userId: player.user.id,
        username: player.user.username,
        avatarUrl: player.user.avatarUrl || undefined,
        currentELO: playerELO,
        eloCompatibility: Math.round(eloCompatibility),
        skillCompatibility: Math.round(skillCompatibility),
        socialCompatibility: Math.round(socialCompatibility),
        overallScore: Math.round(overallScore),
        estimatedELOChange,
        connectionType,
        skillHighlights: [], // Simplified
      });
    }

    return recommendations
      .sort((a, b) => b.overallScore - a.overallScore)
      .slice(0, criteria.maxParticipants || 10);
  }

  /**
   * Find recommended activities for a user to join
   */
  async findRecommendedActivities(
    userId: string,
    activityTypeId?: string,
    limit: number = 10
  ): Promise<ActivityRecommendation[]> {
    console.log(`🔍 Finding activity recommendations for user ${userId}`);

    // Get user's ELO for activity types they play
    const userELOsQuery = db
      .select({
        activityTypeId: userActivityTypeELOs.activityTypeId,
        eloScore: userActivityTypeELOs.eloScore,
      })
      .from(userActivityTypeELOs)
      .where(eq(userActivityTypeELOs.userId, userId));

    const userELOs = await userELOsQuery;

    if (userELOs.length === 0) {
      return [];
    }

    // Build base query
    const baseQuery = db
      .select({
        activity: activities,
        activityType: activityTypes,
        participantCount: count(activityParticipants.id),
      })
      .from(activities)
      .leftJoin(activityTypes, eq(activities.activityTypeId, activityTypes.id))
      .leftJoin(
        activityParticipants,
        and(
          eq(activityParticipants.activityId, activities.id),
          eq(activityParticipants.status, "accepted")
        )
      )
      .groupBy(activities.id, activityTypes.id);

    // Build where conditions
    const whereConditions = [
      eq(activities.completionStatus, "scheduled"),
      sql`${activities.dateTime} > NOW()`,
      sql`${activities.id} NOT IN (
        SELECT activity_id FROM activity_participants 
        WHERE user_id = ${userId} AND status = 'accepted'
      )`,
    ];

    if (activityTypeId) {
      whereConditions.push(eq(activities.activityTypeId, activityTypeId));
    } else {
      const userActivityTypeIds = userELOs.map((elo) => elo.activityTypeId);
      if (userActivityTypeIds.length > 0) {
        whereConditions.push(
          inArray(activities.activityTypeId, userActivityTypeIds)
        );
      }
    }

    const availableActivities = await baseQuery
      .where(and(...whereConditions))
      .orderBy(asc(activities.dateTime))
      .limit(limit * 3);

    // Process recommendations
    const recommendations: ActivityRecommendation[] = [];

    for (const item of availableActivities) {
      if (!item.activity || !item.activityType) continue;

      const activity = item.activity;
      const activityType = item.activityType;
      const participantCount = item.participantCount || 0;

      // Check if activity is full
      if (
        activity.maxParticipants &&
        participantCount >= activity.maxParticipants
      ) {
        continue;
      }

      // Get user's ELO for this activity type
      const userELO = userELOs.find(
        (elo) => elo.activityTypeId === activity.activityTypeId
      );
      if (!userELO) continue;

      // Calculate ELO compatibility
      const activityELO = activity.eloLevel || 1200;
      const eloDifference = Math.abs(userELO.eloScore - activityELO);
      const eloCompatibility = Math.max(0, 100 - (eloDifference / 200) * 100);

      // Get participants
      const participants = await db
        .select({
          user: users,
          elo: userActivityTypeELOs,
        })
        .from(activityParticipants)
        .leftJoin(users, eq(activityParticipants.userId, users.id))
        .leftJoin(
          userActivityTypeELOs,
          and(
            eq(userActivityTypeELOs.userId, activityParticipants.userId),
            eq(userActivityTypeELOs.activityTypeId, activity.activityTypeId)
          )
        )
        .where(
          and(
            eq(activityParticipants.activityId, activity.id),
            eq(activityParticipants.status, "accepted")
          )
        );

      const estimatedWaitTime = Math.max(
        0,
        Math.round((activity.dateTime.getTime() - Date.now()) / (1000 * 60))
      );

      recommendations.push({
        activityId: activity.id,
        description: activity.description || "",
        location: activity.location || undefined,
        dateTime: activity.dateTime,
        participantCount,
        maxParticipants: activity.maxParticipants || undefined,
        activityType: {
          id: activityType.id,
          name: activityType.name,
          category: activityType.category,
        },
        eloLevel: activityELO,
        eloCompatibility: Math.round(eloCompatibility),
        skillMatch: 75,
        openSpots: (activity.maxParticipants || 999) - participantCount,
        estimatedWaitTime,
        participants: participants.map((p) => ({
          userId: p.user?.id || "",
          username: p.user?.username || "Unknown",
          elo: p.elo?.eloScore || 1200,
        })),
      });
    }

    return recommendations
      .sort((a, b) => b.eloCompatibility - a.eloCompatibility)
      .slice(0, limit);
  }

  /**
   * Create a new activity with optimal ELO targeting
   */
  async createOptimizedActivity(
    creatorId: string,
    activityTypeId: string,
    description: string,
    location: string,
    dateTime: Date,
    maxParticipants: number
  ): Promise<OptimizedActivityResult> {
    console.log(`🎯 Creating optimized activity for ${creatorId}`);

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
    let difficultyTier: "beginner" | "intermediate" | "advanced" | "expert";
    if (suggestedELOLevel < 1000) difficultyTier = "beginner";
    else if (suggestedELOLevel < 1400) difficultyTier = "intermediate";
    else if (suggestedELOLevel < 1800) difficultyTier = "advanced";
    else difficultyTier = "expert";

    // Estimate potential participants in ELO range
    const eloTolerance = 200;
    const [participantEstimate] = await db
      .select({ count: count() })
      .from(userActivityTypeELOs)
      .where(
        and(
          eq(userActivityTypeELOs.activityTypeId, activityTypeId),
          between(
            userActivityTypeELOs.eloScore,
            suggestedELOLevel - eloTolerance,
            suggestedELOLevel + eloTolerance
          )
        )
      );

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
        isELORated: true,
        completionStatus: "scheduled",
      })
      .returning({ id: activities.id });

    // Auto-add creator as participant
    await db.insert(activityParticipants).values({
      activityId: newActivity.id,
      userId: creatorId,
      status: "accepted",
    });

    console.log(
      `✅ Created optimized activity ${newActivity.id} at ELO level ${suggestedELOLevel}`
    );

    return {
      activityId: newActivity.id,
      suggestedELOLevel,
      estimatedParticipants: participantEstimate?.count || 0,
      difficultyTier,
    };
  }

  /**
   * Balance teams for an activity based on ELO and skills
   */
  async balanceTeams(
    activityId: string,
    teamCount: number = 2
  ): Promise<TeamBalancingResult> {
    console.log(`⚖️  Balancing ${teamCount} teams for activity ${activityId}`);

    // Get activity info
    const [activity] = await db
      .select()
      .from(activities)
      .where(eq(activities.id, activityId))
      .limit(1);

    if (!activity) {
      throw new Error("Activity not found");
    }

    // Get participants
    const participants = await db
      .select({
        user: users,
        elo: userActivityTypeELOs,
        participant: activityParticipants,
      })
      .from(activityParticipants)
      .leftJoin(users, eq(activityParticipants.userId, users.id))
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

    if (participants.length < teamCount) {
      throw new Error(
        `Need at least ${teamCount} participants to balance teams`
      );
    }

    // Prepare player data
    const players = participants.map((p) => ({
      userId: p.user!.id,
      username: p.user!.username,
      elo: p.elo?.eloScore || 1200,
      skills: {},
    }));

    // Distribute players into teams
    const teams = this.distributePlayersIntoTeams(players, teamCount);

    // Calculate balance score
    const balanceScore = this.calculateTeamBalance(teams);

    // Generate recommendations
    const recommendations = this.generateBalancingRecommendations(
      teams,
      balanceScore
    );

    return {
      teams: teams.map((team, index) => ({
        name: String.fromCharCode(65 + index),
        players: team,
        averageELO: Math.round(
          team.reduce((sum, p) => sum + p.elo, 0) / team.length
        ),
        skillBalance: {},
      })),
      balanceScore: Math.round(balanceScore),
      recommendations,
    };
  }

  /**
   * Get personalized activity feed for a user
   */
  async getPersonalizedActivityFeed(
    userId: string,
    limit: number = 20
  ): Promise<PersonalizedFeed> {
    console.log(`📱 Building personalized feed for user ${userId}`);

    // Get recommended activities
    const recommendedActivities = await this.findRecommendedActivities(
      userId,
      undefined,
      limit
    );

    // Get friends' recent activities
    const connections = await this.getUserConnections(userId);
    const friendIds = connections.map((c) => c.connectedUserId);

    let friendsActivities: Array<{
      activityId: string;
      description: string;
      friendName: string;
      activityType: string;
      dateTime: Date;
    }> = [];

    if (friendIds.length > 0) {
      const friendsRecentActivities = await db
        .select({
          activity: activities,
          activityType: activityTypes,
          friend: users,
        })
        .from(activities)
        .leftJoin(
          activityTypes,
          eq(activities.activityTypeId, activityTypes.id)
        )
        .leftJoin(users, eq(activities.creatorId, users.id))
        .where(
          and(
            inArray(activities.creatorId, friendIds),
            eq(activities.completionStatus, "scheduled"),
            sql`${activities.dateTime} > NOW()`
          )
        )
        .orderBy(desc(activities.createdAt))
        .limit(10);

      friendsActivities = friendsRecentActivities.map((item) => ({
        activityId: item.activity.id,
        description: item.activity.description || "",
        friendName: item.friend?.username || "Unknown",
        activityType: item.activityType?.name || "Unknown",
        dateTime: item.activity.dateTime,
      }));
    }

    // Get trending activity types
    const trendingActivities = await db
      .select({
        activityTypeId: activities.activityTypeId,
        activityTypeName: activityTypes.name,
        activeActivities: count(),
        avgELOLevel: avg(activities.eloLevel),
      })
      .from(activities)
      .leftJoin(activityTypes, eq(activities.activityTypeId, activityTypes.id))
      .where(
        and(
          eq(activities.completionStatus, "scheduled"),
          sql`${activities.dateTime} > NOW()`,
          sql`${activities.dateTime} < NOW() + INTERVAL '7 days'`
        )
      )
      .groupBy(activities.activityTypeId, activityTypes.name)
      .orderBy(desc(count()))
      .limit(5);

    return {
      recommendedActivities,
      friendsActivities,
      trendingActivities: trendingActivities.map((trend) => ({
        activityTypeId: trend.activityTypeId,
        activityTypeName: trend.activityTypeName || "Unknown",
        activeActivities: trend.activeActivities,
        avgELOLevel: Math.round(Number(trend.avgELOLevel) || 1200),
      })),
    };
  }

  /**
   * Get matchmaking statistics for monitoring
   */
  async getMatchmakingStatistics(): Promise<MatchmakingStatistics> {
    console.log("📊 Generating matchmaking statistics...");

    // Total activities created
    const [totalActivities] = await db
      .select({ count: count() })
      .from(activities);

    // Activities with good participant counts
    const [wellBalancedActivities] = await db
      .select({ count: count() })
      .from(activities)
      .leftJoin(
        activityParticipants,
        eq(activities.id, activityParticipants.activityId)
      )
      .where(eq(activities.completionStatus, "completed"))
      .having(sql`COUNT(${activityParticipants.id}) >= 4`);

    // Average participants per activity
    const [avgParticipants] = await db
      .select({
        avgParticipants: avg(sql<number>`(
          SELECT COUNT(*) FROM activity_participants 
          WHERE activity_id = ${activities.id} AND status = 'accepted'
        )`),
      })
      .from(activities)
      .where(eq(activities.completionStatus, "completed"));

    // Most popular activity types
    const popularActivityTypes = await db
      .select({
        name: activityTypes.name,
        activityCount: count(),
        avgELOLevel: avg(activities.eloLevel),
      })
      .from(activities)
      .leftJoin(activityTypes, eq(activities.activityTypeId, activityTypes.id))
      .groupBy(activityTypes.name)
      .orderBy(desc(count()))
      .limit(10);

    // ELO distribution
    const eloRanges = [
      { min: 0, max: 999, label: "0-999" },
      { min: 1000, max: 1199, label: "1000-1199" },
      { min: 1200, max: 1399, label: "1200-1399" },
      { min: 1400, max: 1599, label: "1400-1599" },
      { min: 1600, max: 1799, label: "1600-1799" },
      { min: 1800, max: 2099, label: "1800-2099" },
      { min: 2100, max: 9999, label: "2100+" },
    ];

    const eloDistribution: Record<string, number> = {};

    for (const range of eloRanges) {
      const [result] = await db
        .select({ count: count() })
        .from(userActivityTypeELOs)
        .where(
          and(
            sql`${userActivityTypeELOs.eloScore} >= ${range.min}`,
            sql`${userActivityTypeELOs.eloScore} <= ${range.max}`
          )
        );

      eloDistribution[range.label] = result?.count || 0;
      console.log(eloDistribution[range.label]);
    }

    return {
      totalActivitiesCreated: totalActivities?.count || 0,
      activitiesWithOptimalBalance: wellBalancedActivities?.count || 0,
      averageParticipantsPerActivity:
        Number(avgParticipants?.avgParticipants) || 0,
      mostPopularActivityTypes: popularActivityTypes.map((type) => ({
        name: type.name || "Unknown",
        activityCount: type.activityCount,
        avgELOLevel: Math.round(Number(type.avgELOLevel) || 1200),
      })),
      eloDistribution,
    };
  }

  /**
   * Get user's social connections
   */
  public async getUserConnections(
    userId: string
  ): Promise<Array<{ connectedUserId: string }>> {
    const connections = await db
      .select({
        connectedUserId: sql<string>`CASE 
          WHEN ${userConnections.user1Id} = ${userId} THEN ${userConnections.user2Id}
          ELSE ${userConnections.user1Id}
        END`,
      })
      .from(userConnections)
      .where(
        and(
          eq(userConnections.status, "accepted"),
          sql`(${userConnections.user1Id} = ${userId} OR ${userConnections.user2Id} = ${userId})`
        )
      );

    return connections;
  }

  /**
   * Get recent opponents for a user
   */
  private async getRecentOpponents(
    userId: string,
    activityTypeId: string,
    daysBack: number
  ): Promise<Array<{ opponentId: string; lastPlayed: Date }>> {
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - daysBack);

    const recentGames = await db
      .select({
        activityId: activities.id,
        participantId: activityParticipants.userId,
        completedAt: activities.updatedAt,
      })
      .from(activities)
      .leftJoin(
        activityParticipants,
        eq(activities.id, activityParticipants.activityId)
      )
      .where(
        and(
          eq(activities.activityTypeId, activityTypeId),
          eq(activities.completionStatus, "completed"),
          sql`${activities.updatedAt} >= ${dateThreshold}`,
          sql`${activities.id} IN (
          SELECT activity_id FROM activity_participants 
          WHERE user_id = ${userId} AND status = 'accepted'
        )`,
          sql`${activityParticipants.userId} IS NOT NULL`,
          sql`${activityParticipants.userId} != ${userId}`
        )
      );

    return recentGames.map((game) => ({
      opponentId: game.participantId!, // Using non-null assertion since we filtered for it
      lastPlayed: game.completedAt,
    }));
  }

  /**
   * Estimate ELO changes for different outcomes
   */
  public estimateELOChanges(
    playerELO: number,
    opponentELO: number,
    kFactor: number
  ) {
    const expectedScore =
      1 / (1 + Math.pow(10, (opponentELO - playerELO) / 400));

    return {
      ifWin: Math.round(kFactor * (1 - expectedScore)),
      ifLoss: Math.round(kFactor * (0 - expectedScore)),
      ifDraw: Math.round(kFactor * (0.5 - expectedScore)),
    };
  }

  // Helper methods
  private distributePlayersIntoTeams(
    players: Array<{
      userId: string;
      username: string;
      elo: number;
      skills: Record<string, number>;
    }>,
    teamCount: number
  ) {
    const sortedPlayers = [...players].sort((a, b) => b.elo - a.elo);
    const teams: Array<Array<(typeof players)[0]>> = [];

    for (let i = 0; i < teamCount; i++) {
      teams.push([]);
    }

    let currentTeam = 0;
    let direction = 1;

    for (const player of sortedPlayers) {
      teams[currentTeam].push(player);

      currentTeam += direction;

      if (currentTeam === teamCount) {
        currentTeam = teamCount - 1;
        direction = -1;
      } else if (currentTeam < 0) {
        currentTeam = 0;
        direction = 1;
      }
    }

    return teams;
  }

  private calculateTeamBalance(teams: Array<Array<{ elo: number }>>) {
    if (teams.length < 2) return 100;

    const teamELOs = teams.map(
      (team) => team.reduce((sum, player) => sum + player.elo, 0) / team.length
    );

    const overallAvgELO =
      teamELOs.reduce((sum, elo) => sum + elo, 0) / teamELOs.length;
    const eloVariance =
      teamELOs.reduce((sum, elo) => sum + Math.pow(elo - overallAvgELO, 2), 0) /
      teamELOs.length;

    return Math.max(0, 100 - eloVariance / 100);
  }

  private generateBalancingRecommendations(
    teams: Array<Array<any>>,
    balanceScore: number
  ) {
    const recommendations: string[] = [];

    if (balanceScore < 70) {
      recommendations.push(
        "Teams are significantly unbalanced. Consider manual adjustments."
      );
    }

    if (balanceScore > 90) {
      recommendations.push("Excellent team balance! Teams are well-matched.");
    } else if (balanceScore > 75) {
      recommendations.push(
        "Good team balance with minor improvements possible."
      );
    }

    return recommendations;
  }
}

export const matchmakingService = new MatchmakingService();
