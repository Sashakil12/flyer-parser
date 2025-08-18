/**
 * Simple in-memory cache for search results
 * This helps reduce database queries for repeated searches
 */

interface CacheEntry<T> {
  data: T
  timestamp: number
}

class SearchCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map()
  private readonly ttl: number // Time to live in milliseconds
  private readonly maxSize: number // Maximum number of entries in cache
  
  constructor(ttlMinutes: number = 30, maxSize: number = 100) {
    this.ttl = ttlMinutes * 60 * 1000
    this.maxSize = maxSize
  }
  
  /**
   * Generate a cache key from search parameters
   */
  generateKey(params: Record<string, any>): string {
    // Sort keys to ensure consistent key generation
    const sortedKeys = Object.keys(params).sort()
    
    // Build key string
    return sortedKeys
      .filter(key => params[key] !== undefined && params[key] !== null)
      .map(key => {
        const value = params[key]
        if (Array.isArray(value)) {
          return `${key}:[${value.sort().join(',')}]`
        }
        // Ensure value is converted to string
        return `${key}:${String(value)}`
      })
      .join('|')
  }
  
  /**
   * Get data from cache if it exists and is not expired
   */
  get(key: string): T | null {
    const entry = this.cache.get(key)
    
    if (!entry) {
      return null
    }
    
    const now = Date.now()
    if (now - entry.timestamp > this.ttl) {
      // Entry has expired
      this.cache.delete(key)
      return null
    }
    
    return entry.data
  }
  
  /**
   * Store data in cache
   */
  set(key: string, data: T): void {
    // If cache is at max size, remove oldest entry
    if (this.cache.size >= this.maxSize) {
      const iterator = this.cache.keys()
      const firstResult = iterator.next()
      if (!firstResult.done && firstResult.value) {
        this.cache.delete(firstResult.value)
      }
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    })
  }
  
  /**
   * Clear the entire cache
   */
  clear(): void {
    this.cache.clear()
  }
  
  /**
   * Get the current size of the cache
   */
  size(): number {
    return this.cache.size
  }
}

// Create a singleton instance for product search results
export const productSearchCache = new SearchCache<Array<{ id: string; [key: string]: any }>>(30, 100)

// Export the class for other cache instances if needed
export default SearchCache
