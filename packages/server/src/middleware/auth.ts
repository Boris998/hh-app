// packages/server/src/middlewares/auth.ts
import type { Context, Next } from 'hono';
import { jwtVerify } from 'jose';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export type JWTPayload = {
  userId: number;
  iat?: number;
  exp?: number;
}

export type User = {
  id: number;
  publicId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const authenticateToken = async (c: Context, next: Next) => {
  try {
    // Get token from Authorization header
    const authHeader = c.req.header('Authorization');
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : null;

    if (!token) {
      return c.json({ error: 'Access token required' }, 401);
    }

    // Verify JWT token
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      console.error('JWT_SECRET environment variable is not set');
      return c.json({ error: 'Server configuration error' }, 500);
    }

    let payload: JWTPayload;
    try {
      const secret = new TextEncoder().encode(JWT_SECRET);
      const { payload: jwtPayload } = await jwtVerify(token, secret);
      payload = jwtPayload as unknown as JWTPayload;
    } catch (jwtError) {
      return c.json({ error: 'Invalid or expired token' }, 401);
    }

    // Get user from database
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (user.length === 0) {
      return c.json({ error: 'User not found' }, 401);
    }

    // Store user in context for use in route handlers
    c.set('user', user[0] as User);
    
    await next();
  } catch (error) {
    console.error('Authentication error:', error);
    return c.json({ error: 'Authentication failed' }, 500);
  }
};

// Optional: Middleware for routes that work with or without authentication
export const optionalAuth = async (c: Context, next: Next) => {
  try {
    const authHeader = c.req.header('Authorization');
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : null;

    if (token) {
      const JWT_SECRET = process.env.JWT_SECRET;
      if (JWT_SECRET) {
        try {
          const secret = new TextEncoder().encode(JWT_SECRET);
          const { payload } = await jwtVerify(token, secret);
          const jwtPayload = payload as unknown as JWTPayload;
          
          const user = await db
            .select()
            .from(users)
            .where(eq(users.id, jwtPayload.userId))
            .limit(1);

          if (user.length > 0) {
            c.set('user', user[0] as User);
          }
        } catch (jwtError) {
          // Token is invalid, but we continue without setting user
        }
      }
    }
    
    await next();
  } catch (error) {
    // Continue without authentication
    await next();
  }
};