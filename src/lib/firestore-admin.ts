import { adminDb } from './firebase/admin'
import { FlyerImage, ParsedFlyerItem, AutoApprovalRule } from '@/types'
import { Timestamp } from 'firebase-admin/firestore'

// Utility function to remove undefined values from objects recursively
function removeUndefinedValues(obj: any): any {
  if (obj === null || obj === undefined) {
    return null;
  }
  if (Array.isArray(obj)) {
    return obj.map(removeUndefinedValues).filter(item => item !== undefined);
  }
  if (typeof obj === 'object' && !(obj instanceof Timestamp)) {
    const cleaned: any = {};
    Object.keys(obj).forEach(key => {
      const value = removeUndefinedValues(obj[key]);
      if (value !== undefined) {
        cleaned[key] = value;
      }
    });
    return cleaned;
  }
  return obj;
}

const FLYER_IMAGES_COLLECTION = 'flyer-images'
const PARSED_FLYER_ITEMS_COLLECTION = 'parsed-flyer-items'
const AUTO_APPROVAL_RULES_COLLECTION = 'auto-approval-rules'

// Check product data consistency but don't skip products
function validateProductDataConsistency(product: any, searchTerm: string): boolean {
  // If product name contains detergent but keywords point to wine, it might be inconsistent
  const productName = (product.name || '').toLowerCase()
  const macedonianName = (product.macedonianname || '').toLowerCase()
  const albanianName = (product.albenianname || '').toLowerCase()
  
  // Check for potential inconsistencies but don't skip
  const isDetergent = productName.includes('detergent') || productName.includes('savex')
  const isWine = macedonianName.includes('вино') || albanianName.includes('verë') || 
                macedonianName.includes('имако') || albanianName.includes('imako')
  
  if (isDetergent && isWine) {
    console.log(`⚠️ Potential data inconsistency in product "${product.name}": detergent name with wine translations, but continuing with match`)
    // We still return true to include this product in matches
  }
  
  return true
}

// Server-side Firestore operations using Firebase Admin SDK
export const updateFlyerImageStatus = async (
  id: string,
  status: 'pending' | 'processing' | 'completed' | 'failed',
  failureReason?: string,
  storageUrl?: string
): Promise<void> => {
  try {
    let docRef = adminDb.collection('flyer-images').doc(id)
    let docSnapshot = await docRef.get()
    
    // If document doesn't exist with the provided ID, try to find it by storage URL
    if (!docSnapshot.exists && storageUrl) {
      console.warn(`⚠️ Document ${id} not found, searching by storage URL...`)
      
      const querySnapshot = await adminDb.collection('flyer-images')
        .where('storageUrl', '==', storageUrl)
        .limit(1)
        .get()
      
      if (!querySnapshot.empty) {
        const foundDoc = querySnapshot.docs[0]
        docRef = foundDoc.ref
        docSnapshot = foundDoc
        console.log(`✅ Found document by storage URL: ${foundDoc.id} (original ID: ${id})`)
      }
    }
    
    if (!docSnapshot.exists) {
      console.warn(`⚠️ Flyer image document ${id} does not exist, skipping status update`)
      console.log(`📊 This can happen if the document was deleted or never created properly`)
      return // Skip update instead of throwing error
    }
    
    const updateData: any = {
      processingStatus: status,
      updatedAt: Timestamp.now()
    }
    
    // Add failure reason if status is failed
    if (status === 'failed' && failureReason) {
      updateData.failureReason = failureReason
    }
    
    // Clear failure reason if status is not failed
    if (status !== 'failed') {
      updateData.failureReason = null
    }
    
    await docRef.update(updateData)
    
    console.log(`✅ Successfully updated flyer image ${docRef.id} status to: ${status}`)
  } catch (error: any) {
    console.error('❌ Error updating flyer image status:', error)
    
    // Don't throw error for missing documents - just log and continue
    if (error.message.includes('NOT_FOUND') || error.message.includes('No document to update')) {
      console.warn(`⚠️ Skipping update for missing flyer image document ${id}`)
      return
    }
    
    throw new Error(`Failed to update processing status: ${error.message}`)
  }
}

