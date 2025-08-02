// src/services/skill-rating.service.ts - Peer-to-Peer Skill Rating System

import { db } from "../db/client.js";
import {
  userActivitySkillRatings,
  userActivityTypeSkillSummaries,
  activityParticipants,
  activities,
  activityTypes,
  skillDefinitions,
  activityTypeSkills,
  users,
} from "../db/schema.js";
import { eq, and, avg, count, desc, sql, inArray } from "drizzle-orm";

// Types for skill rating system
export interface SkillRatingRequest {
  activityId: string;
  ratedUserId: string;
  ratings: Array<{
    skillDefinitionId: string;
    ratingValue: number; // 1-10
    confidence: number; // 1-5
    comment?: string;
  }>;
  isAnonymous?: boolean;
}

export interface SkillRatingResponse {
  ratingId: string;
  skillName: string;
  ratingValue: number;
  confidence: number;
  comment?: string;
  raterName?: string; // null if anonymous
  createdAt: Date;
}

export interface UserSkillSummary {
  skillDefinitionId: string;
  skillName: string;
  skillType: "physical" | "technical" | "mental" | "tactical";
  averageRating: number;
  totalRatings: number;
  trend: "improving" | "declining" | "stable";
  lastRated: Date;
  confidence: number; // Average confidence of ratings
}

export interface ActivitySkillRatingStatus {
  activityId: string;
  totalParticipants: number;
  ratingsCompleted: number;
  ratingsRemaining: number;
  completionPercentage: number;
  ratingDeadline?: Date;
  skillsToRate: Array<{
    skillDefinitionId: string;
    skillName: string;
    skillType: string;
  }>;
}

export class SkillRatingService {
  /**
   * Submit skill ratings for a participant after activity completion
   */
  async submitSkillRatings(
    ratingUserId: string,
    request: SkillRatingRequest
  ): Promise<SkillRatingResponse[]> {
    console.log(
      `📊 Processing skill ratings from ${ratingUserId} for activity ${request.activityId}`
    );

    // Validate the rating request
    await this.validateRatingRequest(ratingUserId, request);

    // Process each skill rating
    const responses: SkillRatingResponse[] = [];

    await db.transaction(async (tx) => {
      for (const rating of request.ratings) {
        // Insert the rating
        const [newRating] = await tx
          .insert(userActivitySkillRatings)
          .values({
            activityId: request.activityId,
            ratedUserId: request.ratedUserId,
            ratingUserId,
            skillDefinitionId: rating.skillDefinitionId,
            ratingValue: rating.ratingValue,
            confidence: rating.confidence,
            comment: rating.comment,
            isAnonymous: request.isAnonymous || false,
          })
          .returning();

        // Get skill name for response
        const [skillInfo] = await tx
          .select({ name: skillDefinitions.name })
          .from(skillDefinitions)
          .where(eq(skillDefinitions.id, rating.skillDefinitionId))
          .limit(1);

        // Get rater name if not anonymous
        let raterName: string | undefined;
        if (!request.isAnonymous) {
          const [rater] = await tx
            .select({ username: users.username })
            .from(users)
            .where(eq(users.id, ratingUserId))
            .limit(1);
          raterName = rater?.username;
        }

        responses.push({
          ratingId: newRating.id,
          skillName: skillInfo?.name || "Unknown Skill",
          ratingValue: rating.ratingValue,
          confidence: rating.confidence,
          comment: rating.comment,
          raterName,
          createdAt: newRating.createdAt,
        });
      }
    });

    // Trigger skill summary recalculation for the rated user
    await this.recalculateUserSkillSummaries(
      request.ratedUserId,
      request.activityId
    );

    console.log(`✅ Submitted ${responses.length} skill ratings`);
    return responses;
  }

