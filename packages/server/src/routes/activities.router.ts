// src/routes/activities.router.ts
import { Hono } from "hono";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { db } from "../db/client";
import { activities, activityParticipants } from "../db/schema";
import {
  insertActivitySchema,
  updateActivitySchema,
  type InsertActivity,
  type UpdateActivity,
} from "../db/zod.schema";
import { authenticateToken } from "../middleware/auth";
import { validateRequest } from "../middleware/validate-request";
import z from "zod";
import { zValidator } from "@hono/zod-validator";

export const activitiesRouter = new Hono();

// FIXED: Query schema with proper coercion for URL params
const querySchema = z.object({
  page: z.union([z.string(), z.number()]).optional().default(1).transform((val) => 
    typeof val === 'string' ? parseInt(val, 10) : val
  ),
  limit: z.union([z.string(), z.number()]).optional().default(10).transform((val) => 
    Math.min(typeof val === 'string' ? parseInt(val, 10) : val, 100)
  ),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  activityType: z.string().optional(),
  location: z.string().optional(),
});

// Get activities list with proper query parameter handling
activitiesRouter.get("/", async (c) => {
  // Manual query parameter parsing to handle string-to-number conversion
  const rawPage = c.req.query("page") || "1";
  const rawLimit = c.req.query("limit") || "10";
  const dateFrom = c.req.query("dateFrom");
  const dateTo = c.req.query("dateTo");
  const activityType = c.req.query("activityType");
  const location = c.req.query("location");

  const query = {
    page: parseInt(rawPage, 10) || 1,
    limit: Math.min(parseInt(rawLimit, 10) || 10, 100),
    dateFrom,
    dateTo,
    activityType,
    location,
  };

  try {
    const offset = (query.page - 1) * query.limit;

    // Build query conditions
    const conditions = [];

    if (query.dateFrom) {
      conditions.push(gte(activities.dateTime, new Date(query.dateFrom)));
    }
    if (query.dateTo) {
      conditions.push(lte(activities.dateTime, new Date(query.dateTo)));
    }
    if (query.location) {
      conditions.push(sql`location ILIKE ${`%${query.location}%`}`);
    }
    if (query.activityType) {
      conditions.push(eq(activities.activityTypeId, query.activityType));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count for pagination
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(activities)
      .where(whereClause)
      .execute();

    const total = Number(totalResult[0]?.count || 0);

    // Get paginated results
    const result = await db
      .select()
      .from(activities)
      .where(whereClause)
      .limit(query.limit)
      .offset(offset)
      .orderBy(desc(activities.dateTime))
      .execute();

    return c.json({
      success: true,
      data: {
        activities: result.map((activity) => ({
          ...activity,
          createdAt: activity.createdAt?.toISOString() || null,
          updatedAt: activity.updatedAt?.toISOString() || null,
          dateTime: activity.dateTime?.toISOString() || null,
        })),
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          pages: Math.ceil(total / query.limit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching activities:", error);
    return c.json({ success: false, error: "Failed to fetch activities" }, 500);
  }
});

// Get single activity
activitiesRouter.get("/:id", async (c) => {
  const activityId = c.req.param("id");

  try {
    const activity = await db
      .select()
      .from(activities)
      .where(eq(activities.id, activityId))
      .execute();

    if (!activity[0]) {
      return c.json({ success: false, error: "Activity not found" }, 404);
    }

    return c.json({
      success: true,
      data: {
        ...activity[0],
        createdAt: activity[0].createdAt?.toISOString() || null,
        updatedAt: activity[0].updatedAt?.toISOString() || null,
        dateTime: activity[0].dateTime?.toISOString() || null,
      },
    });
  } catch (error) {
    console.error("Error fetching activity:", error);
    return c.json({ success: false, error: "Failed to fetch activity" }, 500);
  }
});

// Update activity
activitiesRouter.put(
  "/:id",
  authenticateToken,
  zValidator("json", updateActivitySchema), // Changed from validateRequest to zValidator
  async (c) => {
    try {
      const activityId = c.req.param("id");
      const updateData = c.req.valid("json"); // Changed from c.get('query') to c.req.valid('json')
      const user = c.get("user"); // Get full user object
      const userId = user.id;

      // Verify user is creator
      const existingActivity = await db
        .select()
        .from(activities)
        .where(
          and(eq(activities.id, activityId), eq(activities.creatorId, userId))
        )
        .limit(1);

      if (!existingActivity[0]) {
        return c.json(
          {
            success: false,
            error: "Activity not found or unauthorized",
          },
          404
        );
      }

      const [updatedActivity] = await db
        .update(activities)
        .set({
          ...Object.fromEntries(
            Object.entries(updateData).filter(([_, v]) => v !== null)
          ),
          updatedAt: new Date(),
        })
        .where(eq(activities.id, activityId))
        .returning();

      return c.json({
        success: true,
        data: {
          ...updatedActivity,
          createdAt: updatedActivity.createdAt?.toISOString() || null,
          updatedAt: updatedActivity.updatedAt?.toISOString() || null,
          dateTime: updatedActivity.dateTime?.toISOString() || null,
        },
      });
    } catch (error) {
      console.error("Error updating activity:", error);
      return c.json(
        {
          success: false,
          error: "Failed to update activity",
        },
        500
      );
    }
  }
);

// Delete activity
activitiesRouter.delete("/:id", authenticateToken, async (c) => {
  try {
    const activityId = c.req.param("id");
    const user = c.get("user"); // Get full user object
    const userId = user.id;

    // Verify user is creator
    const existingActivity = await db
      .select()
      .from(activities)
      .where(
        and(eq(activities.id, activityId), eq(activities.creatorId, userId))
      )
      .limit(1);

    if (!existingActivity[0]) {
      return c.json(
        {
          success: false,
          error: "Activity not found or unauthorized",
        },
        404
      );
    }

    await db.delete(activities).where(eq(activities.id, activityId));

    return c.json({
      success: true,
      message: "Activity deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting activity:", error);
    return c.json(
      {
        success: false,
        error: "Failed to delete activity",
      },
      500
    );
  }
});