export const addParsedFlyerItem = async (
  item: Omit<ParsedFlyerItem, 'id' | 'createdAt' | 'parsedAt'>
): Promise<string> => {
  console.log(`📝 Attempting to add parsed item for flyer: ${item.flyerImageId}`);
  try {
    const docData = {
      ...item,
      createdAt: Timestamp.now(),
      parsedAt: Timestamp.now(),
    };
    
    console.log('  - Document data to be added:', JSON.stringify(docData, null, 2));
    const docRef = await adminDb.collection(PARSED_FLYER_ITEMS_COLLECTION).add(docData);
    
    console.log(`✅ Successfully added parsed item with ID: ${docRef.id}`);
    return docRef.id;
  } catch (error: any) {
    console.error('❌ CRITICAL: Error adding parsed flyer item to Firestore:', {
        errorMessage: error.message,
        errorCode: error.code,
        itemPayload: JSON.stringify(item, null, 2), // Log the exact data that failed
        errorStack: error.stack,
    });
    throw new Error(`Failed to add parsed flyer item: ${error.message}`);
  }
};

// Get flyer image data (for verification)
export const getFlyerImage = async (id: string): Promise<FlyerImage | null> => {
  try {
    const docRef = adminDb.collection(FLYER_IMAGES_COLLECTION).doc(id)
    const doc = await docRef.get()
    
    if (!doc.exists) {
      console.log(`⚠️ Flyer image ${id} not found`)
      return null
    }
    
    return { id: doc.id, ...doc.data() } as FlyerImage
  } catch (error: any) {
    console.error('❌ Error getting flyer image:', error)
    throw new Error(`Failed to get flyer image: ${error.message}`)
  }
}

// Get multiple parsed flyer items by their IDs
export const getParsedFlyerItemsByIds = async (ids: string[]): Promise<ParsedFlyerItem[]> => {
  try {
    if (!ids.length) return []
    
    console.log(`📝 Fetching ${ids.length} parsed flyer items`)
    
    // Firestore doesn't support direct array-based ID queries
    // We need to fetch each document individually
    const promises = ids.map(id => {
      return adminDb.collection(PARSED_FLYER_ITEMS_COLLECTION).doc(id).get()
    })
    
    const docs = await Promise.all(promises)
    
    const items = docs
      .filter(doc => doc.exists)
      .map(doc => ({ id: doc.id, ...doc.data() } as ParsedFlyerItem))
    
    console.log(`✅ Successfully fetched ${items.length} parsed flyer items`)
    return items
  } catch (error: any) {
    console.error('❌ Error fetching parsed flyer items:', error)
    throw new Error(`Failed to fetch parsed flyer items: ${error.message}`)
  }
}

// Update a parsed flyer item with new data
export const updateParsedFlyerItem = async (
  id: string,
  data: Partial<ParsedFlyerItem>
): Promise<void> => {
  try {
    console.log(`📝 Updating parsed flyer item ${id}`)
    
    const docRef = adminDb.collection(PARSED_FLYER_ITEMS_COLLECTION).doc(id)
    const doc = await docRef.get()
    
    if (!doc.exists) {
      throw new Error(`Parsed flyer item ${id} not found`)
    }
    
    // Deep clean the data to remove any undefined values before sending to Firestore
    const cleanData = removeUndefinedValues(data);
    
    const updateData = {
      ...cleanData,
      updatedAt: Timestamp.now()
    }
    
    // Log the update data structure for debugging
    console.log(`🔍 Update data structure check: ${JSON.stringify(updateData).substring(0, 200)}...`)
    
    await docRef.update(updateData)
    
    console.log(`✅ Successfully updated parsed flyer item ${id}`)
  } catch (error: any) {
    console.error('❌ Error updating parsed flyer item:', error)
    throw new Error(`Failed to update parsed flyer item: ${error.message}`)
  }
}

import { productSearchCache } from './cache'

// Auto-Approval Rules Admin Operations
export const getActiveAutoApprovalRulesAdmin = async (): Promise<AutoApprovalRule[]> => {
  try {
    console.log('🔍 Fetching all active auto-approval rules using admin SDK');

    const querySnapshot = await adminDb
      .collection(AUTO_APPROVAL_RULES_COLLECTION)
      .where('isActive', '==', true)
      .orderBy('createdAt', 'desc')
      .get();

    if (querySnapshot.empty) {
      console.log('⚠️ No active auto-approval rules found');
      return [];
    }

    const rules = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as AutoApprovalRule[];

    console.log(`✅ Found ${rules.length} active auto-approval rule(s).`);
    return rules;
  } catch (error: any) {
    console.error('❌ Error fetching active auto-approval rules with admin SDK:', error);
    throw new Error('Failed to fetch active auto-approval rules');
  }
};

