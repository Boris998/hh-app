// src/lib/redis.ts
import { createClient } from 'redis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Create Redis client
const redis = createClient({
  url: redisUrl
});

// Handle Redis connection events
redis.on('error', (err) => {
  console.warn('Redis Client Error:', err);
  // Don't crash the app if Redis is not available
});

redis.on('connect', () => {
  console.log('Redis Client Connected');
});

redis.on('ready', () => {
  console.log('Redis Client Ready');
});

// Connect to Redis (with error handling for development)
const connectRedis = async () => {
  try {
    await redis.connect();
  } catch (error) {
    console.warn('Redis connection failed, continuing without Redis:', error);
    // In development, we can continue without Redis
    // Sessions will be stored in memory only
  }
};

// Auto-connect in non-test environments
if (process.env.NODE_ENV !== 'test') {
  connectRedis();
}

export default redis;
export { connectRedis };