// src/services/skill-rating.service.ts - Fixed with only used zod.schema.ts types
import { db } from "../db/client.js";
import {
  userActivitySkillRatings,
  userActivityTypeSkillSummaries,
  userGeneralSkillSummaries,
  skillDefinitions,
  activityTypeSkills,
  activities,
  activityTypes,
} from "../db/schema.js";
import { eq, and, avg, count, sql } from "drizzle-orm";
import { deltaTrackingService } from "./delta-tracking.service.js";
import {
  insertUserActivitySkillRatingSchema,
  insertUserActivityTypeSkillSummarySchema,
  insertUserGeneralSkillSummarySchema,
} from "../db/zod.schema.js";

export type SkillRatingData = {
  activityId: string;
  ratedUserId: string;
  ratingUserId: string;
  skillDefinitionId: string;
  ratingValue: number;
  comment?: string;
  confidence?: number;
  isAnonymous?: boolean;
};

export interface SkillSummary {
  userId: string;
  skillDefinitionId: string;
  activityTypeId?: string;
  averageRating: string; // String to match zod schema
  totalRatings: number;
  trend?: "improving" | "declining" | "stable";
}

export interface SkillSummary {
  userId: string;
  skillDefinitionId: string;
  activityTypeId?: string;
  averageRating: string; // Changed to string to match zod schema
  totalRatings: number;
  trend?: "improving" | "declining" | "stable";
}

export class SkillRatingService {
  /**
   * Submit a skill rating
   */
  async submitRating(ratingData: SkillRatingData): Promise<any> {
    try {
      const validatedData =
        insertUserActivitySkillRatingSchema.parse(ratingData);

      // Validate that the skill is relevant to the activity
      const activity = await db.query.activities.findFirst({
        where: eq(activities.id, ratingData.activityId),
      });

      if (!activity) {
        throw new Error("Activity not found");
      }

      // Check if skill is relevant to activity type
      const relevantSkill = await db.query.activityTypeSkills.findFirst({
        where: and(
          eq(activityTypeSkills.activityTypeId, activity.activityTypeId),
          eq(activityTypeSkills.skillDefinitionId, ratingData.skillDefinitionId)
        ),
      });

      if (!relevantSkill) {
        throw new Error("Skill is not relevant to this activity type");
      }

      // Insert the rating
      const [newRating] = await db
        .insert(userActivitySkillRatings)
        .values({
          activityId: validatedData.activityId,
          ratedUserId: validatedData.ratedUserId,
          ratingUserId: validatedData.ratingUserId,
          skillDefinitionId: validatedData.skillDefinitionId,
          ratingValue: validatedData.ratingValue,
          comment: validatedData.comment || null,
          confidence: validatedData.confidence || null,
          isAnonymous: validatedData.isAnonymous || false,
        })
        .returning();

      // Track the change
      await deltaTrackingService.logSkillRatingChange(
        newRating.id,
        "create",
        validatedData.ratedUserId,
        validatedData.ratingUserId,
        validatedData.activityId,
        newRating,
        validatedData.ratingUserId
      );

      // Trigger skill summary recalculation
      await this.recalculateSkillSummaries(
        validatedData.ratedUserId,
        validatedData.skillDefinitionId
      );

      return newRating;
    } catch (error) {
      console.error("Error submitting skill rating:", error);
      throw error;
    }
  }