  /**
   * Get skill ratings that need to be submitted for an activity
   */
  async getActivityRatingStatus(
    activityId: string,
    userId?: string
  ): Promise<ActivitySkillRatingStatus> {
    console.log(`📋 Getting rating status for activity ${activityId}`);

    // Get activity info and participants
    const [activityInfo] = await db
      .select({
        activity: activities,
        activityType: activityTypes,
      })
      .from(activities)
      .leftJoin(activityTypes, eq(activities.activityTypeId, activityTypes.id))
      .where(eq(activities.id, activityId))
      .limit(1);

    if (!activityInfo) {
      throw new Error("Activity not found");
    }

    // Get all accepted participants
    const participants = await db
      .select({ userId: activityParticipants.userId })
      .from(activityParticipants)
      .where(
        and(
          eq(activityParticipants.activityId, activityId),
          eq(activityParticipants.status, "accepted")
        )
      );

    // Get skills relevant to this activity type
    const relevantSkills = await db
      .select({
        skillDefinition: skillDefinitions,
        activityTypeSkill: activityTypeSkills,
      })
      .from(activityTypeSkills)
      .leftJoin(
        skillDefinitions,
        eq(activityTypeSkills.skillDefinitionId, skillDefinitions.id)
      )
      .where(
        eq(
          activityTypeSkills.activityTypeId,
          activityInfo.activity.activityTypeId
        )
      )
      .orderBy(activityTypeSkills.displayOrder);

    // Count existing ratings
    const existingRatings = await db
      .select({ count: count() })
      .from(userActivitySkillRatings)
      .where(eq(userActivitySkillRatings.activityId, activityId));

    const totalParticipants = participants.length;
    const skillsPerParticipant = relevantSkills.length;
    // Each participant rates every other participant on every skill
    const totalPossibleRatings =
      totalParticipants * (totalParticipants - 1) * skillsPerParticipant;
    const ratingsCompleted = existingRatings[0]?.count || 0;

    return {
      activityId,
      totalParticipants,
      ratingsCompleted,
      ratingsRemaining: totalPossibleRatings - ratingsCompleted,
      completionPercentage:
        totalPossibleRatings > 0
          ? Math.round((ratingsCompleted / totalPossibleRatings) * 100)
          : 0,
      ratingDeadline: this.calculateRatingDeadline(
        activityInfo.activity.createdAt
      ),
      skillsToRate: relevantSkills.map((skill) => ({
        skillDefinitionId: skill.skillDefinition?.id || "",
        skillName: skill.skillDefinition?.name || "",
        skillType: skill.skillDefinition?.skillType || "physical",
      })),
    };
  }

  /**
   * Get pending ratings for a specific user
   */
  async getPendingRatingsForUser(
    ratingUserId: string,
    activityId: string
  ): Promise<
    Array<{
      participantId: string;
      participantName: string;
      skillsToRate: Array<{
        skillDefinitionId: string;
        skillName: string;
        skillType: string;
        alreadyRated: boolean;
      }>;
    }>
  > {
    console.log(
      `📝 Getting pending ratings for user ${ratingUserId} in activity ${activityId}`
    );

    // Get all participants except the rating user
    const participants = await db
      .select({
        userId: activityParticipants.userId,
        user: users,
      })
      .from(activityParticipants)
      .leftJoin(users, eq(activityParticipants.userId, users.id))
      .where(
        and(
          eq(activityParticipants.activityId, activityId),
          eq(activityParticipants.status, "accepted")
          // Don't include the rating user themselves
        )
      );

    const otherParticipants = participants.filter(
      (p) => p.userId !== ratingUserId
    );

    // Get activity type to find relevant skills
    const [activity] = await db
      .select({ activityTypeId: activities.activityTypeId })
      .from(activities)
      .where(eq(activities.id, activityId))
      .limit(1);

    if (!activity) {
      throw new Error("Activity not found");
    }

    // Get skills for this activity type
    const relevantSkills = await db
      .select({
        skillDefinition: skillDefinitions,
      })
      .from(activityTypeSkills)
      .leftJoin(
        skillDefinitions,
        eq(activityTypeSkills.skillDefinitionId, skillDefinitions.id)
      )
      .where(eq(activityTypeSkills.activityTypeId, activity.activityTypeId))
      .orderBy(activityTypeSkills.displayOrder);

    // Get existing ratings from this user
    const existingRatings = await db
      .select({
        ratedUserId: userActivitySkillRatings.ratedUserId,
        skillDefinitionId: userActivitySkillRatings.skillDefinitionId,
      })
      .from(userActivitySkillRatings)
      .where(
        and(
          eq(userActivitySkillRatings.activityId, activityId),
          eq(userActivitySkillRatings.ratingUserId, ratingUserId)
        )
      );

    const ratingMap = new Map<string, Set<string>>();
    existingRatings.forEach((rating) => {
      if (!ratingMap.has(rating.ratedUserId)) {
        ratingMap.set(rating.ratedUserId, new Set());
      }
      ratingMap.get(rating.ratedUserId)!.add(rating.skillDefinitionId);
    });

    // Build response for each participant
    const pendingRatings = otherParticipants.map((participant) => ({
      participantId: participant.userId,
      participantName: participant.user?.username || "Unknown User",
      skillsToRate: relevantSkills.map((skill) => ({
        skillDefinitionId: skill.skillDefinition?.id || "",
        skillName: skill.skillDefinition?.name || "",
        skillType: skill.skillDefinition?.skillType || "physical",
        alreadyRated:
          ratingMap
            .get(participant.userId)
            ?.has(skill.skillDefinition?.id || "") || false,
      })),
    }));

    console.log(
      `📊 Found ${pendingRatings.length} participants to rate with ${relevantSkills.length} skills each`
    );
    return pendingRatings;
  }

