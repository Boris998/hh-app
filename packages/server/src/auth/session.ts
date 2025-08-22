// src/auth/session.ts - Enhanced session management service with Redis-like capabilities
import { signJWT, verifyJWT, extractTokenFromHeader, createTokenPair, type TokenPayload } from './jwt.js';
import { 
  enhancedRateLimiter, 
  generateSessionId, 
  hashSensitiveData, 
  encryptSensitiveData, 
  decryptSensitiveData,
  secureCompare 
} from '../utils/security.js';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export interface SessionData {
  userId: string;
  username: string;
  email: string;
  role: string;
  sessionId: string;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
  deviceInfo?: {
    platform?: string;
    browser?: string;
    version?: string;
    isMobile?: boolean;
  };
  metadata?: Record<string, any>;
}

export interface CreateSessionOptions {
  ipAddress?: string;
  userAgent?: string;
  rememberMe?: boolean;
  deviceInfo?: {
    platform?: string;
    browser?: string;
    version?: string;
    isMobile?: boolean;
  };
  metadata?: Record<string, any>;
}

export interface SessionValidationResult {
  valid: boolean;
  session?: SessionData;
  error?: string;
  shouldRefresh?: boolean;
  remainingTime?: number;
}

export interface SessionStats {
  totalSessions: number;
  activeSessions: number;
  expiredSessions: number;
  userSessionCounts: Map<string, number>;
}

/**
 * Enhanced in-memory session store with TTL and encryption
 */
class EnhancedSessionStore {
  private sessions: Map<string, { data: SessionData; encrypted?: boolean }> = new Map();
  private userSessions: Map<string, Set<string>> = new Map();
  private sessionsByExpiry: Map<number, Set<string>> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Auto-cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  set(sessionId: string, session: SessionData, encrypt: boolean = false): void {
    let sessionEntry = { data: session, encrypted: encrypt };
    
    // Encrypt sensitive session data if requested
    if (encrypt) {
      const serialized = JSON.stringify(session);
      const { encrypted, iv, tag } = encryptSensitiveData(serialized);
      sessionEntry.data = {
        ...session,
        metadata: { ...session.metadata, _encrypted: encrypted, _iv: iv, _tag: tag }
      } as SessionData;
    }

    this.sessions.set(sessionId, sessionEntry);
    
    // Track sessions per user
    if (!this.userSessions.has(session.userId)) {
      this.userSessions.set(session.userId, new Set());
    }
    this.userSessions.get(session.userId)!.add(sessionId);

    // Track by expiry time for efficient cleanup
    const expiryTime = Math.floor(session.expiresAt.getTime() / 60000); // Round to minutes
    if (!this.sessionsByExpiry.has(expiryTime)) {
      this.sessionsByExpiry.set(expiryTime, new Set());
    }
    this.sessionsByExpiry.get(expiryTime)!.add(sessionId);
  }

  get(sessionId: string): SessionData | undefined {
    const entry = this.sessions.get(sessionId);
    if (!entry) return undefined;

    let session = entry.data;

    // Decrypt if needed
    if (entry.encrypted && session.metadata?._encrypted) {
      try {
        const decrypted = decryptSensitiveData(
          session.metadata._encrypted,
          session.metadata._iv,
          session.metadata._tag
        );
        session = JSON.parse(decrypted);
      } catch (error) {
        console.error('Failed to decrypt session data:', error);
        return undefined;
      }
    }

    // Check if session is expired
    if (session.expiresAt && new Date() > session.expiresAt) {
      this.delete(sessionId);
      return undefined;
    }

    return session;
  }