  /**
   * Recalculate skill summaries for a user and skill
   */
  async recalculateSkillSummaries(
    userId: string,
    skillDefinitionId: string
  ): Promise<void> {
    try {
      // Get all activity types where this skill is relevant
      const relevantActivityTypes = await db
        .select({
          activityTypeId: activityTypeSkills.activityTypeId,
        })
        .from(activityTypeSkills)
        .where(eq(activityTypeSkills.skillDefinitionId, skillDefinitionId));

      for (const { activityTypeId } of relevantActivityTypes) {
        // Calculate average rating for this user, skill, and activity type
        const skillStats = await db
          .select({
            averageRating: avg(userActivitySkillRatings.ratingValue),
            totalRatings: count(userActivitySkillRatings.id),
          })
          .from(userActivitySkillRatings)
          .leftJoin(
            activities,
            eq(userActivitySkillRatings.activityId, activities.id)
          )
          .where(
            and(
              eq(userActivitySkillRatings.ratedUserId, userId),
              eq(userActivitySkillRatings.skillDefinitionId, skillDefinitionId),
              eq(activities.activityTypeId, activityTypeId)
            )
          );

        const stats = skillStats[0];

        if (stats && stats.totalRatings > 0 && stats.averageRating !== null) {
          // --- Fix: Convert the averageRating to a number ---
          // The type from avg() might be string (representing numeric), number, or Decimal.js object depending on Drizzle adapter.
          // Using parseFloat is generally safe for converting these to a JS number.
          // Math.round is used because your column is an integer.
          let averageRatingNumber: number;
          if (typeof stats.averageRating === "number") {
            averageRatingNumber = Math.round(stats.averageRating);
          } else if (typeof stats.averageRating === "string") {
            // If Drizzle returns it as a string representation of the number
            averageRatingNumber = Math.round(parseFloat(stats.averageRating));
          } else {
            // Handle other potential types (like Decimal.js) or null (though checked above)
            // Fallback or throw an error if conversion isn't straightforward
            console.warn(
              "Unexpected type for averageRating:",
              typeof stats.averageRating,
              stats.averageRating
            );
            // Example fallback - parse as string representation, might need adjustment
            averageRatingNumber = Math.round(
              parseFloat(String(stats.averageRating))
            );
          }
          // --- End Fix ---

          // Update or insert summary
          await db
            .insert(userActivityTypeSkillSummaries)
            .values({
              userId,
              activityTypeId,
              skillDefinitionId,
              // --- Use the converted number ---
              averageRating: averageRatingNumber, // Pass the number, not a string
              // ---
              totalRatings: stats.totalRatings,
              lastCalculatedAt: new Date(),
              trend: "stable",
            })
            .onConflictDoUpdate({
              target: [
                userActivityTypeSkillSummaries.userId,
                userActivityTypeSkillSummaries.activityTypeId,
                userActivityTypeSkillSummaries.skillDefinitionId,
              ],
              set: {
                // --- Use the converted number ---
                averageRating: averageRatingNumber, // Pass the number, not a string
                // ---
                totalRatings: stats.totalRatings,
                lastCalculatedAt: new Date(),
                trend: "stable",
              },
            });
        } else if (stats && stats.totalRatings === 0) {
          // Optional: Handle case where totalRatings is 0, maybe delete the summary or set averageRating to null
          // Example: Set averageRating to null if no ratings
          await db
            .insert(userActivityTypeSkillSummaries)
            .values({
              userId,
              activityTypeId,
              skillDefinitionId,
              averageRating: null, // Set to null if no ratings
              totalRatings: 0,
              lastCalculatedAt: new Date(),
              trend: "stable",
            })
            .onConflictDoUpdate({
              target: [
                userActivityTypeSkillSummaries.userId,
                userActivityTypeSkillSummaries.activityTypeId,
                userActivityTypeSkillSummaries.skillDefinitionId,
              ],
              set: {
                averageRating: null, // Set to null if no ratings
                totalRatings: 0,
                lastCalculatedAt: new Date(),
                trend: "stable",
              },
            });
        }
      }

      // Update general skill summary if this is a general skill
      const skill = await db.query.skillDefinitions.findFirst({
        where: eq(skillDefinitions.id, skillDefinitionId),
      });

      if (skill?.isGeneral) {
        await this.recalculateGeneralSkillSummary(userId, skillDefinitionId);
      }

      console.log(
        `✅ Recalculated skill summaries for user ${userId}, skill ${skillDefinitionId}`
      );
    } catch (error) {
      console.error("Error recalculating skill summaries:", error);
      throw error;
    }
  }

