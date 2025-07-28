// src/auth/session.ts - Memory-only version (no Redis)
export type Session = {
  userId: string;
  email: string;
  name?: string;
}

import { JWTService, type TokenPayload } from './jwt.js';

// In-memory store for refresh tokens (for development only)
const refreshTokenStore = new Map<string, string>();

export class SessionService {
  // Store refresh token in memory (for development)
  static async storeRefreshToken(userId: string, refreshToken: string) {
    refreshTokenStore.set(userId, refreshToken);
    console.log(`✅ Stored refresh token for user: ${userId}`);
  }

  // Validate refresh token exists in memory
  static async validateRefreshToken(userId: string, refreshToken: string): Promise<boolean> {
    const storedToken = refreshTokenStore.get(userId);
    return storedToken === refreshToken;
  }

  // Remove refresh token on logout
  static async revokeRefreshToken(userId: string) {
    refreshTokenStore.delete(userId);
    console.log(`✅ Revoked refresh token for user: ${userId}`);
  }

  // Create session with JWT only
  static async createSession(user: { id: string; email: string; role?: string }) {
    console.log(`🔑 Creating session for user: ${user.email}`);
    
    const tokens = await JWTService.generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    // Store refresh token in memory
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  // Refresh session
  static async refreshSession(refreshToken: string) {
    console.log(`🔄 Refreshing session...`);
    
    // First verify the JWT itself
    const payload = await JWTService.verifyRefreshToken(refreshToken);
    if (!payload) {
      console.log(`❌ Invalid refresh token`);
      return null;
    }

    // Then check if it exists in memory (not revoked)
    const isValid = await this.validateRefreshToken(payload.userId, refreshToken);
    if (!isValid) {
      console.log(`❌ Refresh token not found in store`);
      return null;
    }

    // Generate new tokens
    const newTokens = await JWTService.refreshTokens(refreshToken);
    if (!newTokens) {
      console.log(`❌ Failed to generate new tokens`);
      return null;
    }

    // Update memory with new refresh token
    await this.storeRefreshToken(payload.userId, newTokens.refreshToken);

    console.log(`✅ Session refreshed successfully`);
    return newTokens;
  }
}