  delete(sessionId: string): boolean {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      const session = entry.data;
      this.sessions.delete(sessionId);
      
      // Remove from user sessions
      const userSessionSet = this.userSessions.get(session.userId);
      if (userSessionSet) {
        userSessionSet.delete(sessionId);
        if (userSessionSet.size === 0) {
          this.userSessions.delete(session.userId);
        }
      }

      // Remove from expiry tracking
      if (session.expiresAt) {
        const expiryTime = Math.floor(session.expiresAt.getTime() / 60000);
        const expirySet = this.sessionsByExpiry.get(expiryTime);
        if (expirySet) {
          expirySet.delete(sessionId);
          if (expirySet.size === 0) {
            this.sessionsByExpiry.delete(expiryTime);
          }
        }
      }

      return true;
    }
    return false;
  }

  getUserSessions(userId: string): SessionData[] {
    const sessionIds = this.userSessions.get(userId) || new Set();
    return Array.from(sessionIds)
      .map(id => this.get(id))
      .filter((session): session is SessionData => session !== undefined);
  }

  deleteUserSessions(userId: string, excludeSessionId?: string): number {
    const sessionIds = this.userSessions.get(userId) || new Set();
    let deletedCount = 0;
    
    for (const sessionId of sessionIds) {
      if (excludeSessionId && sessionId === excludeSessionId) {
        continue; // Skip the excluded session
      }
      if (this.delete(sessionId)) {
        deletedCount++;
      }
    }
    
    return deletedCount;
  }

  updateActivity(sessionId: string, ipAddress?: string): boolean {
    const session = this.get(sessionId);
    if (session) {
      session.lastActiveAt = new Date();
      if (ipAddress && ipAddress !== session.ipAddress) {
        session.ipAddress = ipAddress;
        // Log IP change for security monitoring
        console.warn(`IP address changed for session ${sessionId}: ${session.ipAddress} -> ${ipAddress}`);
      }
      this.set(sessionId, session, true); // Re-encrypt on update
      return true;
    }
    return false;
  }

  cleanup(): number {
    const now = Date.now();
    const currentMinute = Math.floor(now / 60000);
    let cleanedCount = 0;

    // Clean expired sessions by checking expiry buckets
    for (const [expiryMinute, sessionIds] of this.sessionsByExpiry.entries()) {
      if (expiryMinute <= currentMinute) {
        for (const sessionId of sessionIds) {
          if (this.delete(sessionId)) {
            cleanedCount++;
          }
        }
        this.sessionsByExpiry.delete(expiryMinute);
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} expired sessions`);
    }

    return cleanedCount;
  }

  getStats(): SessionStats {
    const now = new Date();
    let activeSessions = 0;
    let expiredSessions = 0;
    const userSessionCounts = new Map<string, number>();

    for (const [sessionId, entry] of this.sessions.entries()) {
      const session = entry.data;
      
      if (session.expiresAt && now > session.expiresAt) {
        expiredSessions++;
      } else {
        activeSessions++;
      }

      const count = userSessionCounts.get(session.userId) || 0;
      userSessionCounts.set(session.userId, count + 1);
    }

    return {
      totalSessions: this.sessions.size,
      activeSessions,
      expiredSessions,
      userSessionCounts,
    };
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.sessions.clear();
    this.userSessions.clear();
    this.sessionsByExpiry.clear();
  }
}

// Global session store instance
const sessionStore = new EnhancedSessionStore();

export class SessionService {
  private maxSessionsPerUser: number = 5;
  private defaultSessionDuration: number = 24 * 60 * 60 * 1000; // 24 hours
  private rememberMeDuration: number = 7 * 24 * 60 * 60 * 1000; // 7 days

  /**
   * Create a new session for a user
   */
  async createSession(
    userId: string,
    options: CreateSessionOptions = {}
  ): Promise<{ accessToken: string; refreshToken: string; sessionData: SessionData }> {
    try {
      // Check rate limiting for session creation
      const rateLimitKey = `session_create_${options.ipAddress || userId}`;
      if (enhancedRateLimiter.isRateLimited(rateLimitKey, 10, 15 * 60 * 1000)) {
        throw new Error('Too many session creation attempts. Please try again later.');
      }

      // Get fresh user data from database
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        throw new Error('User not found');
      }

      if (user.role === 'deactivated') {
        throw new Error('Account is deactivated');
      }

      // Cleanup old sessions for this user if over limit
      const existingSessions = sessionStore.getUserSessions(userId);
      if (existingSessions.length >= this.maxSessionsPerUser) {
        // Remove oldest sessions
        const sessionsToRemove = existingSessions
          .sort((a, b) => a.lastActiveAt.getTime() - b.lastActiveAt.getTime())
          .slice(0, existingSessions.length - this.maxSessionsPerUser + 1);
        
        for (const session of sessionsToRemove) {
          sessionStore.delete(session.sessionId);
        }
      }

      // Generate unique session ID
      const sessionId = generateSessionId();
      const now = new Date();
      const duration = options.rememberMe ? this.rememberMeDuration : this.defaultSessionDuration;
      const expiresAt = new Date(now.getTime() + duration);

      // Create session data
      const sessionData: SessionData = {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        sessionId,
        createdAt: now,
        lastActiveAt: now,
        expiresAt,
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
        deviceInfo: options.deviceInfo,
        metadata: options.metadata,
      };

      // Store session with encryption
      sessionStore.set(sessionId, sessionData, true);

      // Create JWT token pair
      const tokenPayload: Omit<TokenPayload, 'iat' | 'exp' | 'iss' | 'aud'> = {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      };

      const { accessToken, refreshToken } = await createTokenPair(tokenPayload);

      // Log session creation
      console.log(`Session created for user ${user.username} (${sessionId}) from ${options.ipAddress || 'unknown IP'}`);

      return { accessToken, refreshToken, sessionData };
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  }

  /**
   * Validate a session token
   */
  async validateSession(token: string, ipAddress?: string): Promise<SessionValidationResult> {
    try {
      // Verify JWT token
      const payload = await verifyJWT(token);
      if (!payload) {
        return { valid: false, error: 'Invalid token' };
      }

      // Check if user still exists and is active
      const user = await db.query.users.findFirst({
        where: eq(users.id, payload.userId),
      });

      if (!user) {
        return { valid: false, error: 'User not found' };
      }

      if (user.role === 'deactivated') {
        return { valid: false, error: 'Account deactivated' };
      }

      // For JWT-based sessions, create virtual session data
      const sessionId = hashSensitiveData(`${user.id}-${payload.iat}`);
      const createdAt = new Date((payload.iat || 0) * 1000);
      const expiresAt = new Date((payload.exp || 0) * 1000);
      
      // Check if we have a stored session for this user
      let storedSession = sessionStore.get(sessionId);
      
      if (!storedSession) {
        // Create virtual session for JWT-only validation
        storedSession = {
          userId: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          sessionId,
          createdAt,
          lastActiveAt: new Date(),
          expiresAt,
          ipAddress,
        };
      } else {
        // Update activity for stored sessions
        sessionStore.updateActivity(sessionId, ipAddress);
      }

      // Check if token is close to expiration (suggest refresh)
      const remainingTime = expiresAt.getTime() - Date.now();
      const shouldRefresh = remainingTime < (60 * 60 * 1000); // Less than 1 hour

      return {
        valid: true,
        session: storedSession,
        shouldRefresh,
        remainingTime: Math.max(0, remainingTime),
      };
    } catch (error) {
      console.error('Error validating session:', error);
      return { valid: false, error: 'Session validation failed' };
    }
  }

  /**
   * Refresh a session token
   */
  async refreshSession(
    refreshToken: string, 
    ipAddress?: string
  ): Promise<{ accessToken: string; refreshToken: string; sessionData: SessionData } | null> {
    try {
      // Validate refresh token
      const validation = await this.validateSession(refreshToken, ipAddress);
      if (!validation.valid || !validation.session) {
        return null;
      }

      // Create new session with updated expiry
      return await this.createSession(validation.session.userId, {
        ipAddress,
        userAgent: validation.session.userAgent,
        deviceInfo: validation.session.deviceInfo,
        rememberMe: true, // Assume refresh tokens are for remember me
      });
    } catch (error) {
      console.error('Error refreshing session:', error);
      return null;
    }
  }

  /**
   * Destroy a specific session
   */
  async destroySession(sessionId: string): Promise<boolean> {
    try {
      const deleted = sessionStore.delete(sessionId);
      if (deleted) {
        console.log(`Session destroyed: ${sessionId}`);
      }
      return deleted;
    } catch (error) {
      console.error('Error destroying session:', error);
      return false;
    }
  }

  /**
   * Destroy all sessions for a user except optionally one
   */
  async destroyUserSessions(userId: string, excludeSessionId?: string): Promise<number> {
    try {
      const deletedCount = sessionStore.deleteUserSessions(userId, excludeSessionId);
      console.log(`Destroyed ${deletedCount} sessions for user ${userId}`);
      return deletedCount;
    } catch (error) {
      console.error('Error destroying user sessions:', error);
      return 0;
    }
  }

  /**
   * Get active sessions for a user
   */
  async getUserSessions(userId: string): Promise<SessionData[]> {
    try {
      return sessionStore.getUserSessions(userId);
    } catch (error) {
      console.error('Error getting user sessions:', error);
      return [];
    }
  }

  /**
   * Update session activity and metadata
   */
  async updateSessionActivity(
    sessionId: string, 
    ipAddress?: string, 
    metadata?: Record<string, any>
  ): Promise<boolean> {
    try {
      const session = sessionStore.get(sessionId);
      if (session) {
        session.lastActiveAt = new Date();
        if (ipAddress) {
          session.ipAddress = ipAddress;
        }
        if (metadata) {
          session.metadata = { ...session.metadata, ...metadata };
        }
        sessionStore.set(sessionId, session, true);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error updating session activity:', error);
      return false;
    }
  }

  /**
   * Extract and validate session from request headers
   */
  async validateRequestSession(
    authHeader: string | undefined,
    ipAddress?: string
  ): Promise<SessionValidationResult> {
    try {
      const token = extractTokenFromHeader(authHeader);
      if (!token) {
        return { valid: false, error: 'No token provided' };
      }

      return await this.validateSession(token, ipAddress);
    } catch (error) {
      console.error('Error validating request session:', error);
      return { valid: false, error: 'Request validation failed' };
    }
  }

  /**
   * Check if a session exists for a user
   */
  async hasActiveSession(userId: string): Promise<boolean> {
    try {
      const sessions = sessionStore.getUserSessions(userId);
      return sessions.length > 0;
    } catch (error) {
      console.error('Error checking active sessions:', error);
      return false;
    }
  }

  /**
   * Get session statistics
   */
  getSessionStats(): SessionStats {
    return sessionStore.getStats();
  }

  /**
   * Cleanup expired sessions manually
   */
  cleanupExpiredSessions(): number {
    return sessionStore.cleanup();
  }

  /**
   * Validate session security
   */
  async validateSessionSecurity(sessionId: string, ipAddress?: string, userAgent?: string): Promise<{
    valid: boolean;
    warnings: string[];
    shouldTerminate: boolean;
  }> {
    const warnings: string[] = [];
    let shouldTerminate = false;

    try {
      const session = sessionStore.get(sessionId);
      if (!session) {
        return { valid: false, warnings: ['Session not found'], shouldTerminate: true };
      }

      // Check IP address consistency
      if (session.ipAddress && ipAddress && session.ipAddress !== ipAddress) {
        warnings.push('IP address mismatch detected');
        // In high-security mode, this might terminate the session
        // shouldTerminate = true;
      }

      // Check user agent consistency (basic check)
      if (session.userAgent && userAgent) {
        const sessionUA = session.userAgent.toLowerCase();
        const currentUA = userAgent.toLowerCase();
        
        // Basic browser/OS detection
        const extractBrowser = (ua: string) => {
          if (ua.includes('chrome')) return 'chrome';
          if (ua.includes('firefox')) return 'firefox';
          if (ua.includes('safari')) return 'safari';
          if (ua.includes('edge')) return 'edge';
          return 'unknown';
        };

        if (extractBrowser(sessionUA) !== extractBrowser(currentUA)) {
          warnings.push('Browser change detected');
        }
      }

      // Check session age
      const sessionAge = Date.now() - session.createdAt.getTime();
      const maxSessionAge = 7 * 24 * 60 * 60 * 1000; // 7 days
      if (sessionAge > maxSessionAge) {
        warnings.push('Session is very old');
        shouldTerminate = true;
      }

      // Check inactivity
      const inactiveTime = Date.now() - session.lastActiveAt.getTime();
      const maxInactiveTime = 24 * 60 * 60 * 1000; // 24 hours
      if (inactiveTime > maxInactiveTime) {
        warnings.push('Session inactive for extended period');
        shouldTerminate = true;
      }

      return {
        valid: !shouldTerminate,
        warnings,
        shouldTerminate,
      };
    } catch (error) {
      console.error('Error validating session security:', error);
      return { valid: false, warnings: ['Security validation failed'], shouldTerminate: true };
    }
  }

  /**
   * Create a session for API access (longer duration, different validation)
   */
  async createAPISession(
    userId: string,
    apiKeyId: string,
    scopes: string[] = []
  ): Promise<{ token: string; sessionData: SessionData }> {
    try {
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        throw new Error('User not found');
      }

      const sessionId = generateSessionId();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

      const sessionData: SessionData = {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        sessionId,
        createdAt: now,
        lastActiveAt: now,
        expiresAt,
        metadata: {
          type: 'api',
          apiKeyId,
          scopes,
        },
      };

      sessionStore.set(sessionId, sessionData, true);

      const token = await signJWT({
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      }, { expiresIn: '30d' });

      console.log(`API session created for user ${user.username} (${sessionId})`);

      return { token, sessionData };
    } catch (error) {
      console.error('Error creating API session:', error);
      throw error;
    }
  }

  /**
   * Destroy the session store (for testing or shutdown)
   */
  destroy(): void {
    sessionStore.destroy();
  }

  /**
   * Configure session settings
   */
  configure(options: {
    maxSessionsPerUser?: number;
    defaultSessionDuration?: number;
    rememberMeDuration?: number;
  }): void {
    if (options.maxSessionsPerUser) {
      this.maxSessionsPerUser = options.maxSessionsPerUser;
    }
    if (options.defaultSessionDuration) {
      this.defaultSessionDuration = options.defaultSessionDuration;
    }
    if (options.rememberMeDuration) {
      this.rememberMeDuration = options.rememberMeDuration;
    }
  }
}

export const sessionService = new SessionService();