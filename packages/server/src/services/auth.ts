// src/services/auth.service.ts - Complete auth service with zod validation
import { db } from "../db/client.js";
import {
  activities,
  activityParticipants,
  activityTypes,
  skillDefinitions,
  userActivityTypeELOs,
  userActivityTypeSkillSummaries,
  userConnections,
  users,
} from "../db/schema.js";
import { eq, and, sql, or, notInArray, ilike } from "drizzle-orm";
import { signJWT, verifyJWT } from "../auth/jwt.js";
import { hashPassword, verifyPassword } from "../utils/security.js";
import {
  registerUserSchema,
  loginUserSchema,
  updateUserSchema,
  selectUserSchema,
  type RegisterUser,
  type LoginUser,
  type UpdateUser,
  type User,
} from "../db/zod.schema.js";

export interface AuthResult {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
  message?: string;
  refreshToken?: string;
  expiresIn?: string;
}

export interface TokenPayload {
  userId: string;
  username: string;
  email: string;
  role: string;
}

export class AuthService {
  /**
   * Register a new user
   */
  async register(userData: RegisterUser): Promise<AuthResult> {
    try {
      // Validate input data with zod
      const validatedData = registerUserSchema.parse(userData);

      // Check if user already exists by email
      const existingUserByEmail = await db.query.users.findFirst({
        where: eq(users.email, validatedData.email),
      });

      if (existingUserByEmail) {
        return {
          success: false,
          error: "User with this email already exists",
        };
      }

      // Check if username is taken
      const existingUserByUsername = await db.query.users.findFirst({
        where: eq(users.username, validatedData.username),
      });

      if (existingUserByUsername) {
        return {
          success: false,
          error: "Username already taken",
        };
      }

      // Hash password
      const passwordHash = await hashPassword(validatedData.password);

      // Create user
      const [newUser] = await db
        .insert(users)
        .values({
          username: validatedData.username,
          email: validatedData.email,
          passwordHash,
          avatarUrl: validatedData.avatarUrl || null,
          role: "user",
        })
        .returning({
          id: users.id,
          publicId: users.publicId,
          username: users.username,
          email: users.email,
          avatarUrl: users.avatarUrl,
          role: users.role,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        });

      // Validate returned user with zod
      const validatedUser = selectUserSchema.parse({
        ...newUser,
        passwordHash: null, // Don't include password in response
      });

      // Generate JWT token
      const token = await signJWT({
        userId: validatedUser.id,
        username: validatedUser.username,
        email: validatedUser.email,
        role: validatedUser.role,
      });

      return {
        success: true,
        user: validatedUser,
        token,
        message: "User registered successfully",
      };
    } catch (error) {
      console.error("Error during registration:", error);

      if (error instanceof Error && error.name === "ZodError") {
        return {
          success: false,
          error: "Invalid input data",
        };
      }

      return {
        success: false,
        error: "Registration failed",
      };
    }
  }

  /**
   * Login user
   */
  async login(credentials: LoginUser): Promise<AuthResult> {
    try {
      // Validate input data with zod
      const validatedCredentials = loginUserSchema.parse(credentials);

      // Find user by email
      const user = await db.query.users.findFirst({
        where: eq(users.email, validatedCredentials.email),
      });

      if (!user) {
        return {
          success: false,
          error: "Invalid email or password",
        };
      }

      // Verify password
      const isPasswordValid = await verifyPassword(
        validatedCredentials.password,
        user.passwordHash || ""
      );

      if (!isPasswordValid) {
        return {
          success: false,
          error: "Invalid email or password",
        };
      }

      // Validate user data with zod (excluding password)
      const validatedUser = selectUserSchema.parse({
        ...user,
        passwordHash: null,
      });

      // Generate JWT token
      const token = await signJWT({
        userId: validatedUser.id,
        username: validatedUser.username,
        email: validatedUser.email,
        role: validatedUser.role,
      });

      // Update last login timestamp (optional)
      await db
        .update(users)
        .set({ updatedAt: new Date() })
        .where(eq(users.id, user.id));

      return {
        success: true,
        user: validatedUser,
        token,
        message: "Login successful",
      };
    } catch (error) {
      console.error("Error during login:", error);

      if (error instanceof Error && error.name === "ZodError") {
        return {
          success: false,
          error: "Invalid input data",
        };
      }

      return {
        success: false,
        error: "Login failed",
      };
    }
  }