  /**
   * Recalculate general skill summary (average across all activity types)
   */
  private async recalculateGeneralSkillSummary(
    userId: string,
    skillDefinitionId: string
  ): Promise<void> {
    try {
      // Get overall average across all activity types for this general skill
      const overallStats = await db
        .select({
          overallAverage: avg(
            sql`CAST(${userActivityTypeSkillSummaries.averageRating} AS DECIMAL)`
          ),
          totalRatings: sql<number>`SUM(${userActivityTypeSkillSummaries.totalRatings})`,
        })
        .from(userActivityTypeSkillSummaries)
        .where(
          and(
            eq(userActivityTypeSkillSummaries.userId, userId),
            eq(
              userActivityTypeSkillSummaries.skillDefinitionId,
              skillDefinitionId
            )
          )
        );

      const stats = overallStats[0];

      if (stats && stats.totalRatings > 0 && stats.overallAverage !== null) {
        const overallAverageStr = stats.overallAverage.toString();

        // Update or insert general skill summary
        await db
          .insert(userGeneralSkillSummaries)
          .values({
            userId,
            skillDefinitionId,
            overallAverageRating: overallAverageStr,
            lastCalculatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              userGeneralSkillSummaries.userId,
              userGeneralSkillSummaries.skillDefinitionId,
            ],
            set: {
              overallAverageRating: overallAverageStr,
              lastCalculatedAt: new Date(),
            },
          });
      }
    } catch (error) {
      console.error("Error recalculating general skill summary:", error);
      throw error;
    }
  }

  /**
   * Get skill summaries for a user
   */
  async getUserSkillSummaries(
    userId: string,
    activityTypeId?: string
  ): Promise<any[]> {
    try {
      const whereConditions = [
        eq(userActivityTypeSkillSummaries.userId, userId),
      ];

      if (activityTypeId) {
        whereConditions.push(
          eq(userActivityTypeSkillSummaries.activityTypeId, activityTypeId)
        );
      }

      const query = db
        .select({
          skillDefinitionId: userActivityTypeSkillSummaries.skillDefinitionId,
          activityTypeId: userActivityTypeSkillSummaries.activityTypeId,
          averageRating: userActivityTypeSkillSummaries.averageRating,
          totalRatings: userActivityTypeSkillSummaries.totalRatings,
          trend: userActivityTypeSkillSummaries.trend,
          lastCalculatedAt: userActivityTypeSkillSummaries.lastCalculatedAt,
          skillName: skillDefinitions.skillType,
          skillIsGeneral: skillDefinitions.isGeneral,
          activityTypeName: activityTypes.name,
        })
        .from(userActivityTypeSkillSummaries)
        .leftJoin(
          skillDefinitions,
          eq(
            userActivityTypeSkillSummaries.skillDefinitionId,
            skillDefinitions.id
          )
        )
        .leftJoin(
          activityTypes,
          eq(userActivityTypeSkillSummaries.activityTypeId, activityTypes.id)
        )
        .where(and(...whereConditions));

      return await query;
    } catch (error) {
      console.error("Error getting user skill summaries:", error);
      throw error;
    }
  }

  /**
   * Get skill leaderboard for a specific skill
   */
  async getSkillLeaderboard(
    skillDefinitionId: string,
    activityTypeId?: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<any[]> {
    try {
      const conditions = [
        eq(userActivityTypeSkillSummaries.skillDefinitionId, skillDefinitionId),
      ];

      if (activityTypeId) {
        conditions.push(
          eq(userActivityTypeSkillSummaries.activityTypeId, activityTypeId)
        );
      }

      return await db
        .select({
          userId: userActivityTypeSkillSummaries.userId,
          averageRating: userActivityTypeSkillSummaries.averageRating,
          totalRatings: userActivityTypeSkillSummaries.totalRatings,
          trend: userActivityTypeSkillSummaries.trend,
          lastCalculatedAt: userActivityTypeSkillSummaries.lastCalculatedAt,
          skillName: skillDefinitions.skillType,
          activityTypeName: activityTypes.name,
        })
        .from(userActivityTypeSkillSummaries)
        .leftJoin(
          skillDefinitions,
          eq(
            userActivityTypeSkillSummaries.skillDefinitionId,
            skillDefinitions.id
          )
        )
        .leftJoin(
          activityTypes,
          eq(userActivityTypeSkillSummaries.activityTypeId, activityTypes.id)
        )
        .where(and(...conditions))
        .orderBy(
          sql`CAST(${userActivityTypeSkillSummaries.averageRating} AS DECIMAL) DESC`
        )
        .limit(limit)
        .offset(offset);
    } catch (error) {
      console.error("Error getting skill leaderboard:", error);
      throw error;
    }
  }

  /**
   * Get recent skill ratings with comments
   */
  async getRecentRatingsWithComments(
    userId: string,
    limit: number = 10
  ): Promise<any[]> {
    try {
      return await db
        .select({
          id: userActivitySkillRatings.id,
          ratingValue: userActivitySkillRatings.ratingValue,
          comment: userActivitySkillRatings.comment,
          confidence: userActivitySkillRatings.confidence,
          createdAt: userActivitySkillRatings.createdAt,
          skillName: skillDefinitions.skillType,
          activityDescription: activities.description,
        })
        .from(userActivitySkillRatings)
        .leftJoin(
          skillDefinitions,
          eq(userActivitySkillRatings.skillDefinitionId, skillDefinitions.id)
        )
        .leftJoin(
          activities,
          eq(userActivitySkillRatings.activityId, activities.id)
        )
        .where(
          and(
            eq(userActivitySkillRatings.ratedUserId, userId),
            sql`${userActivitySkillRatings.comment} IS NOT NULL AND ${userActivitySkillRatings.comment} != ''`
          )
        )
        .orderBy(sql`${userActivitySkillRatings.createdAt} DESC`)
        .limit(limit);
    } catch (error) {
      console.error("Error getting recent ratings with comments:", error);
      throw error;
    }
  }

  /**
   * Batch recalculate all skill summaries (for maintenance)
   */
  async batchRecalculateAllSummaries(): Promise<void> {
    try {
      console.log("🔄 Starting batch recalculation of all skill summaries...");

      // Get all unique user-skill combinations that have ratings
      const userSkillCombinations = await db
        .selectDistinct({
          userId: userActivitySkillRatings.ratedUserId,
          skillDefinitionId: userActivitySkillRatings.skillDefinitionId,
        })
        .from(userActivitySkillRatings);

      let processed = 0;
      for (const combination of userSkillCombinations) {
        await this.recalculateSkillSummaries(
          combination.userId,
          combination.skillDefinitionId
        );
        processed++;

        if (processed % 100 === 0) {
          console.log(
            `📊 Processed ${processed}/${userSkillCombinations.length} skill summaries`
          );
        }
      }

      console.log(
        `✅ Completed batch recalculation of ${processed} skill summaries`
      );
    } catch (error) {
      console.error("Error in batch recalculation:", error);
      throw error;
    }
  }
}

export const skillRatingService = new SkillRatingService();