  /**
 * Get skill summary for a user across all activity types
 */
async getUserSkillSummary(
  userId: string,
  activityTypeId?: string
): Promise<UserSkillSummary[]> {
  console.log(`📈 Getting skill summary for user ${userId}`);

  // Build the base query with required conditions
  const query = db
    .select({
      summary: userActivityTypeSkillSummaries,
      skill: skillDefinitions,
    })
    .from(userActivityTypeSkillSummaries)
    .leftJoin(
      skillDefinitions,
      eq(
        userActivityTypeSkillSummaries.skillDefinitionId,
        skillDefinitions.id
      )
    )
    .where(
      activityTypeId
        ? and(
            eq(userActivityTypeSkillSummaries.userId, userId),
            eq(userActivityTypeSkillSummaries.activityTypeId, activityTypeId)
          )
        : eq(userActivityTypeSkillSummaries.userId, userId)
    )
    .orderBy(desc(userActivityTypeSkillSummaries.averageRating));

  const summaries = await query;

  // Get additional details for each skill
  const result: UserSkillSummary[] = [];

  for (const item of summaries) {
    if (!item.summary || !item.skill) continue;

    // Get average confidence for this skill
    const [confidenceData] = await db
      .select({
        avgConfidence: avg(userActivitySkillRatings.confidence),
        lastRated: sql<Date>`MAX(${userActivitySkillRatings.createdAt})`,
      })
      .from(userActivitySkillRatings)
      .where(
        and(
          eq(userActivitySkillRatings.ratedUserId, userId),
          eq(userActivitySkillRatings.skillDefinitionId, item.skill.id)
        )
      );

    result.push({
      skillDefinitionId: item.skill.id,
      skillName: item.skill.name,
      skillType: item.skill.skillType as "physical" | "technical" | "mental" | "tactical",
      averageRating: item.summary.averageRating ? item.summary.averageRating / 100 : 0, // Convert back from integer storage
      totalRatings: item.summary.totalRatings ?? 0,
      trend: item.summary.trend as "improving" | "declining" | "stable",
      lastRated:
        confidenceData?.lastRated ||
        item.summary.lastCalculatedAt ||
        new Date(),
      confidence: Number(confidenceData?.avgConfidence) || 5,
    });
  }

  console.log(`📊 Retrieved ${result.length} skill summaries for user`);
  return result;
}

