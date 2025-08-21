import Redis from 'ioredis'
import { appConfigServer } from './config.server'

const redis = appConfigServer.redis.url ? new Redis(appConfigServer.redis.url) : null

if (redis) {
  redis.on('error', (err) => console.error('Redis Client Error', err))
  redis.on('connect', () => {
    console.log('✅ Connected to Redis');
    // Allow the process to exit even if the connection is open.
    // This is crucial for serverless environments.
    redis.unref();
  });
} else {
  console.warn('REDIS_URL environment variable is not set, caching will be disabled.')
}

export default redis
