import redis from './redis'

const DEFAULT_TTL_SECONDS = 30 * 60 // 30 minutes

class RedisSearchCache<T> {
  private readonly ttl: number // Time to live in seconds
  
  constructor(ttlSeconds: number = DEFAULT_TTL_SECONDS) {
    this.ttl = ttlSeconds
  }
  
  /**
   * Generate a cache key from search parameters
   */
  generateKey(params: Record<string, any>): string {
    const sortedKeys = Object.keys(params).sort()
    
    const keyParts = sortedKeys
      .filter(key => params[key] !== undefined && params[key] !== null)
      .map(key => {
        const value = params[key]
        if (Array.isArray(value)) {
          return `${key}:[${value.sort().join(',')}]`
        }
        return `${key}:${String(value)}`
      })
      
    return `search:${keyParts.join('|')}`
  }
  
  /**
   * Get data from cache if it exists
   */
  async get(key: string): Promise<T | null> {
    if (!redis) return null

    try {
      const data = await redis.get(key)
      if (data) {
        return JSON.parse(data) as T
      }
      return null
    } catch (error) {
      console.error('Redis GET error:', error)
      return null
    }
  }
  
  /**
   * Store data in cache
   */
  async set(key: string, data: T): Promise<void> {
    if (!redis) return

    try {
      const stringifiedData = JSON.stringify(data)
      await redis.set(key, stringifiedData, 'EX', this.ttl)
    } catch (error) {
      console.error('Redis SET error:', error)
    }
  }
  
  /**
   * Clear the entire cache (use with caution)
   */
  async clear(): Promise<void> {
    if (!redis) return
    try {
      await redis.flushdb()
    } catch (error) {
      console.error('Redis FLUSHDB error:', error)
    }
  }
}

// Create a singleton instance for product search results
export const productSearchCache = new RedisSearchCache<Array<{ id: string; [key: string]: any }>>()

// Export the class for other cache instances if needed
export { RedisSearchCache }

