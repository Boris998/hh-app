import redis, { CacheKeys } from './redis'

export class CacheService {
  // User profile caching
  static async getUserProfile(userId: string) {
    const cached = await redis.get(CacheKeys.userProfile(userId))
    return cached ? JSON.parse(cached) : null
  }

  static async setUserProfile(userId: string, profile: any, ttl = 3600) {
    await redis.setex(CacheKeys.userProfile(userId), ttl, JSON.stringify(profile))
  }

  // Leaderboard caching
  static async getLeaderboard(sport?: string) {
    const cached = await redis.get(CacheKeys.leaderboard(sport))
    return cached ? JSON.parse(cached) : null
  }

  static async setLeaderboard(sport: string | undefined, data: any[], ttl = 1800) {
    await redis.setex(CacheKeys.leaderboard(sport), ttl, JSON.stringify(data))
  }

  // Cache invalidation
  static async invalidateUserData(userId: string) {
    await Promise.all([
      redis.del(CacheKeys.user(userId)),
      redis.del(CacheKeys.userProfile(userId)),
      redis.del(CacheKeys.activeMatches(userId))
    ])
  }
}