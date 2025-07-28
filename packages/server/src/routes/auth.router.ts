// src/routes/auth.router.ts - Fixed with named export
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { SessionService } from '../auth/session.js';
import { authenticateToken, type User } from '../middleware/auth.js';

export const authRouter = new Hono();

// Validation schemas
const LoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required')
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

// POST /auth/login
authRouter.post('/login', zValidator('json', LoginSchema), async (c) => {
  const { email, password } = c.req.valid('json');
  
  try {
    // Mock user validation - replace with actual database query
    const user = await validateUserCredentials(email, password);
    
    if (!user) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }
    
    const tokens = await SessionService.createSession({
      id: user.id.toString(),
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
          avatarUrl: user.avatarUrl
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
    await SessionService.revokeRefreshToken(user.id.toString());
    
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

// Mock function - replace with actual user validation
async function validateUserCredentials(email: string, password: string): Promise<User | null> {
  // Mock implementation for testing
  if (email === 'test@example.com' && password === 'password') {
    return {
      id: 'user-123',
      publicId: 'user-123-public',
      email,
      username: 'testuser',
      role: 'user',
      avatarUrl: undefined,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
  return null;
}