// src/auth/jwt.ts - JWT token management service
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const JWT_ISSUER = process.env.JWT_ISSUER || 'sports-activity-platform';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'sports-activity-users';

// Convert string secret to Uint8Array for jose
const secret = new TextEncoder().encode(JWT_SECRET);

export interface TokenPayload extends JWTPayload {
  userId: string;
  username: string;
  email: string;
  role: string;
}

export interface TokenOptions {
  expiresIn?: string; // e.g., '24h', '7d', '30m'
  issuer?: string;
  audience?: string;
}

/**
 * Sign a JWT token with user payload
 */
export async function signJWT(
  payload: Omit<TokenPayload, 'iat' | 'exp' | 'iss' | 'aud'>,
  options: TokenOptions = {}
): Promise<string> {
  try {
    const {
      expiresIn = '24h',
      issuer = JWT_ISSUER,
      audience = JWT_AUDIENCE,
    } = options;

    // Convert expiresIn to seconds
    const expirationTime = parseExpirationTime(expiresIn);
    const now = Math.floor(Date.now() / 1000);

    const jwt = await new SignJWT({
      userId: payload.userId,
      username: payload.username,
      email: payload.email,
      role: payload.role,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + expirationTime)
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(payload.userId)
      .sign(secret);

    return jwt;
  } catch (error) {
    console.error('Error signing JWT:', error);
    throw new Error('Failed to sign JWT token');
  }
}

/**
 * Verify and decode a JWT token
 */
export async function verifyJWT(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    // Validate required fields
    if (!payload.userId || !payload.username || !payload.email || !payload.role) {
      console.error('Invalid JWT payload: missing required fields');
      return null;
    }

    return {
      userId: payload.userId as string,
      username: payload.username as string,
      email: payload.email as string,
      role: payload.role as string,
      iat: payload.iat,
      exp: payload.exp,
      iss: payload.iss,
      aud: payload.aud,
      sub: payload.sub,
    };
  } catch (error) {
    if (error instanceof Error) {
      // Log specific JWT errors for debugging
      if (error.message.includes('expired')) {
        console.warn('JWT token has expired');
      } else if (error.message.includes('invalid')) {
        console.warn('JWT token is invalid');
      } else {
        console.error('JWT verification error:', error.message);
      }
    }
    return null;
  }
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Generate a refresh token (longer expiration)
 */
export async function signRefreshToken(
  payload: Omit<TokenPayload, 'iat' | 'exp' | 'iss' | 'aud'>,
  options: TokenOptions = {}
): Promise<string> {
  return signJWT(payload, {
    ...options,
    expiresIn: options.expiresIn || '7d', // Default 7 days for refresh tokens
  });
}

/**
 * Create both access and refresh tokens
 */
export async function createTokenPair(
  payload: Omit<TokenPayload, 'iat' | 'exp' | 'iss' | 'aud'>
): Promise<{ accessToken: string; refreshToken: string }> {
  try {
    const [accessToken, refreshToken] = await Promise.all([
      signJWT(payload, { expiresIn: '1h' }), // Short-lived access token
      signRefreshToken(payload, { expiresIn: '7d' }), // Long-lived refresh token
    ]);

    return { accessToken, refreshToken };
  } catch (error) {
    console.error('Error creating token pair:', error);
    throw new Error('Failed to create token pair');
  }
}

/**
 * Decode JWT without verification (for debugging)
 */
export function decodeJWT(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf-8')
    );

    return payload;
  } catch (error) {
    console.error('Error decoding JWT:', error);
    return null;
  }
}

/**
 * Check if a token is expired without verifying signature
 */
export function isTokenExpired(token: string): boolean {
  try {
    const decoded = decodeJWT(token);
    if (!decoded || !decoded.exp) {
      return true;
    }

    const now = Math.floor(Date.now() / 1000);
    return decoded.exp < now;
  } catch (error) {
    return true;
  }
}

/**
 * Get token expiration time
 */
export function getTokenExpiration(token: string): Date | null {
  try {
    const decoded = decodeJWT(token);
    if (!decoded || !decoded.exp) {
      return null;
    }

    return new Date(decoded.exp * 1000);
  } catch (error) {
    return null;
  }
}

/**
 * Parse expiration time string to seconds
 */
function parseExpirationTime(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid expiration time format: ${expiresIn}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 60 * 60;
    case 'd':
      return value * 60 * 60 * 24;
    default:
      throw new Error(`Unsupported time unit: ${unit}`);
  }
}

/**
 * Validate JWT configuration
 */
export function validateJWTConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!JWT_SECRET || JWT_SECRET === 'your-super-secret-jwt-key-change-this-in-production') {
    errors.push('JWT_SECRET environment variable must be set to a secure value');
  }

  if (JWT_SECRET && JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET should be at least 32 characters long');
  }

  if (!JWT_ISSUER) {
    errors.push('JWT_ISSUER environment variable should be set');
  }

  if (!JWT_AUDIENCE) {
    errors.push('JWT_AUDIENCE environment variable should be set');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Validate configuration on module load (only in development)
if (process.env.NODE_ENV === 'development') {
  const validation = validateJWTConfig();
  if (!validation.valid) {
    console.warn('JWT Configuration Issues:');
    validation.errors.forEach(error => console.warn(`  - ${error}`));
  }
}