  /**
   * Get skill ratings received by a user for a specific activity
   */
  async getActivitySkillRatings(
    activityId: string,
    ratedUserId: string,
    includeComments: boolean = false
  ): Promise<
    Array<{
      skillName: string;
      skillType: string;
      ratings: Array<{
        ratingValue: number;
        confidence: number;
        comment?: string;
        raterName?: string;
        createdAt: Date;
      }>;
      averageRating: number;
      totalRatings: number;
    }>
  > {
    console.log(
      `📊 Getting activity skill ratings for user ${ratedUserId} in activity ${activityId}`
    );

    const ratingsData = await db
      .select({
        rating: userActivitySkillRatings,
        skill: skillDefinitions,
        rater: users,
      })
      .from(userActivitySkillRatings)
      .leftJoin(
        skillDefinitions,
        eq(userActivitySkillRatings.skillDefinitionId, skillDefinitions.id)
      )
      .leftJoin(users, eq(userActivitySkillRatings.ratingUserId, users.id))
      .where(
        and(
          eq(userActivitySkillRatings.activityId, activityId),
          eq(userActivitySkillRatings.ratedUserId, ratedUserId)
        )
      )
      .orderBy(skillDefinitions.name, userActivitySkillRatings.createdAt);

    // Group by skill
    const skillGroups = new Map<
      string,
      {
        skillName: string;
        skillType: string;
        ratings: Array<{
          ratingValue: number;
          confidence: number;
          comment?: string;
          raterName?: string;
          createdAt: Date;
        }>;
      }
    >();

    ratingsData.forEach((item) => {
      if (!item.skill) return;

      const skillId = item.skill.id;

      if (!skillGroups.has(skillId)) {
        skillGroups.set(skillId, {
          skillName: item.skill.name,
          skillType: item.skill.skillType,
          ratings: [],
        });
      }

      const group = skillGroups.get(skillId)!;
      group.ratings.push({
        ratingValue: item.rating.ratingValue,
        confidence: item.rating.confidence || 5,
        comment:
          includeComments && !item.rating.isAnonymous
            ? item.rating.comment ?? undefined
            : undefined,
        raterName: item.rating.isAnonymous ? undefined : item.rater?.username,
        createdAt: item.rating.createdAt,
      });
    });

    // Calculate averages and return
    return Array.from(skillGroups.values()).map((group) => ({
      skillName: group.skillName,
      skillType: group.skillType,
      ratings: group.ratings,
      averageRating:
        group.ratings.reduce((sum, r) => sum + r.ratingValue, 0) /
        group.ratings.length,
      totalRatings: group.ratings.length,
    }));
  }

  /**
   * Validate a skill rating request
   */
  private async validateRatingRequest(
    ratingUserId: string,
    request: SkillRatingRequest
  ): Promise<void> {
    // Check if the activity exists and is completed
    const [activity] = await db
      .select({
        id: activities.id,
        completionStatus: activities.completionStatus,
        activityTypeId: activities.activityTypeId,
      })
      .from(activities)
      .where(eq(activities.id, request.activityId))
      .limit(1);

    if (!activity) {
      throw new Error("Activity not found");
    }

    if (activity.completionStatus !== "completed") {
      throw new Error("Can only rate skills for completed activities");
    }

    // Check if rating user was a participant
    const [ratingUserParticipation] = await db
      .select()
      .from(activityParticipants)
      .where(
        and(
          eq(activityParticipants.activityId, request.activityId),
          eq(activityParticipants.userId, ratingUserId),
          eq(activityParticipants.status, "accepted")
        )
      )
      .limit(1);

    if (!ratingUserParticipation) {
      throw new Error("Only activity participants can submit ratings");
    }

    // Check if rated user was a participant
    const [ratedUserParticipation] = await db
      .select()
      .from(activityParticipants)
      .where(
        and(
          eq(activityParticipants.activityId, request.activityId),
          eq(activityParticipants.userId, request.ratedUserId),
          eq(activityParticipants.status, "accepted")
        )
      )
      .limit(1);

    if (!ratedUserParticipation) {
      throw new Error("Can only rate other activity participants");
    }

    // Prevent self-rating
    if (ratingUserId === request.ratedUserId) {
      throw new Error("Cannot rate yourself");
    }

    // Validate rating values
    for (const rating of request.ratings) {
      if (rating.ratingValue < 1 || rating.ratingValue > 10) {
        throw new Error("Rating values must be between 1 and 10");
      }
      if (rating.confidence < 1 || rating.confidence > 5) {
        throw new Error("Confidence values must be between 1 and 5");
      }
    }

    // Check for duplicate ratings
    const skillIds = request.ratings.map((r) => r.skillDefinitionId);
    const existingRatings = await db
      .select({ skillDefinitionId: userActivitySkillRatings.skillDefinitionId })
      .from(userActivitySkillRatings)
      .where(
        and(
          eq(userActivitySkillRatings.activityId, request.activityId),
          eq(userActivitySkillRatings.ratedUserId, request.ratedUserId),
          eq(userActivitySkillRatings.ratingUserId, ratingUserId),
          inArray(userActivitySkillRatings.skillDefinitionId, skillIds)
        )
      );

    if (existingRatings.length > 0) {
      throw new Error(
        "You have already rated some of these skills for this participant"
      );
    }

    // Validate that skills belong to the activity type
    const relevantSkills = await db
      .select({ skillDefinitionId: activityTypeSkills.skillDefinitionId })
      .from(activityTypeSkills)
      .where(eq(activityTypeSkills.activityTypeId, activity.activityTypeId));

    const relevantSkillIds = new Set(
      relevantSkills.map((s) => s.skillDefinitionId)
    );
    const invalidSkills = skillIds.filter(
      (skillId) => !relevantSkillIds.has(skillId)
    );

    if (invalidSkills.length > 0) {
      throw new Error("Some skills are not relevant to this activity type");
    }
  }

