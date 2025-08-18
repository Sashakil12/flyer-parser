# Search Caching System

This document describes the search caching implementation for the flyer parser application.

## Overview

The caching system improves performance by storing search results in memory, reducing the number of database queries for repeated searches. This is particularly useful for product matching operations where the same or similar searches may be performed multiple times.

## Implementation Details

### Cache Structure

- Located in `src/lib/cache.ts`
- Generic implementation that can be used for different types of data
- Configurable TTL (Time To Live) and maximum cache size
- Thread-safe in-memory storage using JavaScript `Map`

### Key Features

1. **Automatic Expiration**: Cache entries expire after a configurable TTL (default: 30 minutes)
2. **Size Management**: Automatically removes oldest entries when cache reaches maximum size
3. **Consistent Key Generation**: Creates deterministic cache keys from search parameters
4. **Type Safety**: Fully typed with TypeScript generics

### Integration Points

The cache is integrated with:

- `searchProducts` function in `src/lib/firestore-admin.ts`
- Supports multilingual search parameters (English and Macedonian)
- Handles arrays and primitive values in search parameters

## Usage

```typescript
// Example usage in searchProducts function
const cacheKey = productSearchCache.generateKey({
  productName,
  productNameMk,
  additionalInfo,
  additionalInfoMk,
  limit
});

// Check cache first
const cachedResults = productSearchCache.get(cacheKey);
if (cachedResults) {
  console.log(`📦 Returning cached search results (${cachedResults.length} items)`);
  return cachedResults;
}

// ... perform search if not in cache ...

// Store results in cache
productSearchCache.set(cacheKey, results);
```

## Performance Benefits

- Reduces Firestore read operations
- Improves response time for repeated searches
- Particularly helpful for product matching operations in Inngest workflows
- Reduces costs associated with database queries

## Future Improvements

- Add Redis or other persistent cache for cross-instance caching
- Implement cache invalidation on product updates
- Add cache statistics and monitoring
- Consider more sophisticated cache eviction policies
