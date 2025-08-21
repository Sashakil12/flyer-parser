import Redis from 'ioredis'

if (!process.env.REDIS_URL) {
  console.warn('REDIS_URL environment variable is not set, caching will be disabled.')
}

const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null

if (redis) {
  redis.on('error', (err) => console.error('Redis Client Error', err))
  redis.on('connect', () => {
    console.log('✅ Connected to Redis');
    // Allow the process to exit even if the connection is open.
    // This is crucial for serverless environments.
    redis.unref();
  });
}

export default redis