  /**
   * Recalculate skill summaries for a user (public method for admin use)
   */
  async recalculateUserSkillSummaries(
    userId: string,
    activityId: string
  ): Promise<void> {
    console.log(`🔄 Recalculating skill summaries for user ${userId}`);

    // Get the activity type
    const [activity] = await db
      .select({ activityTypeId: activities.activityTypeId })
      .from(activities)
      .where(eq(activities.id, activityId))
      .limit(1);

    if (!activity) return;

    // Get all skills for this activity type
    const relevantSkills = await db
      .select({ skillDefinitionId: activityTypeSkills.skillDefinitionId })
      .from(activityTypeSkills)
      .where(eq(activityTypeSkills.activityTypeId, activity.activityTypeId));

    await db.transaction(async (tx) => {
      for (const skill of relevantSkills) {
        // Calculate new averages for this skill
        const [stats] = await tx
          .select({
            averageRating: avg(userActivitySkillRatings.ratingValue),
            totalRatings: count(),
          })
          .from(userActivitySkillRatings)
          .where(
            and(
              eq(userActivitySkillRatings.ratedUserId, userId),
              eq(
                userActivitySkillRatings.skillDefinitionId,
                skill.skillDefinitionId
              )
            )
          );

        if (stats && stats.totalRatings > 0) {
          // Get recent ratings to determine trend
          const recentRatings = await tx
            .select({ ratingValue: userActivitySkillRatings.ratingValue })
            .from(userActivitySkillRatings)
            .where(
              and(
                eq(userActivitySkillRatings.ratedUserId, userId),
                eq(
                  userActivitySkillRatings.skillDefinitionId,
                  skill.skillDefinitionId
                )
              )
            )
            .orderBy(desc(userActivitySkillRatings.createdAt))
            .limit(5);

          const trend = this.calculateTrend(
            recentRatings.map((r) => r.ratingValue)
          );

          // Update or insert summary
          await tx
            .insert(userActivityTypeSkillSummaries)
            .values({
              userId,
              activityTypeId: activity.activityTypeId,
              skillDefinitionId: skill.skillDefinitionId,
              averageRating: Math.round(Number(stats.averageRating) * 100), // Store as integer (7.50 * 100 = 750)
              totalRatings: stats.totalRatings,
              trend,
              lastCalculatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [
                userActivityTypeSkillSummaries.userId,
                userActivityTypeSkillSummaries.activityTypeId,
                userActivityTypeSkillSummaries.skillDefinitionId,
              ],
              set: {
                averageRating: Math.round(Number(stats.averageRating) * 100),
                totalRatings: stats.totalRatings,
                trend,
                lastCalculatedAt: new Date(),
              },
            });
        }
      }
    });

    console.log(
      `✅ Updated skill summaries for ${relevantSkills.length} skills`
    );
  }

