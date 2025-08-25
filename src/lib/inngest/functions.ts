import { inngest } from '../inngest'
import { parseImageWithGemini } from '../gemini'
import { scoreProductMatches } from '@/lib/gemini-product-match'
import { updateFlyerImageStatus, addParsedFlyerItem, updateParsedFlyerItem, searchProducts, getActiveAutoApprovalRuleAdmin } from '../firestore-admin'
import { getImageDataUrl } from '@/lib/storage-admin'
import { evaluateAutoApproval } from '@/lib/auto-approval'
import { applyDiscountPercentage } from '@/lib/utils'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { GeminiParseResult, ParsedFlyerItem, MatchedProduct, ProductExtractionConfig, CleanProductImage } from '@/types'
import { adminDb } from '../firebase/admin'
import { applyDiscountWithTimeout as helperApplyDiscountWithTimeout, Logger } from './helpers'
import { extractCleanProductImages } from '@/lib/imagen4-advanced'
import { optimizeForFlutter, validateImageQuality } from '@/lib/image-optimization'
import { uploadOptimizedImages, saveImageMetadata } from '@/lib/storage-images'

// Constants for timeouts and circuit breaker settings
const AI_SCORING_TIMEOUT = 90000; // 90 seconds timeout for AI scoring

// Constants for Inngest functions

