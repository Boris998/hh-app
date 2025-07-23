// src/routes/auth.router.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { SessionService } from '../auth/session';
import { authenticateToken, type User } from '../middleware/auth'; // Updated import
import { 
  successResponse, 
  AppError, 
  ErrorCode, 
  unauthorized,
  badRequest 
} from '../utils/responses';

const auth = new Hono();

// Validation schemas
const LoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required')
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

// POST /auth/login
auth.post('/login', zValidator('json', LoginSchema), async (c) => {
  const { email, password } = c.req.valid('json');
  
  try {
    // TODO: Replace with actual user validation against database
    // For now, mock user data - you'll replace this with your user service
    const user = await validateUserCredentials(email, password);
    
    if (!user) {
      return unauthorized(c, 'Invalid email or password');
    }
    
    const tokens = await SessionService.createSession({
      ...user,
      id: user.id.toString()
    });
    
    return successResponse(c, {
      user: { 
        id: user.id, 
        publicId: user.publicId,
        email: user.email, 
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl
      },
      tokens
    }, 200, 'Login successful');
  } catch (error) {
    console.error('Login error:', error);
    throw new AppError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to process login request',
      500
    );
  }
});

// POST /auth/refresh
auth.post('/refresh', zValidator('json', RefreshSchema), async (c) => {
  const { refreshToken } = c.req.valid('json');
  
  try {
    const newTokens = await SessionService.refreshSession(refreshToken);
    
    if (!newTokens) {
      return unauthorized(c, 'Invalid or expired refresh token');
    }
    
    return successResponse(c, { tokens: newTokens }, 200, 'Tokens refreshed');
  } catch (error) {
    console.error('Token refresh error:', error);
    throw new AppError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to refresh tokens',
      500
    );
  }
});

// POST /auth/logout
auth.post('/logout', authenticateToken, async (c) => { // Use authenticateToken directly
  try {
    const user = c.get('user') as User;
    await SessionService.revokeRefreshToken(user.id.toString()); // Use user.id instead of user.userId
    
    return successResponse(c, { message: 'Logged out successfully' }, 200);
  } catch (error) {
    console.error('Logout error:', error);
    throw new AppError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to logout',
      500
    );
  }
});

// GET /auth/me
auth.get('/me', authenticateToken, async (c) => { // Use authenticateToken directly
  try {
    const user = c.get('user') as User;
    
    return successResponse(c, { 
      user: {
        id: user.id,
        publicId: user.publicId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    }, 200);
  } catch (error) {
    console.error('Get user profile error:', error);
    throw new AppError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to fetch user profile',
      500
    );
  }
});

// Mock function - replace with your actual user validation
async function validateUserCredentials(email: string, password: string): Promise<User | null> {
  // TODO: Replace with actual database query and password verification using bcrypt
  // This should:
  // 1. Query user by email from database
  // 2. Compare provided password with hashed password using bcrypt
  // 3. Return user data if valid, null if invalid
  
  // Mock implementation for development
  if (email === 'user@example.com' && password === 'password') {
    return {
      id: 1,
      publicId: 'user-123',
      email,
      firstName: 'Test',
      lastName: 'User',
      avatarUrl: 'avatarurl',
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
  return null;
}

export default auth;