  /**
   * Calculate trend from recent ratings
   */
  private calculateTrend(
    recentRatings: number[]
  ): "improving" | "declining" | "stable" {
    if (recentRatings.length < 3) return "stable";

    const firstHalf = recentRatings.slice(-Math.ceil(recentRatings.length / 2));
    const secondHalf = recentRatings.slice(
      0,
      Math.floor(recentRatings.length / 2)
    );

    const firstAvg =
      firstHalf.reduce((sum, r) => sum + r, 0) / firstHalf.length;
    const secondAvg =
      secondHalf.reduce((sum, r) => sum + r, 0) / secondHalf.length;

    const difference = firstAvg - secondAvg;

    if (difference > 0.5) return "improving";
    if (difference < -0.5) return "declining";
    return "stable";
  }

  /**
   * Calculate rating deadline (e.g., 7 days after activity completion)
   */
  private calculateRatingDeadline(activityCreatedAt: Date): Date {
    const deadline = new Date(activityCreatedAt);
    deadline.setDate(deadline.getDate() + 7); // 7 days to submit ratings
    return deadline;
  }

  /**
   * Get skill rating statistics for monitoring/admin purposes
   */
  async getSkillRatingStatistics(): Promise<{
    totalRatings: number;
    ratingsThisWeek: number;
    averageRatingValue: number;
    averageConfidence: number;
    topRatedUsers: Array<{
      userId: string;
      username: string;
      averageRating: number;
      totalRatings: number;
    }>;
    mostActiveRaters: Array<{
      userId: string;
      username: string;
      ratingsGiven: number;
    }>;
  }> {
    console.log("📊 Generating skill rating statistics...");

    // Total ratings
    const [totalRatingsData] = await db
      .select({ count: count() })
      .from(userActivitySkillRatings);

    // Ratings this week
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const [ratingsThisWeek] = await db
      .select({ count: count() })
      .from(userActivitySkillRatings)
      .where(sql`${userActivitySkillRatings.createdAt} >= ${oneWeekAgo}`);

    // Average rating value and confidence
    const [averages] = await db
      .select({
        avgRating: avg(userActivitySkillRatings.ratingValue),
        avgConfidence: avg(userActivitySkillRatings.confidence),
      })
      .from(userActivitySkillRatings);

    // Top rated users (highest average ratings)
    const topRatedUsers = await db
      .select({
        userId: userActivityTypeSkillSummaries.userId,
        username: users.username,
        averageRating: avg(userActivityTypeSkillSummaries.averageRating),
        totalRatings: sql<number>`SUM(${userActivityTypeSkillSummaries.totalRatings})`,
      })
      .from(userActivityTypeSkillSummaries)
      .leftJoin(users, eq(userActivityTypeSkillSummaries.userId, users.id))
      .groupBy(userActivityTypeSkillSummaries.userId, users.username)
      .orderBy(desc(sql`AVG(${userActivityTypeSkillSummaries.averageRating})`))
      .limit(10);

    // Most active raters
    const mostActiveRaters = await db
      .select({
        userId: userActivitySkillRatings.ratingUserId,
        username: users.username,
        ratingsGiven: count(),
      })
      .from(userActivitySkillRatings)
      .leftJoin(users, eq(userActivitySkillRatings.ratingUserId, users.id))
      .groupBy(userActivitySkillRatings.ratingUserId, users.username)
      .orderBy(desc(count()))
      .limit(10);

    return {
      totalRatings: totalRatingsData?.count || 0,
      ratingsThisWeek: ratingsThisWeek?.count || 0,
      averageRatingValue: Number(averages?.avgRating) || 0,
      averageConfidence: Number(averages?.avgConfidence) || 0,
      topRatedUsers: topRatedUsers.map((user) => ({
        userId: user.userId,
        username: user.username || "Unknown",
        averageRating: Number(user.averageRating) / 100, // Convert back from integer storage
        totalRatings: user.totalRatings,
      })),
      mostActiveRaters: mostActiveRaters.map((rater) => ({
        userId: rater.userId,
        username: rater.username || "Unknown",
        ratingsGiven: rater.ratingsGiven,
      })),
    };
  }