// Interface for auto-approval results
export interface AutoApprovalResult {
  shouldAutoApprove: boolean
  reasoning: string
  confidence: number
  productId: string | null
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

// Function to parse flyer images using Gemini AI
export const parseFlyerFunction = inngest.createFunction(
  { id: 'parse-flyer', name: 'Parse Flyer with AI' },
  { event: 'flyer/parse' },
  async ({ event, step }) => {
    console.log('🔥 INNGEST FUNCTION TRIGGERED!', { eventId: event.id, flyerImageId: event.data.flyerImageId })
    const { flyerImageId, storageUrl } = event.data

    // Step 1: Update status to processing
    await step.run('update-status-processing', async () => {
      await updateFlyerImageStatus(flyerImageId, 'processing')
      return { status: 'processing' }
    })

    // Step 2: Download image and parse with Gemini AI
    const parseResult = await step.run('parse-with-gemini', async (): Promise<{
      success: true;
      data: GeminiParseResult[];
    } | {
      success: false;
      error: string;
      errorCode?: string;
      timestamp?: string;
    }> => {
      const MAX_RETRIES = 2;
      let retryCount = 0;
      let lastError: any = null;
      
      while (retryCount <= MAX_RETRIES) {
        try {
          // If this is a retry, log it
          if (retryCount > 0) {
            console.log(`🔄 Retry attempt ${retryCount}/${MAX_RETRIES} for parsing image ${flyerImageId}`);
          }
          
          // Download image from Firebase Storage URL with timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
          
          try {
            const response = await fetch(storageUrl, { 
              signal: controller.signal 
            });
            clearTimeout(timeoutId);
            
            if (!response.ok) {
              throw new Error(`Failed to download image: ${response.statusText}`)
            }
            
            // Convert to base64 data URL
            const buffer = await response.arrayBuffer()
            const base64 = Buffer.from(buffer).toString('base64')
            const contentType = response.headers.get('content-type') || 'image/jpeg'
            const dataUrl = `data:${contentType};base64,${base64}`
            
            // Parse with Gemini
            const result = await parseImageWithGemini(dataUrl)
            return { success: true, data: result }
          } catch (error: unknown) {
            const fetchError = error as Error;
            if (fetchError.name === 'AbortError') {
              throw new Error('Image download timed out after 30 seconds');
            }
            throw fetchError;
          }
        } catch (error: any) {
          lastError = error;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const errorCode = error.code || 'PARSING_ERROR';
          
          // Log the error but don't return yet if we have retries left
          console.error(`❌ Gemini parsing error on attempt ${retryCount + 1}/${MAX_RETRIES + 1} [${errorCode}]:`, {
            message: errorMessage,
            flyerImageId: event.data.flyerImageId,
            retryCount,
            errorStack: error instanceof Error ? error.stack : undefined,
            timestamp: new Date().toISOString()
          });
          
          // If this is a network error or timeout, retry
          const isNetworkError = errorMessage.includes('network') || 
                               errorMessage.includes('timeout') || 
                               errorMessage.includes('timed out') ||
                               errorMessage.includes('ECONNRESET');
          
          // If we have retries left and it's a retryable error
          if (retryCount < MAX_RETRIES && isNetworkError) {
            retryCount++;
            // Exponential backoff: 2s, then 4s
            const backoffMs = Math.pow(2, retryCount) * 1000;
            console.log(`⏱️ Backing off for ${backoffMs}ms before retry ${retryCount}`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
            continue;
          }
          
          // If we've exhausted retries or it's not a retryable error, return the error
          return { 
            success: false, 
            error: errorMessage,
            errorCode,
            timestamp: new Date().toISOString()
          };
        }
      }
      
      // This should never be reached due to the return statements above,
      // but TypeScript needs it for type safety
      const errorMessage = lastError instanceof Error ? lastError.message : 'Unknown error after retries';
      return {
        success: false,
        error: errorMessage,
        errorCode: 'MAX_RETRIES_EXCEEDED',
        timestamp: new Date().toISOString()
      };
    })

    if (!parseResult.success) {
      // Step 3a: Update status to failed if parsing failed
      await step.run('update-status-failed', async () => {
        await updateFlyerImageStatus(flyerImageId, 'failed', parseResult.error)
        return { status: 'failed', reason: parseResult.error }
      })
      
      throw new Error(`Parsing failed: ${parseResult.error}`)
    }

    // Step 3b: Save parsed data to Firestore
    const savedItems = await step.run('save-parsed-data', async () => {
      const results = parseResult.data
      const savedItemIds: string[] = []
      
      console.log(`📝 Saving ${results.length} parsed items to Firestore...`);

      for (const item of results) {
        try {
          // Build the item object, conditionally adding optional fields
          const parsedFlyerItem: Omit<ParsedFlyerItem, 'id' | 'parsedAt' | 'createdAt'> = {
            flyerImageId,
            productName: item.product_name,
            productNamePrefixes: item.product_name_prefixes,
            oldPrice: item.old_price,
            currency: item.currency,
            confidence: 0.85, // Default confidence score
            verified: false,
            matchingStatus: 'pending',
            matchedProducts: [],
          };

          if (item.product_name_mk) parsedFlyerItem.productNameMk = item.product_name_mk;
          if (item.product_name_prefixes_mk) parsedFlyerItem.productNamePrefixesMk = item.product_name_prefixes_mk;
          if (item.discount_price) parsedFlyerItem.discountPrice = item.discount_price;
          if (item.discount_text) parsedFlyerItem.discountText = item.discount_text;
          if (item.discount_price_mk) parsedFlyerItem.discountPriceMk = item.discount_price_mk;
          if (item.discount_start_date) parsedFlyerItem.discountStartDate = item.discount_start_date;
          if (item.discount_end_date) parsedFlyerItem.discountEndDate = item.discount_end_date;
          if (item.old_price_mk) parsedFlyerItem.oldPriceMk = item.old_price_mk;
          if (item.additional_info) parsedFlyerItem.additionalInfo = item.additional_info;
          if (item.additional_info_mk) parsedFlyerItem.additionalInfoMk = item.additional_info_mk;

          console.log('  - Saving item:', JSON.stringify(parsedFlyerItem, null, 2));
          const itemId = await addParsedFlyerItem(parsedFlyerItem)
          savedItemIds.push(itemId)
          console.log(`  - ✅ Successfully saved item with ID: ${itemId}`);
        } catch (error: any) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const errorType = error.name || 'FirestoreError';
          
          console.error(`❌ Error saving parsed item [${errorType}]:`, {
            message: errorMessage,
            flyerImageId,
            itemIndex: results.indexOf(item),
            itemData: JSON.stringify(item),
            errorStack: error instanceof Error ? error.stack : undefined,
            timestamp: new Date().toISOString()
          });
          
          // Continue with other items - this item will be skipped
        }
      }
      
      console.log(`✅ Finished saving parsed items. Total saved: ${savedItemIds.length}`);
      return savedItemIds
    })

    // Step 4: Trigger product matching for each saved item
    await step.run('trigger-product-matching', async () => {
      // Use batch processing to avoid overloading the system
      const batchId = `batch-${flyerImageId}-${Date.now()}`
      const MAX_RETRIES_PER_ITEM = 2;
      const failedItems: Array<{index: number, itemId: string, error: string}> = [];
      
      for (let index = 0; index < savedItems.length; index++) {
        let retryCount = 0;
        let success = false;
        
        while (retryCount <= MAX_RETRIES_PER_ITEM && !success) {
          try {
            const itemId = savedItems[index]
            
            // If this is a retry, log it
            if (retryCount > 0) {
              console.log(`🔄 Retry ${retryCount}/${MAX_RETRIES_PER_ITEM} for triggering product matching for item ${itemId}`);
            }
            
            // Get the item details from the parsing results (no nested step needed)
            const matchingItem = parseResult.data[index]
            if (!matchingItem) {
              throw new Error(`Item ${itemId} not found in results`);
            }
            
            // Safely extract data with fallbacks for missing fields
            const item = {
              id: itemId,
              productName: matchingItem.product_name || '',
              productNameMk: matchingItem.product_name_mk || '',
              productNamePrefixes: matchingItem.product_name_prefixes || [],
              productNamePrefixesMk: matchingItem.product_name_prefixes_mk || [],
              additionalInfo: matchingItem.additional_info || [],
              additionalInfoMk: matchingItem.additional_info_mk || []
            }
            
            // Trigger product matching event with timeout
            const sendPromise = inngest.send({
              name: 'flyer/product-match',
              data: {
                parsedItemId: itemId,
                flyerImageId,
                productName: item.productName,
                productNameMk: item.productNameMk,
                productNamePrefixes: item.productNamePrefixes,
                productNamePrefixesMk: item.productNamePrefixesMk,
                additionalInfo: item.additionalInfo,
                additionalInfoMk: item.additionalInfoMk,
                discountText: matchingItem.discount_text,
                batchId
              }
            });
            
            // Add a timeout to the send operation
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Inngest send operation timed out after 10 seconds')), 10000);
            });
            
            // Wait for either the send to complete or the timeout
            await Promise.race([sendPromise, timeoutPromise]);
            success = true;
            
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorType = error instanceof Error ? error.name : 'InngestError';
            
            console.error(`❌ Error triggering product matching (attempt ${retryCount + 1}/${MAX_RETRIES_PER_ITEM + 1}) [${errorType}]:`, {
              message: errorMessage,
              itemId: savedItems[index],
              flyerImageId,
              batchId,
              retryCount,
              errorStack: error instanceof Error ? error.stack : undefined,
              timestamp: new Date().toISOString()
            });
            
            // If we have retries left, retry after a delay
            if (retryCount < MAX_RETRIES_PER_ITEM) {
              retryCount++;
              // Exponential backoff: 1s, then 2s
              const backoffMs = Math.pow(2, retryCount) * 500;
              console.log(`⏱️ Backing off for ${backoffMs}ms before retry ${retryCount} for item ${savedItems[index]}`);
              await new Promise(resolve => setTimeout(resolve, backoffMs));
            } else {
              // If we've exhausted retries, track the failed item
              failedItems.push({
                index,
                itemId: savedItems[index],
                error: errorMessage
              });
              break; // Move to the next item
            }
          }
        }
      }
      
      // Log summary of failed items
      if (failedItems.length > 0) {
        console.error(`❌ Failed to trigger product matching for ${failedItems.length}/${savedItems.length} items after retries:`, {
          failedItems,
          flyerImageId,
          batchId,
          timestamp: new Date().toISOString()
        });
        
        // If all items failed, we should consider this a critical error
        if (failedItems.length === savedItems.length) {
          console.error(`⚠️ CRITICAL: All items failed to trigger product matching for flyer ${flyerImageId}`);
        }
      }
      
      return {
        totalItems: savedItems.length,
        successfulItems: savedItems.length - failedItems.length,
        failedItems: failedItems.length
      };
    })

    // Step 5: Update status to completed
    await step.run('update-status-completed', async () => {
      await updateFlyerImageStatus(flyerImageId, 'completed')
      return { status: 'completed' }
    })

    // Step 6: Trigger parallel image extraction
    await step.run('trigger-image-extraction', async () => {
      console.log('🎨 Triggering parallel image extraction...')
      
      // Get image dimensions (simplified - in production you might want to get actual dimensions)
      const imageDimensions = {
        width: 1920, // Default dimensions - could be extracted from actual image
        height: 1080
      }
      
      // Prepare parsed items data for image extraction
      const itemsForExtraction = savedItems.map(itemId => {
        const originalItem = parseResult.data.find((_, index) => savedItems[index] === itemId)
        return {
          id: itemId,
          productName: originalItem?.product_name || '',
          productNameMk: originalItem?.product_name_mk,
          discountPrice: originalItem?.discount_price,
          oldPrice: originalItem?.old_price || 0,
          additionalInfo: originalItem?.additional_info,
          // Could include AI-suggested regions from parsing in the future
          suggestedRegion: undefined
        }
      })
      
      // Send image extraction event
      await inngest.send({
        name: 'flyer/extract-images',
        data: {
          flyerImageId,
          storageUrl,
          originalImageDimensions: imageDimensions,
          parsedItems: itemsForExtraction
        }
      })
      
      console.log(`✅ Image extraction triggered for ${itemsForExtraction.length} items`)
      return { triggered: true, itemCount: itemsForExtraction.length }
    })

