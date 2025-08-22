// src/routes/auth.router.ts - Corrected with new Zod schemas
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { authenticateToken } from "../middleware/auth.js";
import { authService } from "../services/auth.js";
import { z } from "zod";

// Import updated Zod schemas
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

export const authRouter = new Hono();

// Enhanced validation schemas for auth-specific operations
const changePasswordSchema = z.object({
  currentPassword: z.string().min(8, "Current password must be at least 8 characters"),
  newPassword: z.string()
    .min(8, "New password must be at least 8 characters")
    .max(128, "Password too long")
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "Password must contain uppercase, lowercase, and number"),
});

const searchUsersSchema = z.object({
  searchTerm: z.string()
    .min(2, "Search term must be at least 2 characters")
    .max(100, "Search term too long"),
  limit: z.number().int().min(1).max(100).default(20),
  excludeConnected: z.boolean().default(false),
  activityTypeId: z.string().uuid().optional(),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email format"),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  newPassword: z.string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password too long")
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "Password must contain uppercase, lowercase, and number"),
});

// POST /auth/register - Register new user
authRouter.post(
  "/register",
  zValidator('json', registerUserSchema),
  async (c) => {
    try {
      const userData = c.req.valid('json');
      
      console.log(`🔐 Registration attempt for: ${userData.email}`);
      
      const result = await authService.register(userData);

      if (!result.success) {
        console.log(`❌ Registration failed: ${result.error}`);
        return c.json({
          success: false,
          error: result.error,
        }, 400);
      }

      console.log(`✅ User registered successfully: ${result.user?.username}`);
      
      return c.json({
        success: true,
        data: {
          user: result.user,
          token: result.token,
          refreshToken: result.refreshToken,
        },
        message: result.message,
      }, 201);
    } catch (error) {
      console.error("Registration error:", error);
      
      if (error instanceof z.ZodError) {
        return c.json({
          success: false,
          error: "Invalid input data",
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        }, 400);
      }
      
      return c.json({
        success: false,
        error: "Registration failed",
      }, 500);
    }
  }
);

// POST /auth/login - Login user
authRouter.post(
  "/login",
  zValidator('json', loginUserSchema),
  async (c) => {
    try {
      const credentials = c.req.valid('json');
      
      console.log(`🔐 Login attempt for: ${credentials.email}`);
      
      const result = await authService.login(credentials);

      if (!result.success) {
        console.log(`❌ Login failed for ${credentials.email}: ${result.error}`);
        return c.json({
          success: false,
          error: result.error,
        }, 401);
      }

      console.log(`✅ User logged in successfully: ${result.user?.username}`);
      
      return c.json({
        success: true,
        data: {
          user: result.user,
          token: result.token,
          refreshToken: result.refreshToken,
          expiresIn: result.expiresIn || 3600,
        },
        message: result.message,
      });
    } catch (error) {
      console.error("Login error:", error);
      
      if (error instanceof z.ZodError) {
        return c.json({
          success: false,
          error: "Invalid credentials format",
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        }, 400);
      }
      
      return c.json({
        success: false,
        error: "Login failed",
      }, 500);
    }
  }
);

// POST /auth/refresh - Refresh access token
authRouter.post(
  "/refresh",
  zValidator('json', refreshTokenSchema),
  async (c) => {
    try {
      const { refreshToken } = c.req.valid('json');
      
      console.log(`🔄 Token refresh attempt`);
      
      const result = await authService.refreshToken(refreshToken);

      if (!result.success) {
        console.log(`❌ Token refresh failed: ${result.error}`);
        return c.json({
          success: false,
          error: result.error,
        }, 401);
      }

      console.log(`✅ Token refreshed successfully for user: ${result.user?.username}`);
      
      return c.json({
        success: true,
        data: {
          user: result.user,
          token: result.token,
          refreshToken: result.refreshToken,
          expiresIn: result.expiresIn || 3600,
        },
      });
    } catch (error) {
      console.error("Token refresh error:", error);
      return c.json({
        success: false,
        error: "Token refresh failed",
      }, 500);
    }
  }
);

// Add this to your auth.router.ts
authRouter.get('/me', authenticateToken, async (c) => {
  try {
    const user = c.get('user');
    
    if (!user) {
      return c.json({
        success: false,
        error: 'User not found'
      }, 401);
    }

    console.log(`👤 Getting user info for: ${user.username}`);

    // Return user info without sensitive data
    return c.json({
      success: true,
      data: {
        user: {
          id: user.id,
          publicId: user.publicId,
          username: user.username,
          email: user.email,
          avatarUrl: user.avatarUrl,
          role: user.role,
          createdAt: user.createdAt?.toISOString(),
          updatedAt: user.updatedAt?.toISOString(),
        }
      }
    });
  } catch (error) {
    console.error('Error getting user info:', error);
    return c.json({
      success: false,
      error: 'Failed to get user information'
    }, 500);
  }
});