  /**
   * Verify JWT token and get user
   */
  async verifyToken(token: string): Promise<AuthResult> {
    try {
      // Verify JWT token
      const payload = await verifyJWT(token);

      if (!payload || !payload.userId) {
        return {
          success: false,
          error: "Invalid token",
        };
      }

      // Get current user data from database
      const user = await db.query.users.findFirst({
        where: eq(users.id, payload.userId),
      });

      if (!user) {
        return {
          success: false,
          error: "User not found",
        };
      }

      // Validate user data with zod
      const validatedUser = selectUserSchema.parse({
        ...user,
        passwordHash: null,
      });

      return {
        success: true,
        user: validatedUser,
        token, // Return the same token
      };
    } catch (error) {
      console.error("Error verifying token:", error);
      return {
        success: false,
        error: "Token verification failed",
      };
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(
    userId: string,
    updateData: UpdateUser
  ): Promise<AuthResult> {
    try {
      // Validate input data with zod
      const validatedData = updateUserSchema.parse(updateData);

      // Check if user exists
      const existingUser = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!existingUser) {
        return {
          success: false,
          error: "User not found",
        };
      }

      // Check if new username is taken (if username is being updated)
      if (
        validatedData.username &&
        validatedData.username !== existingUser.username
      ) {
        const existingUsername = await db.query.users.findFirst({
          where: and(
            eq(users.username, validatedData.username),
            eq(users.id, userId) // Exclude current user
          ),
        });

        if (existingUsername) {
          return {
            success: false,
            error: "Username already taken",
          };
        }
      }

      // Check if new email is taken (if email is being updated)
      if (validatedData.email && validatedData.email !== existingUser.email) {
        const existingEmail = await db.query.users.findFirst({
          where: and(
            eq(users.email, validatedData.email),
            eq(users.id, userId) // Exclude current user
          ),
        });

        if (existingEmail) {
          return {
            success: false,
            error: "Email already taken",
          };
        }
      }

      // Prepare update object (exclude sensitive fields)
      const updateObject: any = {
        updatedAt: new Date(),
      };

      if (validatedData.username)
        updateObject.username = validatedData.username;
      if (validatedData.email) updateObject.email = validatedData.email;
      if (validatedData.avatarUrl !== undefined)
        updateObject.avatarUrl = validatedData.avatarUrl;

      // Hash new password if provided
      if (validatedData.passwordHash) {
        updateObject.passwordHash = await hashPassword(
          validatedData.passwordHash
        );
      }

      // Update user
      const [updatedUser] = await db
        .update(users)
        .set(updateObject)
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          publicId: users.publicId,
          username: users.username,
          email: users.email,
          avatarUrl: users.avatarUrl,
          role: users.role,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        });

      // Validate updated user with zod
      const validatedUser = selectUserSchema.parse({
        ...updatedUser,
        passwordHash: null,
      });

      // Generate new token if username or email changed
      let newToken: string | undefined;
      if (validatedData.username || validatedData.email) {
        newToken = await signJWT({
          userId: validatedUser.id,
          username: validatedUser.username,
          email: validatedUser.email,
          role: validatedUser.role,
        });
      }

      return {
        success: true,
        user: validatedUser,
        token: newToken,
        message: "Profile updated successfully",
      };
    } catch (error) {
      console.error("Error updating profile:", error);

      if (error instanceof Error && error.name === "ZodError") {
        return {
          success: false,
          error: "Invalid input data",
        };
      }

      return {
        success: false,
        error: "Profile update failed",
      };
    }
  }

  /**
   * Change user password
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<AuthResult> {
    try {
      // Get user with current password hash
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        return {
          success: false,
          error: "User not found",
        };
      }

      // // Verify current password
      // const isCurrentPasswordValid = await verifyPassword(
      //   currentPassword,
      //   user.passwordHash || ""
      // );

      // if (!isCurrentPasswordValid) {
      //   return {
      //     success: false,
      //     error: "Current password is incorrect",
      //   };
      // }

      // Validate new password (minimum 8 characters)
      if (newPassword.length < 8) {
        return {
          success: false,
          error: "New password must be at least 8 characters long",
        };
      }

      // Hash new password
      const newPasswordHash = await hashPassword(newPassword);

      // Update password
      await db
        .update(users)
        .set({
          passwordHash: newPasswordHash,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      return {
        success: true,
        message: "Password changed successfully",
      };
    } catch (error) {
      console.error("Error changing password:", error);
      return {
        success: false,
        error: "Password change failed",
      };
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<AuthResult> {
    try {
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        return {
          success: false,
          error: "User not found",
        };
      }

      // Validate user data with zod
      const validatedUser = selectUserSchema.parse({
        ...user,
        passwordHash: null,
      });

      return {
        success: true,
        user: validatedUser,
      };
    } catch (error) {
      console.error("Error getting user by ID:", error);
      return {
        success: false,
        error: "Failed to get user",
      };
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<AuthResult> {
    try {
      // Verify the refresh token
      const payload = await verifyJWT(refreshToken);

      if (!payload) {
        return {
          success: false,
          error: "Invalid refresh token",
        };
      }

      // Get user from database to ensure they still exist
      const user = await db.query.users.findFirst({
        where: eq(users.id, payload.userId),
      });

      if (!user) {
        return {
          success: false,
          error: "User not found",
        };
      }

      // Validate user with zod
      const validatedUser = selectUserSchema.parse({
        ...user,
        passwordHash: null, // Don't include password in response
      });

      // Generate new access token
      const newToken = await signJWT({
        userId: validatedUser.id,
        username: validatedUser.username,
        email: validatedUser.email,
        role: validatedUser.role,
      });

      // Generate new refresh token (optional - rotate refresh tokens)
      const newRefreshToken = await signJWT(
        {
          userId: validatedUser.id,
          username: validatedUser.username,
          email: validatedUser.email,
          role: validatedUser.role,
        },
        { expiresIn: "7d" }
      ); // Longer expiry for refresh token

      return {
        success: true,
        user: validatedUser,
        token: newToken,
        refreshToken: newRefreshToken,
        expiresIn: "3600", // 1 hour
        message: "Token refreshed successfully",
      };
    } catch (error) {
      console.error("Error refreshing token:", error);
      return {
        success: false,
        error: "Token refresh failed",
      };
    }
  }

  /**
   * Get user with stats (ELO, activities, etc.)
   */
  async getUserWithStats(userId: string): Promise<{
    success: boolean;
    user?: User;
    stats?: {
      averageELO: number;
      totalActivities: number;
      activitiesThisWeek: number;
      friendsCount: number;
      topSkills: Array<{
        skillName: string;
        averageRating: number;
        activityType: string;
      }>;
    };
    error?: string;
  }> {
    try {
      // Get user
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        return {
          success: false,
          error: "User not found",
        };
      }

      // Validate user with zod
      const validatedUser = selectUserSchema.parse({
        ...user,
        passwordHash: null,
      });

      // Get user's ELO scores
      const eloScores = await db
        .select({
          eloScore: userActivityTypeELOs.eloScore,
        })
        .from(userActivityTypeELOs)
        .where(eq(userActivityTypeELOs.userId, userId));

      const averageELO =
        eloScores.length > 0
          ? Math.round(
              eloScores.reduce((sum, elo) => sum + elo.eloScore, 0) /
                eloScores.length
            )
          : 1200;

      // Get total activities count
      const totalActivitiesResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(activityParticipants)
        .where(eq(activityParticipants.userId, userId));

      const totalActivities = totalActivitiesResult[0]?.count || 0;

      // Get activities this week
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const activitiesThisWeekResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(activityParticipants)
        .leftJoin(
          activities,
          eq(activityParticipants.activityId, activities.id)
        )
        .where(
          and(
            eq(activityParticipants.userId, userId),
            sql`${activities.createdAt} >= ${oneWeekAgo}`
          )
        );

      const activitiesThisWeek = activitiesThisWeekResult[0]?.count || 0;

      // Get friends count
      const friendsCountResult = await db
        .select({ count: sql<number>`count(*)` })
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

      const friendsCount = friendsCountResult[0]?.count || 0;

      // Get top skills (simplified - you might want to use your skill summary tables)
      const topSkills = await db
        .select({
          skillName: skillDefinitions.skillType,
          averageRating: userActivityTypeSkillSummaries.averageRating,
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
        .where(eq(userActivityTypeSkillSummaries.userId, userId))
        .orderBy(sql`${userActivityTypeSkillSummaries.averageRating} DESC`)
        .limit(5);

      const stats = {
        averageELO,
        totalActivities,
        activitiesThisWeek,
        friendsCount,
        topSkills: topSkills.map((skill) => ({
          skillName: skill.skillName || "Unknown",
          averageRating: skill.averageRating || 0,
          activityType: skill.activityTypeName || "Unknown",
        })),
      };

      return {
        success: true,
        user: validatedUser,
        stats,
      };
    } catch (error) {
      console.error("Error getting user with stats:", error);
      return {
        success: false,
        error: "Failed to get user data",
      };
    }
  }

  /**
   * Search users with pagination and filtering (Alternative cleaner version)
   */
  async searchUsers(
    userId: string,
    searchParams: {
      searchTerm: string;
      limit: number;
      excludeConnected: boolean;
      activityTypeId?: string;
    }
  ): Promise<{
    success: boolean;
    users?: User[];
    totalCount?: number;
    hasMore?: boolean;
    error?: string;
  }> {
    try {
      const { searchTerm, limit, excludeConnected, activityTypeId } =
        searchParams;

      // Get connected user IDs first if needed
      let excludeUserIds: string[] = [];
      if (excludeConnected) {
        const connectedUsers = await db
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

        excludeUserIds = connectedUsers.map((u) => u.connectedUserId);
      }

      // Add current user to exclude list
      excludeUserIds.push(userId);

      // --- Fix: Build conditions using Drizzle helpers ---
      const whereConditions = [
        // --- Fix: Use inArray for parameterized NOT IN ---
        notInArray(users.id, excludeUserIds), // .not() inverts the IN to NOT IN
        or(
          ilike(users.username, `%${searchTerm}%`), // Use ilike helper
          ilike(users.email, `%${searchTerm}%`) // Use ilike helper
        ),
      ];

      // Build query based on whether we need to filter by activity type
      let query;
      query = db
        .select({
          id: users.id,
          publicId: users.publicId,
          username: users.username,
          email: users.email,
          // passwordHash: users.passwordHash,
          avatarUrl: users.avatarUrl,
          role: users.role,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users);

      if (activityTypeId) {
        query = query
          .innerJoin(
            userActivityTypeELOs,
            eq(users.id, userActivityTypeELOs.userId)
          )
          .where(
            and(
              ...whereConditions,
              eq(userActivityTypeELOs.activityTypeId, activityTypeId)
            )
          );
      } else {
        query = query.where(and(...whereConditions));
      }

      // Execute with parameter binding
      const results = await query.limit(limit + 1).execute();

      const hasMore = results.length > limit;
      const userResults = results.slice(0, limit);

      // Validate users with zod and remove sensitive data
      const validatedUsers: User[] = userResults.map((userRes)=>{
        return selectUserSchema.parse(userRes); ;
      })

      return {
        success: true,
        users: validatedUsers,
        totalCount: userResults.length,
        hasMore,
      };
    } catch (error) {
      console.error("Error searching users:", error);
      return {
        success: false,
        error: "User search failed",
      };
    }
  }

  /**
   * Request password reset (placeholder - implement email sending)
   */
  async requestPasswordReset(email: string): Promise<AuthResult> {
    try {
      // Check if user exists
      const user = await db.query.users.findFirst({
        where: eq(users.email, email),
      });

      // Always return success for security (don't reveal if email exists)
      // In production, you would:
      // 1. Generate a secure reset token
      // 2. Store it in database with expiration
      // 3. Send email with reset link

      if (user) {
        // Generate reset token (simplified - use crypto.randomBytes in production)
        const resetToken = await signJWT(
          { userId: user.id, type: "password_reset" },
          { expiresIn: "1h" }
        );

        // TODO: Store reset token in database
        // TODO: Send email with reset link

        console.log(
          `Password reset requested for ${email}, token: ${resetToken}`
        );
      }

      return {
        success: true,
        message: "If the email exists, a password reset link has been sent",
      };
    } catch (error) {
      console.error("Error requesting password reset:", error);
      return {
        success: true,
        message: "If the email exists, a password reset link has been sent",
      };
    }
  }

  /**
   * Reset password using reset token
   */
  async resetPassword(token: string, newPassword: string): Promise<AuthResult> {
    try {
      // Verify reset token
      const payload = await verifyJWT(token);

      if (!payload || payload.type !== "password_reset") {
        return {
          success: false,
          error: "Invalid or expired reset token",
        };
      }

      // Get user
      const user = await db.query.users.findFirst({
        where: eq(users.id, payload.userId),
      });

      if (!user) {
        return {
          success: false,
          error: "User not found",
        };
      }

      // Hash new password
      const passwordHash = await hashPassword(newPassword);

      // Update password
      await db
        .update(users)
        .set({
          passwordHash,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      // TODO: Invalidate reset token in database
      // TODO: Optionally invalidate all existing sessions

      return {
        success: true,
        message: "Password reset successfully",
      };
    } catch (error) {
      console.error("Error resetting password:", error);
      return {
        success: false,
        error: "Password reset failed",
      };
    }
  }

  /**
   * Deactivate user account (soft delete)
   */
  async deactivateUser(
    userId: string,
    adminUserId: string
  ): Promise<AuthResult> {
    try {
      // Verify admin user
      const adminUser = await db.query.users.findFirst({
        where: eq(users.id, adminUserId),
      });

      if (!adminUser || adminUser.role !== "admin") {
        return {
          success: false,
          error: "Admin access required",
        };
      }

      // Check if user exists
      const targetUser = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!targetUser) {
        return {
          success: false,
          error: "User not found",
        };
      }

      // Prevent admin from deactivating themselves
      if (userId === adminUserId) {
        return {
          success: false,
          error: "Cannot deactivate your own account",
        };
      }

      // Update user role to indicate deactivation
      // In a real system, you might have an 'isActive' field
      await db
        .update(users)
        .set({
          role: "deactivated" as any, // This would need to be added to the role enum
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      return {
        success: true,
        message: "User account deactivated successfully",
      };
    } catch (error) {
      console.error("Error deactivating user:", error);
      return {
        success: false,
        error: "User deactivation failed",
      };
    }
  }
}

export const authService = new AuthService();