// Enhanced search for relevant products using all available searchable fields
export const searchProducts = async (
  productName: string,
  productNameMk?: string,
  additionalInfo?: string[],
  additionalInfoMk?: string[],
  limit: number = 10
): Promise<Array<{ id: string; [key: string]: any }>> => {
  try {
    console.log(`🔍 Enhanced search for products matching: ${productName}`)
    
    // Stage 0: Attempt an exact, case-insensitive match first
    const productsRef = adminDb.collection('products');
    const exactMatchQuery = productsRef.where('name', '==', productName);
    const exactMatchSnapshot = await exactMatchQuery.get();

    if (!exactMatchSnapshot.empty) {
      const results = exactMatchSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log(`✅ Found ${results.length} exact match(es). Returning immediately.`);
      return results;
    }

    console.log(`⚠️ No exact match found. Proceeding to keyword-based search.`);
    
    console.log(`📊 SEARCH_START - Product matching search initiated with parameters:`, {
      productName,
      productNameMk,
      additionalInfo: Array.isArray(additionalInfo) ? additionalInfo.join(', ') : additionalInfo,
      additionalInfoMk: Array.isArray(additionalInfoMk) ? additionalInfoMk.join(', ') : additionalInfoMk,
      limit
    })
    
    // Generate cache key
    const cacheKey = productSearchCache.generateKey({
      productName,
      productNameMk,
      additionalInfo,
      additionalInfoMk,
      limit
    })
    
    // Check cache first
    const cachedResults = await productSearchCache.get(cacheKey)
    if (cachedResults) {
      console.log(`📦 Returning cached search results (${cachedResults.length} items)`)
      console.log(`📊 SEARCH_CACHE_HIT - Using cached search results with ${cachedResults.length} items`)
      if (cachedResults.length === 0) {
        console.log(`⚠️ SEARCH_ZERO_RESULTS - Cached search returned zero results for product: ${productName}`)
      }
      return cachedResults
    }
    
    // Extract keywords from product name and additional info
    const englishKeywords = extractKeywords(productName, additionalInfo)
    const macedonianKeywords = productNameMk ? extractKeywords(productNameMk, additionalInfoMk) : []
    
    // Debug keyword extraction
    console.log(`🔍 Keyword extraction debug:`, {
      productName,
      productNameMk,
      additionalInfo,
      additionalInfoMk,
      extractedEnglishKeywords: englishKeywords,
      extractedMacedonianKeywords: macedonianKeywords
    })
    
    // Enhanced keyword extraction logging
    console.log(`📊 SEARCH_KEYWORDS - Extracted keywords for search:`, {
      productName,
      englishKeywords: englishKeywords.join(', '),
      englishKeywordCount: englishKeywords.length,
      macedonianKeywords: macedonianKeywords.join(', '),
      macedonianKeywordCount: macedonianKeywords.length,
      keywordExtractionMethod: 'standard tokenization with stopword removal'
    })
    
    // Combine all keywords for search
    const allKeywords = Array.from(new Set([...englishKeywords, ...macedonianKeywords]))
    
    // Limit keywords to avoid query size limits (Firestore has a limit)
    const limitedKeywords = allKeywords.slice(0, 10)
    
    if (limitedKeywords.length === 0) {
      console.log('⚠️ No keywords extracted for search')
      console.log(`❌ SEARCH_NO_KEYWORDS - Failed to extract any usable keywords from product: ${productName}`)
      console.log(`📊 SEARCH_ZERO_RESULTS - Search aborted due to no keywords for product: ${productName}`)
      return []
    }
    
    console.log(`🔍 Searching with keywords: ${limitedKeywords.join(', ')}`)
    console.log(`📋 Search parameters:`, {
      productName,
      productNameMk,
      additionalInfo,
      additionalInfoMk,
      englishKeywords,
      macedonianKeywords,
      allKeywords,
      limitedKeywords
    })
    
    // Search in products collection using multiple searchable fields
    const results: Array<{ id: string; [key: string]: any }> = []
    const existingIds = new Set<string>()
    
    // Debug: Check if products collection is accessible
    console.log('🔍 Testing products collection access...')
    try {
      const testSnapshot = await productsRef.limit(1).get()
      console.log(`📊 Products collection accessible: ${testSnapshot.docs.length} test doc(s) found`)
      if (testSnapshot.docs.length > 0) {
        const testDoc = testSnapshot.docs[0]
        console.log(`📊 Sample product structure:`, {
          id: testDoc.id,
          name: testDoc.data().name,
          hasEnglishNameKeywords: !!testDoc.data().englishNameKeywords,
          hasMacedonianname: !!testDoc.data().macedonianname,
          hasKeywords: !!testDoc.data().keywords
        })
      }
    } catch (error) {
      console.error('❌ Error accessing products collection:', error)
    }
    
    // Utility function to validate product IDs
    const isValidProductId = (id: any): boolean => {
      if (id === undefined || 
          id === null || 
          id === 'undefined' || 
          id === 'null' || 
          !id || 
          (typeof id === 'string' && id.trim() === '')) {
        return false;
      }
      return true;
    }

    // Helper function to add unique results with detailed logging
    const addUniqueResults = (snapshot: any, stageName: string) => {
      const stageResults = snapshot.docs.length
      console.log(`📊 ${stageName}: Found ${stageResults} results`)
      console.log(`📊 SEARCH_STAGE_RESULTS - ${stageName}: Found ${stageResults} results`)
      
      snapshot.docs.forEach((doc: any) => {
        const product = doc.data();
        // CRITICAL FIX: Use product.productId as the ONLY source of truth for the ID.
        const productId = product.productId ? String(product.productId).trim() : null;

        // If a document from the search doesn't have a productId, it's invalid. Skip it.
        if (!productId) {
          console.log(`⚠️ ${stageName} - Skipping product with missing productId field. Document ID: ${doc.id}`);
          return;
        }

        // Standardize the ID field for consistent lookups. Both id and productId are the same.
        const resultData = { ...product, id: productId, productId: productId };
        
        console.log(`🔍 ${stageName} - Product found: {
  id: '${resultData.id}',
  name: '${resultData.name || 'N/A'}',
  macedonianname: '${resultData.macedonianname || 'N/A'}',
  albenianname: '${resultData.albenianname || 'N/A'}'
}`);
        
        // Check product data consistency but don't skip
        validateProductDataConsistency(product, productName);
        
        // Add unique results using the canonical productId
        if (!existingIds.has(resultData.id)) {
          existingIds.add(resultData.id);
          results.push({ ...resultData, _matchedVia: stageName });
          console.log(`✅ ${stageName} - Added unique product: ${resultData.name || resultData.id}`);
        } else {
          console.log(`🔄 ${stageName} - Skipped duplicate product: ${resultData.name || resultData.id}`);
        }
      })
    }
    
    // Stage 1: Search by multi-language keyword arrays (highest priority)
    if (results.length < limit) {
      console.log('🔍 Stage 1: Searching englishNameKeywords')
      const englishKeywordsQuery = productsRef
        .where('englishNameKeywords', 'array-contains-any', limitedKeywords)
        .limit(limit - results.length)
      
      const englishKeywordsSnapshot = await englishKeywordsQuery.get()
      addUniqueResults(englishKeywordsSnapshot, 'Stage 1: englishNameKeywords')
    }
    
    if (results.length < limit && macedonianKeywords.length > 0) {
      console.log('🔍 Stage 2: Searching macedoniannameKeywords')
      const macedonianKeywordsQuery = productsRef
        .where('macedoniannameKeywords', 'array-contains-any', limitedKeywords)
        .limit(limit - results.length)
      
      const macedonianKeywordsSnapshot = await macedonianKeywordsQuery.get()
      addUniqueResults(macedonianKeywordsSnapshot, 'Stage 2: macedoniannameKeywords')
    }
    
    if (results.length < limit) {
      console.log('🔍 Stage 3: Searching albeniannameKeywords')
      const albanianKeywordsQuery = productsRef
        .where('albeniannameKeywords', 'array-contains-any', limitedKeywords)
        .limit(limit - results.length)
      
      const albanianKeywordsSnapshot = await albanianKeywordsQuery.get()
      addUniqueResults(albanianKeywordsSnapshot, 'Stage 3: albeniannameKeywords')
    }
    
    // Stage 2: Search by traditional keywords and tags arrays
    if (results.length < limit) {
      console.log('🔍 Stage 4: Searching keywords array')
      const keywordsQuery = productsRef
        .where('keywords', 'array-contains-any', limitedKeywords)
        .limit(limit - results.length)
      
      const keywordsSnapshot = await keywordsQuery.get()
      addUniqueResults(keywordsSnapshot, 'Stage 4: keywords')
    }
    
    if (results.length < limit) {
      console.log('🔍 Stage 5: Searching tags array')
      const tagsQuery = productsRef
        .where('tags', 'array-contains-any', limitedKeywords)
        .limit(limit - results.length)
      
      const tagsSnapshot = await tagsQuery.get()
      addUniqueResults(tagsSnapshot, 'Stage 5: tags')
    }
    
    // Stage 3: Search by direct name field matching
    if (results.length < limit) {
      console.log('🔍 Stage 6: Searching name field')
      
      // First, try exact name match
      console.log(`🔍 Stage 6a: Trying exact name match for: "${productName}"`)
      const exactNameSnapshot = await productsRef
        .where('name', '==', productName)
        .limit(limit - results.length)
        .get()
      
      console.log(`📊 Stage 6a: Exact name match found ${exactNameSnapshot.docs.length} results`)
      addUniqueResults(exactNameSnapshot, 'Stage 6a: exact name match')
      
      // Then try keyword-based name searches
      for (const keyword of limitedKeywords) {
        if (results.length >= limit) break
        
        console.log(`🔍 Stage 6b: Searching name field with keyword: "${keyword}"`)
        const nameSnapshot = await productsRef
          .where('name', '>=', keyword)
          .where('name', '<=', keyword + '\uf8ff')
          .limit(limit - results.length)
          .get()
        
        console.log(`📊 Stage 6b: Keyword "${keyword}" found ${nameSnapshot.docs.length} results`)
        if (nameSnapshot.docs.length > 0) {
          nameSnapshot.docs.forEach(doc => {
            const data = doc.data()
            console.log(`🔍 Stage 6b: Found product with name: "${data.name}"`)
          })
        }
        
        addUniqueResults(nameSnapshot, `Stage 6b: name field keyword "${keyword}"`)
      }
    }
    
    if (results.length < limit && productNameMk) {
      console.log('🔍 Stage 7: Searching macedonianname field')
      for (const keyword of limitedKeywords) {
        if (results.length >= limit) break
        
        const macedonianNameSnapshot = await productsRef
          .where('macedonianname', '>=', keyword)
          .where('macedonianname', '<=', keyword + '\uf8ff')
          .limit(limit - results.length)
          .get()
        
        addUniqueResults(macedonianNameSnapshot, 'Stage 7: macedonianname field')
      }
    }
    
    if (results.length < limit) {
      console.log('🔍 Stage 8: Searching albenianname field')
      for (const keyword of limitedKeywords) {
        if (results.length >= limit) break
        
        const albanianNameSnapshot = await productsRef
          .where('albenianname', '>=', keyword)
          .where('albenianname', '<=', keyword + '\uf8ff')
          .limit(limit - results.length)
          .get()
        
        addUniqueResults(albanianNameSnapshot, 'Stage 8: albenianname field')
      }
    }
    
    // Stage 4: Search by supermarket name for context-aware matching
    if (results.length < limit) {
      console.log('🔍 Stage 9: Searching superMarketName field')
      for (const keyword of limitedKeywords) {
        if (results.length >= limit) break
        
        const supermarketSnapshot = await productsRef
          .where('superMarketName', '>=', keyword)
          .limit(limit - results.length)
          .get()
        
        addUniqueResults(supermarketSnapshot, 'Stage 9: superMarketName field')
      }
    }
    
    // Stage 5: Fallback description text search
    if (results.length < limit) {
      console.log('🔍 Stage 10: Searching description field (fallback)')
      for (const keyword of limitedKeywords) {
        if (results.length >= limit) break
        
        const descSnapshot = await productsRef
          .where('description', '>=', keyword)
          .where('description', '<=', keyword + '\uf8ff')
          .limit(limit - results.length)
          .get()
        
        addUniqueResults(descSnapshot, 'Stage 10: description field')
      }
    }
    
    // Store in cache for future use
    await productSearchCache.set(cacheKey, results)
    
    console.log(`✅ Found ${results.length} potential product matches`)
    
    // Log final search results with detailed information
    if (results.length === 0) {
      console.log(`❌ SEARCH_ZERO_RESULTS - No matches found for product: ${productName}`)
      console.log(`📊 SEARCH_FAILURE_ANALYSIS - Search failed with parameters:`, {
        productName,
        productNameMk,
        keywordsUsed: limitedKeywords.join(', '),
        searchStagesAttempted: [
          'englishNameKeywords', 'macedoniannameKeywords', 'albeniannameKeywords',
          'keywords', 'tags', 'name', 'macedonianname', 'albenianname',
          'superMarketName', 'description'
        ].join(', '),
        possibleReasons: [
          'Product not in database',
          'Keyword extraction failed to capture relevant terms',
          'Language/character encoding mismatch',
          'Product name too generic or too specific',
          'Database indexing issues'
        ].join(', ')
      })
    } else {
      console.log(`📊 SEARCH_SUCCESS - Found ${results.length} matches for product: ${productName}`)
      console.log(`📊 SEARCH_RESULT_SUMMARY - Top matches:`, results.slice(0, 3).map(r => ({
        id: r.id,
        name: r.name || 'N/A',
        macedonianname: r.macedonianname || 'N/A',
        matchedVia: r._matchedVia || 'unknown'
      })))
    }
    
    return results
  } catch (error: any) {
    console.error('❌ Error searching for products:', error)
    console.error('❌ Full error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack,
      searchParams: {
        productName,
        productNameMk,
        additionalInfo,
        additionalInfoMk,
        limit
      }
    })
    
    // Enhanced error logging with structured format
    console.error(`❌ SEARCH_ERROR - Product search failed with error:`, {
      errorType: error.name || 'Unknown',
      errorCode: error.code || 'UNKNOWN_ERROR',
      errorMessage: error.message,
      productName,
      productNameMk,
      timestamp: new Date().toISOString()
    })
    
    throw new Error(`Failed to search products: ${error.message}`)
  }
}