// PUT /auth/profile - Update user profile
authRouter.put(
  "/profile",
  zValidator('json', updateUserSchema),
  authenticateToken,
  async (c) => {
    try {
      const user = c.get("user");
      const updateData = c.req.valid('json');
      
      console.log(`📝 Profile update for user: ${user.username}`);
      
      const result = await authService.updateProfile(user.id, updateData);

      if (!result.success) {
        console.log(`❌ Profile update failed: ${result.error}`);
        return c.json({
          success: false,
          error: result.error,
        }, 400);
      }

      console.log(`✅ Profile updated successfully for: ${user.username}`);
      
      return c.json({
        success: true,
        data: {
          user: result.user,
        },
        message: "Profile updated successfully",
      });
    } catch (error) {
      console.error("Profile update error:", error);
      
      if (error instanceof z.ZodError) {
        return c.json({
          success: false,
          error: "Invalid profile data",
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        }, 400);
      }
      
      return c.json({
        success: false,
        error: "Profile update failed",
      }, 500);
    }
  }
);

// POST /auth/change-password - Change user password
authRouter.post(
  "/change-password",
  zValidator('json', changePasswordSchema),
  authenticateToken,
  async (c) => {
    try {
      const user = c.get("user");
      const passwordData = c.req.valid('json');
      
      console.log(`🔐 Password change request for user: ${user.username}`);
      
      const result = await authService.changePassword(
        user.id, 
        passwordData.currentPassword, 
        passwordData.newPassword
      );

      if (!result.success) {
        console.log(`❌ Password change failed: ${result.error}`);
        return c.json({
          success: false,
          error: result.error,
        }, 400);
      }

      console.log(`✅ Password changed successfully for: ${user.username}`);
      
      return c.json({
        success: true,
        message: "Password changed successfully",
      });
    } catch (error) {
      console.error("Password change error:", error);
      return c.json({
        success: false,
        error: "Password change failed",
      }, 500);
    }
  }
);

// GET /auth/search-users - Search for users
authRouter.get(
  "/search-users",
  zValidator('query', searchUsersSchema),
  authenticateToken,
  async (c) => {
    try {
      const user = c.get("user");
      const searchParams = c.req.valid('query');
      
      console.log(`🔍 User search by ${user.username}: "${searchParams.searchTerm}"`);
      
      const result = await authService.searchUsers(user.id, searchParams);

      if (!result.success) {
        return c.json({
          success: false,
          error: result.error,
        }, 400);
      }

      return c.json({
        success: true,
        data: {
          users: result.users,
          totalCount: result.totalCount,
          hasMore: result.hasMore,
        },
      });
    } catch (error) {
      console.error("User search error:", error);
      return c.json({
        success: false,
        error: "User search failed",
      }, 500);
    }
  }
);

// POST /auth/logout - Logout user
authRouter.post("/logout", authenticateToken, async (c) => {
  try {
    const user = c.get("user");
    
    console.log(`👋 Logout request for user: ${user.username}`);
    
    console.log(`✅ User logged out successfully: ${user.username}`);
    
    return c.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    return c.json({
      success: false,
      error: "Logout failed",
    }, 500);
  }
});

// POST /auth/forgot-password - Request password reset
authRouter.post(
  "/forgot-password",
  zValidator('json', forgotPasswordSchema),
  async (c) => {
    try {
      const { email } = c.req.valid('json');
      
      console.log(`🔐 Password reset request for: ${email}`);
      
      const result = await authService.requestPasswordReset(email);

      return c.json({
        success: true,
        message: "If the email exists, a password reset link has been sent",
      });
    } catch (error) {
      console.error("Password reset request error:", error);
      return c.json({
        success: true,
        message: "If the email exists, a password reset link has been sent",
      });
    }
  }
);

// POST /auth/reset-password - Reset password with token
authRouter.post(
  "/reset-password",
  zValidator('json', resetPasswordSchema),
  async (c) => {
    try {
      const { token, newPassword } = c.req.valid('json');
      
      console.log(`🔐 Password reset attempt with token`);
      
      const result = await authService.resetPassword(token, newPassword);

      if (!result.success) {
        console.log(`❌ Password reset failed: ${result.error}`);
        return c.json({
          success: false,
          error: result.error,
        }, 400);
      }

      console.log(`✅ Password reset successfully`);
      
      return c.json({
        success: true,
        message: "Password reset successfully",
      });
    } catch (error) {
      console.error("Password reset error:", error);
      return c.json({
        success: false,
        error: "Password reset failed",
      }, 500);
    }
  }
);

export default authRouter;