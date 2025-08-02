// src/routes/auth.router.ts - FIXED with registration endpoint

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { SessionService } from '../auth/session.js';
import { authenticateToken, type User } from '../middleware/auth.js';

export const authRouter = new Hono();

// Validation schemas
const RegisterSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50),
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  avatarUrl: z.string().url().optional()
});

const LoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required')
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

// POST /auth/register - User registration
authRouter.post('/register', zValidator('json', RegisterSchema), async (c) => {
  const { username, email, password, avatarUrl } = c.req.valid('json');
  
  try {
    console.log(`📝 Registration attempt for: ${username} (${email})`);
    
    // Check if user already exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    
    if (existingUser.length > 0) {
      console.log(`❌ User already exists: ${email}`);
      return c.json({ error: 'User with this email already exists' }, 409);
    }

    // Check if username is taken
    const existingUsername = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    
    if (existingUsername.length > 0) {
      console.log(`❌ Username already taken: ${username}`);
      return c.json({ error: 'Username is already taken' }, 409);
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);
    
    // Create new user
    const [newUser] = await db
      .insert(users)
      .values({
        username,
        email,
        passwordHash,
        avatarUrl: avatarUrl || null,
        role: 'user',
      })
      .returning();
    
    console.log(`✅ User created: ${newUser.username} (${newUser.id})`);
    
    // Create session tokens for immediate login
    const tokens = await SessionService.createSession({
      id: newUser.id,
      email: newUser.email,
      role: newUser.role
    });
    
    return c.json({
      status: 'success',
      data: {
        user: {
          id: newUser.id,
          publicId: newUser.publicId,
          username: newUser.username,
          email: newUser.email,
          avatarUrl: newUser.avatarUrl,
          role: newUser.role
        },
        tokens
      },
      message: 'Registration successful'
    }, 201);
    
  } catch (error) {
    console.error('Registration error:', error);
    return c.json({ error: 'Failed to create user account' }, 500);
  }
});

// POST /auth/login
authRouter.post('/login', zValidator('json', LoginSchema), async (c) => {
  const { email, password } = c.req.valid('json');
  
  try {
    console.log(`🔐 Login attempt for: ${email}`);
    
    // Validate user credentials against database
    const user = await validateUserCredentials(email, password);
    
    if (!user) {
      console.log(`❌ Invalid credentials for: ${email}`);
      return c.json({ error: 'Invalid email or password' }, 401);
    }
    
    console.log(`✅ User validated: ${user.username} (${user.email})`);
    
    const tokens = await SessionService.createSession({
      id: user.id,
      email: user.email,
      role: user.role
    });
    
    return c.json({
      status: 'success',
      data: {
        user: { 
          id: user.id, 
          publicId: user.publicId,
          email: user.email, 
          username: user.username,
          avatarUrl: user.avatarUrl,
          role: user.role
        },
        tokens
      },
      message: 'Login successful'
    });
  } catch (error) {
    console.error('Login error:', error);
    return c.json({ error: 'Failed to process login request' }, 500);
  }
});

// POST /auth/refresh
authRouter.post('/refresh', zValidator('json', RefreshSchema), async (c) => {
  const { refreshToken } = c.req.valid('json');
  
  try {
    const newTokens = await SessionService.refreshSession(refreshToken);
    
    if (!newTokens) {
      return c.json({ error: 'Invalid or expired refresh token' }, 401);
    }
    
    return c.json({
      status: 'success',
      data: { tokens: newTokens },
      message: 'Tokens refreshed'
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    return c.json({ error: 'Failed to refresh tokens' }, 500);
  }
});

// POST /auth/logout
authRouter.post('/logout', authenticateToken, async (c) => {
  try {
    const user = c.get('user') as User;
    await SessionService.revokeRefreshToken(user.id);
    
    return c.json({
      status: 'success',
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    return c.json({ error: 'Failed to logout' }, 500);
  }
});

// GET /auth/me
authRouter.get('/me', authenticateToken, async (c) => {
  try {
    const user = c.get('user') as User;
    
    return c.json({
      status: 'success',
      data: {
        user: {
          id: user.id,
          publicId: user.publicId,
          email: user.email,
          username: user.username,
          avatarUrl: user.avatarUrl,
          role: user.role,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    return c.json({ error: 'Failed to fetch user profile' }, 500);
  }
});

// REAL user validation function
async function validateUserCredentials(email: string, password: string): Promise<User | null> {
  try {
    console.log(`🔍 Looking up user: ${email}`);
    
    // Get user from database
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    
    if (!user) {
      console.log(`❌ User not found: ${email}`);
      return null;
    }
    
    console.log(`👤 Found user: ${user.username} (${user.email})`);
    
    // Verify password
    if (!user.passwordHash) {
      console.log(`❌ No password hash for user: ${email}`);
      return null;
    }
    
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    
    if (!isPasswordValid) {
      console.log(`❌ Invalid password for: ${email}`);
      return null;
    }
    
    console.log(`✅ Password validated for: ${email}`);
    
    // Return user in the expected format
    return {
      id: user.id,
      publicId: user.publicId,
      email: user.email,
      username: user.username,
      avatarUrl: user.avatarUrl || undefined,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
    
  } catch (error) {
    console.error('Error validating user credentials:', error);
    return null;
  }
}