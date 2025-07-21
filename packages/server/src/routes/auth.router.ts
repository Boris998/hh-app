// src/routes/auth.router.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { SessionService } from '../auth/session';
import { 
  successResponse, 
  AppError, 
  ErrorCode, 
  unauthorized,
  badRequest 
} from '../utils/responses';
import { requireAuth } from '../middleware/auth';

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
    
    const tokens = await SessionService.createSession(user);
    
    return successResponse(c, {
      user: { 
        id: user.id, 
        email: user.email, 
        role: user.role 
      },
      tokens
    }, 200, 'Login successful');
  } catch (error) {
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
    throw new AppError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to refresh tokens',
      500
    );
  }
});

// POST /auth/logout
auth.post('/logout', requireAuth(), async (c) => {
  try {
    const user = c.get('user');
    await SessionService.revokeRefreshToken(user.userId);
    
    return successResponse(c, { message: 'Logged out successfully' }, 200);
  } catch (error) {
    throw new AppError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to logout',
      500
    );
  }
});

// GET /auth/me
auth.get('/me', requireAuth(), async (c) => {
  try {
    const user = c.get('user');
    
    // TODO: Fetch full user profile from database
    // For now, return the user from the token
    return successResponse(c, { user }, 200);
  } catch (error) {
    throw new AppError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to fetch user profile',
      500
    );
  }
});

// Mock function - replace with your actual user validation
async function validateUserCredentials(email: string, password: string) {
  // TODO: Replace with actual database query and password verification
  // This is just a mock for development
  if (email === 'user@example.com' && password === 'password') {
    return { id: 'user-123', email, role: 'user' };
  }
  return null;
}

export default auth;