    return {
      flyerImageId,
      itemsSaved: savedItems.length,
      status: 'completed'
    }
  }
)

// Function to handle status updates
export const statusUpdateFunction = inngest.createFunction(
  { id: 'status-update', name: 'Handle Status Updates' },
  { event: 'flyer/parse-status-update' },
  async ({ event, step }) => {
    const { flyerImageId, status, error } = event.data

    try {
      await step.run('update-flyer-status', async () => {
        try {
          await updateFlyerImageStatus(flyerImageId, status)
          
          if (error) {
            console.error(`❌ Status update for ${flyerImageId} includes error:`, {
              message: typeof error === 'string' ? error : error?.message || 'Unknown error',
              flyerImageId,
              status,
              errorDetails: typeof error === 'object' ? error : undefined,
              timestamp: new Date().toISOString()
            })
          }
          
          return { flyerImageId, status, error }
        } catch (updateError: unknown) {
          const errorMessage = updateError instanceof Error ? updateError.message : 'Unknown error';
          const errorType = updateError instanceof Error ? updateError.name : 'StatusUpdateError';
          
          console.error(`❌ Failed to update flyer status [${errorType}]:`, {
            message: errorMessage,
            flyerImageId,
            targetStatus: status,
            errorStack: updateError instanceof Error ? updateError.stack : undefined,
            timestamp: new Date().toISOString()
          });
          throw updateError; // Re-throw to allow Inngest to retry
        }
      })

      return { success: true, flyerImageId, status }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      const errorType = e instanceof Error ? e.name : 'StatusUpdateFunctionError';
      
      console.error(`❌ Error in status-update function [${errorType}]:`, {
        message: errorMessage,
        flyerImageId,
        status,
        eventId: event.id,
        errorStack: e instanceof Error ? e.stack : undefined,
        timestamp: new Date().toISOString()
      });
      
      // Re-throw for Inngest retry mechanism
      throw e;
    }
  }
)

/**
 * Match products for a parsed flyer item
 */
/**
 * Function to apply discount by calling the API endpoint
 * This replaces the direct implementation to avoid nested step.* tooling
 */