// Enhanced helper function to extract keywords from text with better multi-language support
function extractKeywords(text: string, additionalTexts?: string[] | string): string[] {
  if (!text) return []
  
  console.log(`🔍 Extracting keywords from: "${text}"`)
  console.log(`🔍 Additional texts:`, additionalTexts)
  
  // Convert to lowercase and handle Cyrillic/Latin characters properly
  const cleanText = text.toLowerCase()
    .replace(/[^\w\s\u0400-\u04FF]/g, ' ') // Keep Cyrillic characters
    .replace(/\s+/g, ' ')
    .trim()
  
  console.log(`🔍 Cleaned text: "${cleanText}"`)
  
  // Split by spaces and filter out short words and common stop words
  const stopWords = new Set([
    'the', 'and', 'or', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'with', 'by',
    'кг', 'kg', 'л', 'l', 'мл', 'ml', 'г', 'g', 'ден', 'den' // Common units
  ])
  
  const words = cleanText.split(/\s+/).filter(word => 
    word.length > 1 && !stopWords.has(word) && word !== ''
  )
  
  console.log(`🔍 Base words extracted:`, words)
  
  // Handle additionalTexts - could be array or string
  if (additionalTexts) {
    const textsToProcess = Array.isArray(additionalTexts) ? additionalTexts : [additionalTexts]
    
    for (const additionalText of textsToProcess) {
      if (additionalText && typeof additionalText === 'string') {
        const cleanAdditional = additionalText.toLowerCase()
          .replace(/[^\w\s\u0400-\u04FF]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        
        const additionalWords = cleanAdditional.split(/\s+/).filter(word => 
          word.length > 1 && !stopWords.has(word) && word !== ''
        )
        
        console.log(`🔍 Additional words from "${additionalText}":`, additionalWords)
        words.push(...additionalWords)
      }
    }
  }
  
  // Remove duplicates and return
  const uniqueWords = Array.from(new Set(words))
  console.log(`🔍 Final unique keywords:`, uniqueWords)
  
  return uniqueWords
}