  /**
   * Anti-gaming: Detect suspicious rating patterns
   */
  async detectSuspiciousRatingPatterns(): Promise<
    Array<{
      type: "mutual_high_ratings" | "rating_manipulation" | "fake_ratings";
      severity: "low" | "medium" | "high";
      description: string;
      involvedUsers: string[];
      evidence: any;
    }>
  > {
    console.log("🔍 Detecting suspicious rating patterns...");

    const suspiciousPatterns: Array<{
      type: "mutual_high_ratings" | "rating_manipulation" | "fake_ratings";
      severity: "low" | "medium" | "high";
      description: string;
      involvedUsers: string[];
      evidence: any;
    }> = [];

    // Pattern 1: Mutual high ratings (users always giving each other 9-10)
    const mutualRatings = await db
      .select({
        user1: userActivitySkillRatings.ratingUserId,
        user2: userActivitySkillRatings.ratedUserId,
        avgRating: avg(userActivitySkillRatings.ratingValue),
        count: count(),
      })
      .from(userActivitySkillRatings)
      .groupBy(
        userActivitySkillRatings.ratingUserId,
        userActivitySkillRatings.ratedUserId
      )
      .having(
        sql`COUNT(*) >= 5 AND AVG(${userActivitySkillRatings.ratingValue}) >= 9`
      );

    // Check for reciprocal high ratings
    for (const rating of mutualRatings) {
      const reciprocal = mutualRatings.find(
        (r) => r.user1 === rating.user2 && r.user2 === rating.user1
      );

      if (reciprocal) {
        suspiciousPatterns.push({
          type: "mutual_high_ratings",
          severity: "medium",
          description: `Users consistently give each other very high ratings (${Number(
            rating.avgRating
          ).toFixed(1)} avg)`,
          involvedUsers: [rating.user1, rating.user2],
          evidence: {
            ratingsGiven: rating.count,
            averageRating: Number(rating.avgRating),
            reciprocalAverage: Number(reciprocal.avgRating),
          },
        });
      }
    }

    // Pattern 2: Users who only give extreme ratings (1-2 or 9-10)
    const extremeRaters = await db
      .select({
        userId: userActivitySkillRatings.ratingUserId,
        totalRatings: count(),
        extremeRatings: sql<number>`COUNT(CASE WHEN ${userActivitySkillRatings.ratingValue} <= 2 OR ${userActivitySkillRatings.ratingValue} >= 9 THEN 1 END)`,
      })
      .from(userActivitySkillRatings)
      .groupBy(userActivitySkillRatings.ratingUserId)
      .having(sql`COUNT(*) >= 10`)
      .orderBy(
        desc(
          sql`COUNT(CASE WHEN ${userActivitySkillRatings.ratingValue} <= 2 OR ${userActivitySkillRatings.ratingValue} >= 9 THEN 1 END) * 1.0 / COUNT(*)`
        )
      );

    for (const rater of extremeRaters) {
      const extremePercentage = rater.extremeRatings / rater.totalRatings;
      if (extremePercentage > 0.8) {
        // More than 80% extreme ratings
        suspiciousPatterns.push({
          type: "rating_manipulation",
          severity: extremePercentage > 0.95 ? "high" : "medium",
          description: `User gives mostly extreme ratings (${(
            extremePercentage * 100
          ).toFixed(1)}% are 1-2 or 9-10)`,
          involvedUsers: [rater.userId],
          evidence: {
            totalRatings: rater.totalRatings,
            extremeRatings: rater.extremeRatings,
            extremePercentage,
          },
        });
      }
    }

    console.log(
      `🔍 Found ${suspiciousPatterns.length} suspicious rating patterns`
    );
    return suspiciousPatterns;
  }
}

export const skillRatingService = new SkillRatingService();