async function applyDiscount({
  productId,
  flyerId,
  storeId,
  matchConfidence,
}: {
  productId: string;
  flyerId: string;
  storeId: string;
  matchConfidence: number;
}) {
  try {
    // Get the parsed flyer item to extract price information
    const parsedItemRef = adminDb.collection('parsed-flyer-items').doc(flyerId);
    const parsedItemDoc = await parsedItemRef.get();
    const parsedItem = parsedItemDoc.data();
    
    if (!parsedItem) {
      const error = new Error(`Parsed item ${flyerId} data not found`);
      console.error(`❌ Discount application failed [DataNotFoundError]:`, {
        message: error.message,
        errorCode: 'PARSED_ITEM_NOT_FOUND',
        parsedItemId: flyerId,
        productId,
        storeId,
        errorStack: error.stack,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
    
    // Get the product to update
    const productRef = adminDb.collection('products').doc(productId);
    const productDoc = await productRef.get();
    
    if (!productDoc.exists) {
      const error = new Error(`Product ${productId} not found for auto-discount application`);
      console.error(`❌ Discount application failed [ProductNotFoundError]:`, {
        message: error.message,
        errorCode: 'PRODUCT_NOT_FOUND',
        parsedItemId: flyerId,
        productId,
        storeId,
        errorStack: error.stack,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
    
    const product = productDoc.data();
    const currentPrice = product?.price || 0;
    
    // Extract price information from parsed item
    const regularPrice = parsedItem.regularPrice || parsedItem.oldPrice;
    const discountPrice = parsedItem.discountPrice;
    
    if (!regularPrice || !discountPrice) {
      const error = new Error('Missing price information for auto-discount application');
      console.error(`❌ Discount application failed [MissingPriceDataError]:`, {
        message: error.message,
        errorCode: 'MISSING_PRICE_DATA',
        parsedItemId: flyerId,
        productId,
        availableFields: Object.keys(parsedItem).filter(key => key.toLowerCase().includes('price')),
        errorStack: error.stack,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
    
    // Calculate discount percentage
    const discountPercentage = Math.round(((regularPrice - discountPrice) / regularPrice) * 100);
    if (discountPercentage <= 0 || discountPercentage >= 100) {
      const error = new Error(`Invalid discount percentage calculated: ${discountPercentage}%`);
      console.error(`❌ Discount application failed [InvalidDiscountError]:`, {
        message: error.message,
        errorCode: 'INVALID_DISCOUNT_PERCENTAGE',
        parsedItemId: flyerId,
        productId,
        regularPrice,
        discountPrice,
        calculatedPercentage: discountPercentage,
        errorStack: error.stack,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
    
    // Update the product with the discount
    const discountedPrice = applyDiscountPercentage(currentPrice, discountPercentage);
    
    // Add retry mechanism for product update
    const MAX_RETRIES = 2;
    let retryCount = 0;
    let updateSuccess = false;
    
    while (retryCount <= MAX_RETRIES && !updateSuccess) {
      try {
        if (retryCount > 0) {
          console.log(`🔄 Retry ${retryCount}/${MAX_RETRIES} for updating product ${productId} with discount`);
        }
        
        await productRef.update({
          discountedPrice,
          discountPercentage,
          discountSource: {
            type: 'flyer',
            parsedItemId: flyerId,
            appliedAt: new Date(),
            appliedBy: 'auto-approval',
            originalPrice: currentPrice,
            confidence: matchConfidence
          },
          hasActiveDiscount: true
        });
        
        updateSuccess = true;
      } catch (updateError: unknown) {
        const errorMessage = updateError instanceof Error ? updateError.message : 'Unknown error';
        const errorType = updateError instanceof Error ? updateError.name : 'ProductUpdateError';
        
        console.error(`❌ Failed to update product with discount (attempt ${retryCount + 1}/${MAX_RETRIES + 1}) [${errorType}]:`, {
          message: errorMessage,
          errorCode: 'PRODUCT_UPDATE_FAILED',
          parsedItemId: flyerId,
          productId,
          discountPercentage,
          discountedPrice,
          retryCount,
          errorStack: updateError instanceof Error ? updateError.stack : undefined,
          timestamp: new Date().toISOString()
        });
        
        // Check if this is a retryable error (network, timeout, or transient Firestore error)
        const isRetryableError = errorMessage.includes('network') || 
                               errorMessage.includes('timeout') || 
                               errorMessage.includes('ECONNRESET') ||
                               errorMessage.includes('unavailable') ||
                               errorMessage.includes('resource_exhausted');
        
        if (retryCount < MAX_RETRIES && isRetryableError) {
          retryCount++;
          // Exponential backoff: 1s, then 2s
          const backoffMs = Math.pow(2, retryCount) * 500;
          console.log(`⏱️ Backing off for ${backoffMs}ms before retry ${retryCount} for product update`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        } else {
          // If we've exhausted retries or it's not a retryable error, throw
          throw updateError;
        }
      }
    }
    
    if (!updateSuccess) {
      throw new Error(`Failed to update product ${productId} with discount after ${MAX_RETRIES} retries`);
    }
    
    // Update the parsed flyer item to mark the discount as applied
    try {
      await parsedItemRef.update({
        selectedProductId: productId,
        discountApplied: true,
        discountAppliedAt: new Date(),
        discountPercentage,
        autoDiscountApplied: true
      });
    } catch (updateError: unknown) {
      const errorMessage = updateError instanceof Error ? updateError.message : 'Unknown error';
      const errorType = updateError instanceof Error ? updateError.name : 'ParsedItemUpdateError';
      
      console.error(`❌ Failed to update parsed item with discount status [${errorType}]:`, {
        message: errorMessage,
        errorCode: 'PARSED_ITEM_UPDATE_FAILED',
        parsedItemId: flyerId,
        productId,
        discountPercentage,
        errorStack: updateError instanceof Error ? updateError.stack : undefined,
        timestamp: new Date().toISOString()
      });
      // We don't throw here since the discount was already applied to the product
      // Just log the error and continue
    }
    
    return {
      success: true,
      productId,
      originalPrice: currentPrice,
      discountedPrice,
      discountPercentage
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorCode = error instanceof Error && 'code' in error ? (error as any).code : 'UNKNOWN_ERROR';
    const isTimeout = errorMessage.includes('timed out') || errorMessage.includes('timeout');
    
    console.log('applyDiscount.failure', {
      productId,
      parsedItemId: flyerId,
      error: errorMessage,
      errorCode: isTimeout ? 'TIMEOUT' : errorCode,
      retryAttempts: 0,
      elapsedTimeMs: 0,
      timestamp: new Date().toISOString()
    });
    
    // For timeout errors, provide a more specific error with recovery suggestion
    if (isTimeout) {
      const timeoutError = new Error(`Discount application timed out after 30 seconds`);
      (timeoutError as any).code = 'DISCOUNT_TIMEOUT';
      (timeoutError as any).recoveryAction = 'MANUAL_DISCOUNT';
      throw timeoutError;
    }
  }
}

// Watchdog timer to detect and abort long-running operations
class WatchdogTimer {
  private timeoutId: NodeJS.Timeout | null = null;
  private startTime: number = 0;
  private onTimeoutCallback: (() => void) | null = null;
  
  start(timeoutMs: number, onTimeout: () => void): void {
    this.startTime = Date.now();
    this.onTimeoutCallback = onTimeout;
    this.timeoutId = setTimeout(() => {
      const elapsed = Date.now() - this.startTime;
      console.log(`⏱️ Watchdog timer triggered after ${elapsed}ms`);
      if (this.onTimeoutCallback) {
        this.onTimeoutCallback();
      }
    }, timeoutMs);
  }
  
  stop(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
      this.onTimeoutCallback = null;
    }
  }
  
  getElapsed(): number {
    return Date.now() - this.startTime;
  }
}

export const matchProductsFunction = inngest.createFunction(
  { 
    id: 'match-products', 
    name: 'Match Products to Database',
    // Add timeouts to prevent indefinite running
    timeouts: {
      finish: '3m' // 3 minute timeout for the entire function execution
    },
    // Add retries for transient failures
    retries: 2
  },
  { event: 'flyer/product-match' },
  async ({ event, step }) => {
    console.log('🔄 PRODUCT MATCHING WORKFLOW STARTED', { eventId: event.id, parsedItemId: event.data.parsedItemId })
    
    const { parsedItemId, productName, productNameMk, additionalInfo, additionalInfoMk } = event.data;

    try {
      // Update status to processing
      await step.run('update-status-to-processing', async () => {
        await updateParsedFlyerItem(parsedItemId, {
          matchingStatus: 'processing'
        })
      })

      // Step 1: Search for potential product matches
      const potentialMatches = await step.run('search-products', async () => {
        console.log(`🔍 Searching for products matching: ${productName}`)
        try {
          console.log(`🔍 Starting product search`);
          console.log(`📊 SEARCH_PARAMS - Search parameters:`, {
            parsedItemId,
            productName,
            productNameMk,
            additionalInfo: Array.isArray(additionalInfo) ? additionalInfo.join(', ') : additionalInfo,
            additionalInfoMk: Array.isArray(additionalInfoMk) ? additionalInfoMk.join(', ') : additionalInfoMk,
            limit: 10,
            timestamp: new Date().toISOString()
          });
          
          const results = await searchProducts(
            productName,
            productNameMk,
            additionalInfo?.join(', '),
            additionalInfoMk?.join(', '),
            10 // Limit to top 10 matches for performance
          );
          
          console.log(`✅ Found ${results.length} potential matches`);
          console.log(`📊 SEARCH_RESULTS - Search results summary:`, {
            parsedItemId,
            productName,
            resultCount: results.length,
            topMatchIds: results.slice(0, 3).map(r => r.id),
            timestamp: new Date().toISOString()
          });
          
          return results;
        } catch (error: any) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const errorType = error instanceof Error ? error.name : 'SearchError';
          const errorCode = error.code || 'SEARCH_FAILED';
          
          console.error(`❌ Product search failed [${errorType}:${errorCode}]:`, {
            message: errorMessage,
            parsedItemId,
            productName,
            errorStack: error instanceof Error ? error.stack : undefined,
            timestamp: new Date().toISOString()
          });
          
          // Return empty array instead of failing to allow the workflow to continue
          return [];
        }
      })

      if (potentialMatches.length === 0) {
        // No potential matches found - add detailed diagnostic logging
        console.log('⚠️ No potential matches found, marking as completed')
        console.log(`📊 MATCH_FAILURE_ANALYSIS - No potential matches found for product:`, {
          parsedItemId,
          productName,
          productNameMk,
          additionalInfo: Array.isArray(additionalInfo) ? additionalInfo.join(', ') : additionalInfo,
          additionalInfoMk: Array.isArray(additionalInfoMk) ? additionalInfoMk.join(', ') : additionalInfoMk,
          possibleReasons: [
            'Product not in database',
            'Search keywords did not match database entries',
            'Search circuit breaker triggered',
            'Search timeout occurred',
            'Database indexing issues'
          ].join(', '),
          timestamp: new Date().toISOString()
        })
        
        await step.run('update-no-matches', async () => {
          await updateParsedFlyerItem(parsedItemId, {
            matchingStatus: 'completed',
            matchedProducts: [], // Empty array indicates no matches found
            matchingDiagnostics: {
              searchAttempted: true,
              searchTimestamp: new Date().toISOString(),
              searchTerms: {
                productName,
                productNameMk,
                additionalInfo,
                additionalInfoMk
              },
              noMatchReason: 'No potential matches found in database'
            }
          })
        })
        return { success: true, message: 'No potential matches found' }
      }

      // Step 2: Deduplicate and score matches with AI
      const scoredMatches = await step.run('score-matches', async () => {
        console.log(`🧠 Processing ${potentialMatches.length} potential matches for deduplication and AI scoring`)
        console.log(`⏱️ Score matches step started at ${new Date().toISOString()}`)
        
        if (potentialMatches.length === 0) {
          console.log('⚠️ No potential matches found to score')
          return []
        }
        
        const flyerProduct = {
          productName,
          productNameMk,
          additionalInfo,
          additionalInfoMk
        }
        
        // Step 2a: Remove duplicates and invalid product IDs
        const uniqueProducts = potentialMatches.filter((product: any, index: number, array: any[]) => {
          // Skip products with invalid IDs
          if (!isValidProductId(product.id)) {
            console.log(`🔍 Deduplication: Skipping product with invalid ID: ${JSON.stringify(product)}`);
            return false;
          }
          
          const firstIndex = array.findIndex((p: any) => p.id === product.id);
          
          // Check for duplicates
          if (index !== firstIndex) {
            console.log(`🔍 Deduplication: Skipping duplicate product ID: ${product.id} (Name: ${product.name})`);
            return false;
          }
          
          console.log(`🔍 Deduplication: Keeping unique product ID: ${product.id} (Name: ${product.name})`);
          return true;
        })
        
        console.log(`🔄 Deduplicated from ${potentialMatches.length} to ${uniqueProducts.length} unique products`)
        
        // Step 2b: Format unique products for AI scoring
        const formattedProducts = uniqueProducts.map((p: any) => ({
          id: p.id,
          name: p.name || '',
          nameMk: p.nameMk || p.macedonianname || '',
          nameAl: p.albenianname || '',
          description: p.description || '',
          descriptionMk: p.descriptionMk || '',
          category: p.category || p.categoryId || ''
        }))
        
        try {
          console.log(`📊 SCORING_START - Starting AI scoring with parameters:`, {
            parsedItemId,
            productName,
            uniqueProductCount: formattedProducts.length,
            timestamp: new Date().toISOString()
          });
          
          try {
            const abortController = new AbortController();
            const signal = abortController.signal;
            
            // Set up a watchdog timer to abort if the operation takes too long
            const watchdog = new WatchdogTimer();
            watchdog.start(AI_SCORING_TIMEOUT, () => {
              console.log(`⏱️ AI scoring watchdog triggered - aborting operation`);
              abortController.abort('AI scoring operation timed out');
            });
            
            const timeoutPromise = new Promise<never>((_, reject) => {
              setTimeout(() => {
                console.error(`⏱️ AI scoring timeout after ${AI_SCORING_TIMEOUT/1000} seconds`);
                reject(new Error(`AI scoring timeout after ${AI_SCORING_TIMEOUT/1000} seconds`));
              }, AI_SCORING_TIMEOUT);
            });
            
            // Pass the timeout value to the scoreProductMatches function
            const scoringPromise = scoreProductMatches(flyerProduct, formattedProducts, AI_SCORING_TIMEOUT - 5000); // 5s buffer
            
            console.log(`🚀 AI scoring promise created at ${new Date().toISOString()}`);
            const result = await Promise.race([scoringPromise, timeoutPromise]);
            console.log(`🎯 AI scoring completed at ${new Date().toISOString()} with ${result.length} scored matches`);
        
            // Validate the result structure to ensure it's usable
            const validatedResult = result.filter(match => {
              if (!match || typeof match !== 'object') return false;
              if (typeof match.productId !== 'string' || !match.productId) return false;
              if (typeof match.relevanceScore !== 'number') return false;
              return true;
            });
            
            if (validatedResult.length === 0 && result.length > 0) {
              console.warn('⚠️ All AI scoring results were invalid - using fallback');
              throw new Error('Invalid AI scoring results structure');
            }
            
            return validatedResult;
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorType = error instanceof Error ? error.name : 'AIScoringError';
            const errorCode = error instanceof Error && 'code' in error ? (error as any).code : 'SCORING_FAILED';
            
            console.error(`❌ AI scoring failed [${errorType}:${errorCode}]:`, {
              message: errorMessage,
              parsedItemId,
              productCount: formattedProducts.length,
              errorStack: error instanceof Error ? error.stack : undefined,
              timestamp: new Date().toISOString()
            });
            
            // Fallback: create basic matches with moderate scores and no auto-approval
            const fallbackMatches = formattedProducts.slice(0, 3).map(product => ({
              productId: product.id,
              relevanceScore: 0.5, // Moderate score as fallback
              matchReason: `Fallback match due to AI scoring failure: ${error instanceof Error ? error.message : 'Unknown error'}`,
              can_auto_merge: false, // Never auto-approve fallback matches
              autoApprovalReason: 'Auto-approval skipped due to AI scoring failure'
            }));
            console.log(`🔄 Using fallback scoring for ${fallbackMatches.length} products`);
            return fallbackMatches;
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const errorType = error instanceof Error ? error.name : 'ScoringError';
          const errorCode = error instanceof Error && 'code' in error ? (error as any).code : 'SCORING_FAILED';
          
          console.error(`❌ AI scoring failed [${errorType}:${errorCode}]:`, {
            message: errorMessage,
            parsedItemId,
            productCount: formattedProducts.length,
            errorStack: error instanceof Error ? error.stack : undefined,
            timestamp: new Date().toISOString()
          });
          
          // Fallback: create basic matches with moderate scores and no auto-approval
          const fallbackMatches = formattedProducts.slice(0, 3).map(product => ({
            productId: product.id,
            relevanceScore: 0.5, // Moderate score as fallback
            matchReason: `Fallback match due to AI scoring failure: ${error instanceof Error ? error.message : 'Unknown error'}`,
            can_auto_merge: false, // Never auto-approve fallback matches
            autoApprovalReason: 'Auto-approval skipped due to AI scoring failure'
          }));
          console.log(`🔄 Using fallback scoring for ${fallbackMatches.length} products`);
          return fallbackMatches;
        } finally {
          console.log(`⏱️ Score matches step completed at ${new Date().toISOString()}`);
        }
      })

      // Step 3: Filter matches with minimum relevance score
      const MIN_RELEVANCE_SCORE = 0.4; // Only keep matches with at least 40% relevance
      const filteredMatches = scoredMatches ? scoredMatches.filter((match: { relevanceScore: number }) => match.relevanceScore >= MIN_RELEVANCE_SCORE) : [];

      // Step 4: Format matches for database and check auto-approval
      const productMap = new Map(potentialMatches.map((p: any) => [p.productId.trim(), p]));

      const matchedProducts = filteredMatches
        .filter((match: { productId: any }) => isValidProductId(match.productId))
        .map((match: any) => {
          const originalProduct = productMap.get(match.productId.trim());
          
          return {
            productId: match.productId,
            relevanceScore: match.relevanceScore,
            matchReason: match.matchReason || 'AI matched based on product name and details',
            can_auto_merge: match.can_auto_merge,
            autoApprovalReason: match.autoApprovalReason,
            matchedAt: Timestamp.now(),
            productData: originalProduct ? {
              albenianname: originalProduct.albenianname || '',
              categoryId: originalProduct.categoryId || '',
              discountPercentage: originalProduct.discountPercentage || 0,
              iconUrl: originalProduct.iconUrl || '',
              imageUrl: originalProduct.imageUrl || '',
              macedonianname: originalProduct.macedonianname || '',
              name: originalProduct.name || '',
              newPrice: originalProduct.newPrice || '',
              oldPrice: originalProduct.oldPrice || '',
              productId: originalProduct.productId || '',
              superMarketName: originalProduct.superMarketName || '',
            } : undefined
          };
        });

      console.log('Final Matched Products:', JSON.stringify(matchedProducts, null, 2));

      // Using the AutoApprovalResult interface defined at the top of the file

      // Step 5: Check for auto-approval from Gemini results
      const autoApprovalResult: AutoApprovalResult | null = await step.run('check-auto-approval', async () => {
        const highConfidenceMatches = filteredMatches.filter((match: any) => match.relevanceScore >= 0.9);

        if (highConfidenceMatches.length > 1) {
          console.log(`⚠️ Multiple high-confidence matches found (${highConfidenceMatches.length}). Skipping auto-approval.`);
          return {
            shouldAutoApprove: false,
            reasoning: `Multiple high-confidence matches found (${highConfidenceMatches.length}). Requires manual review.`,
            confidence: 0,
            productId: null,
          } as AutoApprovalResult;
        }
        
        console.log(`📊 Checking auto-approval for ${filteredMatches.length} potential matches`)
        console.log(`🔍 Auto-approval workflow step started at ${new Date().toISOString()}`)
        console.log(`📋 Parsed item ID: ${parsedItemId}`)

        if (filteredMatches.length === 0) {
          console.log('⚠️ No matches to check for auto-approval')
          return null
        }

        // Use filteredMatches which contains can_auto_merge from Gemini
        const autoApprovableMatches = filteredMatches.filter(
          (match: any) => match.can_auto_merge === true && isValidProductId(match.productId)
        );

        if (autoApprovableMatches.length > 0) {
          // Sort by relevance score to get the best auto-approvable match
          const bestMatch = autoApprovableMatches.sort(
            (a: any, b: any) => b.relevanceScore - a.relevanceScore
          )[0];

          console.log(`🚀 Auto-approval suggested by AI for product: ${bestMatch.productId} with confidence ${bestMatch.relevanceScore.toFixed(2)}`);
          console.log(`📝 Reason: ${bestMatch.autoApprovalReason || 'AI suggested auto-approval'}`);

          return {
            shouldAutoApprove: true,
            productId: bestMatch.productId,
            reasoning: bestMatch.autoApprovalReason || `Auto-approved based on AI evaluation with relevance score of ${bestMatch.relevanceScore.toFixed(2)}`,
            confidence: bestMatch.relevanceScore,
          } as AutoApprovalResult;
        } else {
          console.log('⚠️ No matches were marked for auto-approval by AI - requires manual review');
          return {
            shouldAutoApprove: false,
            reasoning: 'No matches met the auto-approval criteria according to AI evaluation.',
            confidence: 0,
            productId: null,
          } as AutoApprovalResult;
        }
      })

      // Step 6: Save matches and update status
      await step.run('save-matches-and-update-status', async () => {
        const validatedMatches = matchedProducts
          .filter((match: { productId: any }) => isValidProductId(match.productId))
          .map((match: any) => {
            const originalProduct = productMap.get(match.productId.trim());
            
            return {
              productId: match.productId,
              relevanceScore: match.relevanceScore,
              matchReason: match.matchReason || 'AI matched based on product name and details',
              can_auto_merge: match.can_auto_merge,
              autoApprovalReason: match.autoApprovalReason,
              matchedAt: Timestamp.now(),
              productData: originalProduct ? {
                albenianname: originalProduct.albenianname || '',
                categoryId: originalProduct.categoryId || '',
                discountPercentage: originalProduct.discountPercentage || 0,
                iconUrl: originalProduct.iconUrl || '',
                imageUrl: originalProduct.imageUrl || '',
                macedonianname: originalProduct.macedonianname || '',
                name: originalProduct.name || '',
                newPrice: originalProduct.newPrice || '',
                oldPrice: originalProduct.oldPrice || '',
                productId: originalProduct.productId || '',
                superMarketName: originalProduct.superMarketName || '',
              } : undefined
            };
          });

        const updateData: any = {
          matchedProducts: validatedMatches as any,
          matchingStatus: 'completed',
        };

        if (autoApprovalResult?.shouldAutoApprove && autoApprovalResult.productId) {
          updateData.selectedProductId = autoApprovalResult.productId;
          updateData.autoApproved = true;
          updateData.autoApprovalReason = autoApprovalResult.reasoning;
          updateData.autoApprovalConfidence = autoApprovalResult.confidence;
          updateData.autoApprovedAt = Timestamp.now();
          updateData.autoApprovalStatus = 'success';
        } else {
          updateData.autoApprovalStatus = 'failed';
          updateData.autoApprovalFailedAt = Timestamp.now();
          updateData.autoApprovalFailureReason = autoApprovalResult?.reasoning || 'Auto-approval evaluation failed';
        }

        await updateParsedFlyerItem(parsedItemId, updateData);
      });

      // Step 7: Apply discount if auto-approved (as a separate, final step)
      if (autoApprovalResult?.shouldAutoApprove && autoApprovalResult.productId) {
        await step.run('apply-auto-discount', async () => {
          const logger: Logger = {
            log: (message, data) => console.log(`📝 ${message}`, data || ''),
            info: (message, data) => console.log(`ℹ️ ${message}`, data || ''),
            error: (message, data) => console.error(`❌ ${message}`, data || '')
          };

          await helperApplyDiscountWithTimeout({
            productId: autoApprovalResult.productId!,
            flyerId: parsedItemId,
            storeId: 'auto-approval',
            matchConfidence: autoApprovalResult.confidence || 0,
            logger
          });
        });
      }
      
      return {
        success: true,
        parsedItemId,
        matchedProducts: matchedProducts.length,
        autoApproved: autoApprovalResult?.shouldAutoApprove || false,
      };
    } catch (e: unknown) {
      
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      const errorType = e instanceof Error ? e.name : 'MatchProductsError';
      
      console.error(`❌ Error in match-products function [${errorType}]:`, {
        message: errorMessage,
        parsedItemId,
        eventId: event.id,
        errorStack: e instanceof Error ? e.stack : undefined,
        timestamp: new Date().toISOString()
      });
      
      // Try to update the item status to prevent hanging
      try {
        await updateParsedFlyerItem(event.data.parsedItemId, {
          matchingStatus: 'failed',
          matchingError: `Matching process failed: ${errorMessage.substring(0, 200)}`
        }).catch(updateError => {
          console.error('Failed to update status after error', updateError);
        });
      } catch (updateError) {
        console.error('Failed to update status after error', updateError);
      }
      
      // Re-throw the error for Inngest to handle (will trigger retries based on the retry configuration)
      throw e;
    }
  })

// Function to extract clean product images from flyers
export const extractImagesFunction = inngest.createFunction(
  { id: 'extract-item-images', name: 'Extract Clean Product Images from Flyer' },
  { event: 'flyer/extract-images' },
  async ({ event, step }) => {
    console.log('🎨 INNGEST IMAGE EXTRACTION TRIGGERED!', { 
      eventId: event.id, 
      flyerImageId: event.data.flyerImageId,
      itemCount: event.data.parsedItems.length 
    })
    
    const { flyerImageId, storageUrl, originalImageDimensions, parsedItems } = event.data
    
    try {
      // Step 1: Update all items to processing status
      await step.run('update-extraction-status-processing', async () => {
        const updatePromises = parsedItems.map((item: any) => 
          updateParsedFlyerItem(item.id, {
            imageExtractionStatus: 'processing'
          })
        )
        await Promise.all(updatePromises)
        console.log(`📝 Updated ${parsedItems.length} items to processing status`)
        return { updated: parsedItems.length }
      })
      
      // Step 2: Download and prepare flyer image
      const flyerImageData = await step.run('prepare-flyer-image', async () => {
        console.log('📥 Downloading flyer image for processing...')
        
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 60000) // 60 second timeout
          
          const response = await fetch(storageUrl, { 
            signal: controller.signal 
          })
          clearTimeout(timeoutId)
          
          if (!response.ok) {
            throw new Error(`Failed to download flyer image: ${response.statusText}`)
          }
          
          const buffer = await response.arrayBuffer()
          const base64 = Buffer.from(buffer).toString('base64')
          const contentType = response.headers.get('content-type') || 'image/jpeg'
          const dataUrl = `data:${contentType};base64,${base64}`
          
          console.log(`✅ Flyer image prepared: ${Math.round(buffer.byteLength / 1024)}KB`)
          return dataUrl
          
        } catch (error: any) {
          console.error('❌ Error downloading flyer image:', error)
          throw new Error(`Failed to prepare flyer image: ${error.message}`)
        }
      })
      
      // Step 3: Extract clean product images with Imagen 4
      const extractedImages = await step.run('extract-images-from-flyer', async () => {
        console.log('🎨 Extracting clean product images with Imagen 4...')
        console.log(`📊 Processing ${parsedItems.length} parsed items`)
        
        try {
          // Add timeout protection for the entire extraction process
          const extractionPromise = extractCleanProductImages(
            flyerImageData,
            parsedItems,
            {
              removeText: true,
              removePromotionalElements: true,
              backgroundStyle: 'white',
              productCentering: true,
              qualityEnhancement: true
            }
          )
          
          // Set a 5-minute timeout for the entire extraction process
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Image extraction timed out after 5 minutes')), 300000)
          })
          
          const cleanImages = await Promise.race([extractionPromise, timeoutPromise]) as any
          
          console.log(`✅ Extracted ${cleanImages.length} clean product images`)
          return cleanImages
          
        } catch (error: any) {
          console.error('❌ Error extracting clean product images:', error)
          console.error('❌ Full error stack:', error.stack)
          
          // Return empty array instead of throwing to prevent function from hanging
          console.warn('⚠️ Returning empty array to prevent function hang')
          return []
        }
      })
      
      // Optimize images first
      const optimizedResults = await step.run('optimize-images', async () => {
        console.log(`🔧 Optimizing ${extractedImages.length} extracted images...`)
        
        const results: Array<{
          itemId: string
          success: boolean
          optimizedImages?: any
          extractedImage?: any
          error?: string
        }> = []
        
        for (const extractedImage of extractedImages) {
          try {
            console.log(`🔧 Optimizing image for item: ${extractedImage.itemId}`)
            
            // Validate image quality
            const qualityCheck = await validateImageQuality(extractedImage.extractedImageData)
            
            if (!qualityCheck.isValid) {
              console.warn(`⚠️ Quality issues for item ${extractedImage.itemId}:`, qualityCheck.issues)
              // Continue processing but flag for manual review
              extractedImage.manualReviewRequired = true
              extractedImage.qualityScore = qualityCheck.qualityScore
            }
            
            // Optimize for Flutter
            const optimizedImages = await optimizeForFlutter(extractedImage.extractedImageData, {
              maxWidth: 800,
              maxHeight: 600,
              quality: 85,
              format: 'webp',
              generateThumbnail: true,
              generateTransparent: false, // Skip transparent for now
              generateMultipleResolutions: true
            })
            
            results.push({
              itemId: extractedImage.itemId,
              success: true,
              optimizedImages,
              extractedImage
            })
            
            console.log(`✅ Successfully optimized image for item: ${extractedImage.itemId}`)
            
          } catch (error: any) {
            console.error(`❌ Error optimizing image for item ${extractedImage.itemId}:`, error)
            results.push({
              itemId: extractedImage.itemId,
              success: false,
              error: error.message
            })
          }
        }
        
        return results
      })

      // Upload optimized images to storage
      const processedResults = await step.run('upload-images-to-storage', async () => {
        console.log(`📤 Uploading ${optimizedResults.length} optimized images to Firebase Storage...`)
        
        const results: Array<{
          itemId: string
          success: boolean
          urls?: any
          error?: string
        }> = []
        
        for (const optimizedResult of optimizedResults) {
          try {
            if (!optimizedResult.success) {
              // Pass through optimization failures
              results.push({
                itemId: optimizedResult.itemId,
                success: false,
                error: optimizedResult.error
              })
              continue
            }
            
            console.log(`📤 Uploading image for item: ${optimizedResult.itemId}`)
            
            // Upload to storage
            const uploadResult = await uploadOptimizedImages(
              flyerImageId,
              optimizedResult.itemId,
              optimizedResult.optimizedImages
            )
            
            // Save metadata
            const metadata = {
              extraction: {
                confidence: optimizedResult.extractedImage.confidence,
                qualityScore: optimizedResult.extractedImage.qualityScore,
                processingMethod: optimizedResult.extractedImage.processingMethod,
                backgroundRemoved: optimizedResult.extractedImage.backgroundRemoved,
                textRemoved: optimizedResult.extractedImage.textRemoved,
                manualReviewRequired: optimizedResult.extractedImage.manualReviewRequired,
                extractedAt: new Date().toISOString()
              },
              optimization: {
                format: 'webp',
                quality: 85,
                resolutions: ['1x', '2x', '3x'],
                optimizedAt: new Date().toISOString()
              },
              upload: uploadResult.metadata
            }
            
            await saveImageMetadata(flyerImageId, optimizedResult.itemId, metadata)
            
            results.push({
              itemId: optimizedResult.itemId,
              success: true,
              urls: uploadResult.urls
            })
            
            console.log(`✅ Successfully uploaded image for item: ${optimizedResult.itemId}`)
            
          } catch (error: any) {
            console.error(`❌ Error uploading image for item ${optimizedResult.itemId}:`, error)
            results.push({
              itemId: optimizedResult.itemId,
              success: false,
              error: error.message
            })
          }
        }
        
        return results
      })

      // Step 5: Update database with results
      await step.run('update-database-results', async () => {
        console.log('💾 Updating database with extraction results...')
        
        // Update database records as individual Inngest steps for better reliability
        await step.run('update-database-records', async () => {
          console.log('📝 Starting database updates for all processed items...')
          
          const updatePromises = processedResults.map(async (result) => {
            try {
              console.log(`🔄 Processing update for item ${result.itemId}: success=${result.success}`)
              
              if (result.success && result.urls) {
                console.log(`✅ Updating item ${result.itemId} with completed status and images`)
                
                // Update with successful extraction
                await updateParsedFlyerItem(result.itemId, {
                  extractedImages: {
                    clean: {
                      original: result.urls.original,
                      optimized: result.urls.optimized,
                      thumbnail: result.urls.thumbnail,
                      transparent: result.urls.transparent
                    },
                    resolutions: result.urls.resolutions,
                    extractionMetadata: {
                      confidence: extractedImages.find(img => img.itemId === result.itemId)?.confidence || 0,
                      backgroundRemoved: true,
                      textRemoved: true,
                      qualityScore: extractedImages.find(img => img.itemId === result.itemId)?.qualityScore || 0,
                      processingMethod: 'imagen4',
                      manualReviewRequired: extractedImages.find(img => img.itemId === result.itemId)?.manualReviewRequired || false
                    }
                  },
                  imageExtractionStatus: 'completed',
                  imageExtractedAt: Timestamp.now() as any,
                  imageQualityScore: extractedImages.find(img => img.itemId === result.itemId)?.qualityScore || 0
                })
                
                console.log(`🎉 Successfully updated item ${result.itemId} to completed status`)
              } else {
                console.log(`❌ Updating item ${result.itemId} with failed status: ${result.error}`)
                
                // Update with failure
                await updateParsedFlyerItem(result.itemId, {
                  imageExtractionStatus: 'failed',
                  imageExtractionError: result.error || 'Unknown error during image extraction'
                })
                
                console.log(`💥 Successfully updated item ${result.itemId} to failed status`)
              }
            } catch (updateError: any) {
              console.error(`❌ Error updating database for item ${result.itemId}:`, updateError)
              console.error('❌ Full error details:', updateError.message, updateError.stack)
              throw updateError // Re-throw to ensure step fails if database update fails
            }
          })
          
          await Promise.all(updatePromises)
          
          const successCount = processedResults.filter(r => r.success).length
          const failureCount = processedResults.filter(r => !r.success).length
          
          console.log(`✅ Database updates complete: ${successCount} successful, ${failureCount} failed`)
          
          return {
            totalUpdated: processedResults.length,
            successfulExtractions: successCount,
            failedExtractions: failureCount
          }
        })
      })
      
      console.log('🎉 Image extraction pipeline completed successfully!')
      
      return {
        success: true,
        flyerImageId,
        totalItems: parsedItems.length,
        extractedImages: updateResults.successfulExtractions,
        failedExtractions: updateResults.failedExtractions
      }
      
    } catch (error: any) {
      console.error('❌ Error in image extraction pipeline:', error)
      
      // Update all items to failed status
      try {
        const failureUpdatePromises = parsedItems.map((item: any) => 
          updateParsedFlyerItem(item.id, {
            imageExtractionStatus: 'failed',
            imageExtractionError: `Pipeline failed: ${error.message}`
          })
        )
        await Promise.all(failureUpdatePromises)
      } catch (updateError) {
        console.error('❌ Error updating items to failed status:', updateError)
      }
      
      throw error
    }
  }
)

// Export all functions for Inngest registration
export const inngestFunctions = [parseFlyerFunction, matchProductsFunction, extractImagesFunction]