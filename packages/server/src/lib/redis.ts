import Redis from 'ioredis'

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: 3
})

export default redis

// Cache key builders
export const CacheKeys = {
  user: (id: string) => `user:${id}`,
  userProfile: (id: string) => `profile:${id}`,
  leaderboard: (sport?: string) => `leaderboard:${sport || 'all'}`,
  activeMatches: (userId: string) => `matches:active:${userId}`
} as const