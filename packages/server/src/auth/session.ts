
export type Session = {
  userId: string;
  email: string;
  name?: string;
}
import redis from '../lib/redis'
import { JWTService, type TokenPayload } from './jwt'

export class SessionService {
  // Store refresh token in Redis with user association
  static async storeRefreshToken(userId: string, refreshToken: string) {
    const key = `refresh_token:${userId}`
    // Store for 7 days (same as JWT expiry)
    await redis.setex(key, 7 * 24 * 60 * 60, refreshToken)
  }

  // Validate refresh token exists in Redis
  static async validateRefreshToken(userId: string, refreshToken: string): Promise<boolean> {
    const key = `refresh_token:${userId}`
    const storedToken = await redis.get(key)
    return storedToken === refreshToken
  }

  // Remove refresh token on logout
  static async revokeRefreshToken(userId: string) {
    const key = `refresh_token:${userId}`
    await redis.del(key)
  }

  // Create session with both JWT and Redis storage
  static async createSession(user: { id: string; email: string; role?: string }) {
    const tokens = await JWTService.generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role
    })

    // Store refresh token in Redis
    await this.storeRefreshToken(user.id, tokens.refreshToken)

    return tokens
  }

  // Refresh session
  static async refreshSession(refreshToken: string) {
    // First verify the JWT itself
    const payload = await JWTService.verifyRefreshToken(refreshToken)
    if (!payload) return null

    // Then check if it exists in Redis (not revoked)
    const isValid = await this.validateRefreshToken(payload.userId, refreshToken)
    if (!isValid) return null

    // Generate new tokens
    const newTokens = await JWTService.refreshTokens(refreshToken)
    if (!newTokens) return null

    // Update Redis with new refresh token
    await this.storeRefreshToken(payload.userId, newTokens.refreshToken)

    return newTokens
  }
}
