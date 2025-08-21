import { inngest } from '../inngest'
import { parseImageWithGemini } from '../gemini'
import { scoreProductMatches } from '@/lib/gemini-product-match'
import { updateFlyerImageStatus, addParsedFlyerItem, updateParsedFlyerItem, searchProducts } from '../firestore-admin'
import { getImageDataUrl } from '@/lib/storage-admin'
import { evaluateAutoApproval } from '@/lib/auto-approval'
import { applyDiscountPercentage } from '@/lib/utils'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { GeminiParseResult, ParsedFlyerItem, MatchedProduct } from '@/types'
import { adminDb } from '../firebase/admin'
import { applyDiscountWithTimeout as helperApplyDiscountWithTimeout, Logger } from './helpers'

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

    // Step 4: Trigger product matching for each parsed item
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
      return { status: 'completed', savedItems: savedItems.length }
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
    // Create a global watchdog timer for the entire function
    const globalWatchdog = new WatchdogTimer();
    // Set a 2m55s timeout (slightly less than the 3m Inngest timeout)
    const GLOBAL_TIMEOUT_MS = 175000; // 2m55s
    
    // Create an abort controller for cancelling operations
    const globalController = new AbortController();
    const globalSignal = globalController.signal;
    
    // Start the watchdog timer
    globalWatchdog.start(GLOBAL_TIMEOUT_MS, () => {
      console.error(`⚠️ GLOBAL WATCHDOG TRIGGERED - Function running too long (${GLOBAL_TIMEOUT_MS}ms)`);
      globalController.abort('Global watchdog timeout triggered');
      
      // Attempt to update the item status to prevent hanging
      try {
        updateParsedFlyerItem(event.data.parsedItemId, {
          matchingStatus: 'failed',
          matchingError: `Matching process timed out after ${GLOBAL_TIMEOUT_MS/1000} seconds`
        }).catch(e => console.error('Failed to update status after watchdog timeout', e));
      } catch (e) {
        console.error('Failed to update status after watchdog timeout', e);
      }
    });
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
          if (!product.id || product.id === 'undefined' || product.id === 'null' || typeof product.id !== 'string') {
            console.log(`⚠️ Filtering out product with invalid ID: ${JSON.stringify(product)}`)
            return false
          }
          
          // Check for duplicates
          return array.findIndex((p: any) => p.id === product.id) === index
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
        console.log(`📊 Checking auto-approval for ${matchedProducts.length} potential matches`)
        console.log(`🔍 Auto-approval workflow step started at ${new Date().toISOString()}`)
        console.log(`📋 Parsed item ID: ${parsedItemId}`)
        
        if (matchedProducts.length === 0) {
          console.log('⚠️ No matches to check for auto-approval')
          return null
        }

        // Add timeout to prevent this step from hanging - increased to 30 seconds
        const MAX_AUTO_APPROVAL_TIME = 30000; // 30 seconds timeout
        console.log(`⏱️ Setting auto-approval timeout to ${MAX_AUTO_APPROVAL_TIME/1000} seconds`)
        
        // Create a controller to abort the operation if needed
        const controller = new AbortController();
        const signal = controller.signal;
        
        // Set up the timeout to abort the operation
        const timeoutId = setTimeout(() => {
          console.log(`⏱️ Aborting auto-approval after ${MAX_AUTO_APPROVAL_TIME/1000} seconds`)
          controller.abort(`Auto-approval timed out after ${MAX_AUTO_APPROVAL_TIME/1000} seconds`);
        }, MAX_AUTO_APPROVAL_TIME);
        
        const processAutoApproval = async () => {
          try {
            // Check if already aborted
            if (signal.aborted) {
              throw new Error(`Operation aborted: ${signal.reason}`);
            }
            
            // Log all matches with their auto-approval status
            matchedProducts.forEach((match: any, index: number) => {
              console.log(`Match #${index + 1}: productId=${match.productId}, relevanceScore=${match.relevanceScore.toFixed(2)}, reason=${match.matchReason || 'N/A'}`)
            })

            // Find matches that can be auto-merged based on relevance score
            // Since we've already filtered for valid product IDs, we can use a high confidence threshold
            const autoApprovableMatches = matchedProducts.filter((match: any) => {
              // Only consider matches with valid product IDs and high relevance score
              return isValidProductId(match.productId) && match.relevanceScore >= 0.85;
            })
            
            if (autoApprovableMatches.length > 0) {
              // Sort by relevance score to get the best auto-approvable match
              const bestMatch = autoApprovableMatches.sort((a: any, b: any) => b.relevanceScore - a.relevanceScore)[0]
              console.log(`🚀 Auto-approval approved for product: ${bestMatch.productId} with confidence ${bestMatch.relevanceScore.toFixed(2)}`)
              console.log(`📝 Reason: ${bestMatch.matchReason || 'High confidence match'}`)
              
              // Return a properly formatted AutoApprovalResult object
              return {
                shouldAutoApprove: true,
                productId: bestMatch.productId,
                reasoning: `Auto-approved based on high relevance score of ${bestMatch.relevanceScore.toFixed(2)}`,
                confidence: bestMatch.relevanceScore
              } as AutoApprovalResult
            } else {
              // Fallback: If no auto-approvable matches but we have high confidence matches
              const highConfidenceMatches = matchedProducts.filter((match: any) => match.relevanceScore >= 0.7)
              
              if (highConfidenceMatches.length > 0) {
                // Use the highest confidence match as fallback
                const bestMatch = highConfidenceMatches.sort((a: any, b: any) => b.relevanceScore - a.relevanceScore)[0]
                console.log(`🔄 No explicit auto-approvable matches, but found high confidence match: ${bestMatch.productId} with score ${bestMatch.relevanceScore.toFixed(2)}`)
                console.log(`📝 Using high confidence match for auto-approval`)
                
                return {
                  shouldAutoApprove: true,
                  productId: bestMatch.productId,
                  reasoning: `Auto-approved based on high confidence score (${bestMatch.relevanceScore.toFixed(2)})`,
                  confidence: bestMatch.relevanceScore
                } as AutoApprovalResult
              } else {
                console.log('⚠️ No matches meet auto-approval criteria - requires manual review')
                return {
                  shouldAutoApprove: false,
                  reasoning: 'No matches meet the configured auto-approval criteria',
                  confidence: 0,
                  productId: null
                } as AutoApprovalResult
              }
            }
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorType = error instanceof Error ? error.name : 'AutoApprovalError';
            
            console.error(`❌ Error in processAutoApproval [${errorType}]:`, {
              message: errorMessage,
              parsedItemId,
              matchCount: matchedProducts.length,
              errorStack: error instanceof Error ? error.stack : undefined,
              timestamp: new Date().toISOString()
            });
            
            // Re-throw to be handled by the outer catch block
            throw error;
          }
        }
        
        try {
          // Execute the auto-approval process with timeout handling
          const result = await Promise.race([
            processAutoApproval(),
            new Promise<never>((_, reject) => {
              setTimeout(() => {
                // Instead of rejecting, return a fallback result
                console.log(`⏱️ Auto-approval timed out after ${MAX_AUTO_APPROVAL_TIME/1000} seconds, using fallback result`)
                reject(new Error(`Auto-approval timed out after ${MAX_AUTO_APPROVAL_TIME/1000} seconds`))
              }, MAX_AUTO_APPROVAL_TIME)
            })
          ])
          
          // Clear the timeout since we completed successfully
          clearTimeout(timeoutId);
          console.log(`✅ Auto-approval completed successfully at ${new Date().toISOString()}`)
          return result;
        } catch (error: unknown) {
          // Clear the timeout to prevent memory leaks
          clearTimeout(timeoutId);
          
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const errorType = error instanceof Error ? error.name : 'AutoApprovalTimeoutError';
          
          console.error(`❌ Auto-approval error [${errorType}]:`, {
            message: errorMessage,
            parsedItemId,
            matchCount: matchedProducts.length,
            errorStack: error instanceof Error ? error.stack : undefined,
            timestamp: new Date().toISOString()
          });
          
          // If we have any matches at all, use the best one as a fallback
          if (matchedProducts.length > 0 && matchedProducts.some(match => isValidProductId(match.productId))) {
            // Sort by relevance score
            const sortedMatches = [...matchedProducts].sort((a: any, b: any) => b.relevanceScore - a.relevanceScore);
            const bestMatch = sortedMatches[0];
            
            // Only auto-approve if it has high confidence
            if (bestMatch.relevanceScore >= 0.8) {
              console.log(`🔄 Auto-approval failed but using best match as fallback: ${bestMatch.productId} with score ${bestMatch.relevanceScore.toFixed(2)}`)
              return {
                shouldAutoApprove: true,
                productId: bestMatch.productId,
                reasoning: `Auto-approved as fallback after error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                confidence: bestMatch.relevanceScore
              } as AutoApprovalResult
            }
          }
          
          // Return fallback result on timeout or error
          return {
            shouldAutoApprove: false,
            reasoning: `Auto-approval failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            confidence: 0,
            productId: null
          } as AutoApprovalResult
        } finally {
          console.log(`⏱️ Auto-approval step completed at ${new Date().toISOString()}`)
        }
      })

      // Step 6: Save matches and handle auto-approval
      await step.run('save-matches-and-auto-approve', async () => {
        console.log(`💾 Saving ${matchedProducts.length} matches to database`)
        console.log(`⏱️ Save matches step started at ${new Date().toISOString()}`)
        
        try {
          // Final validation to ensure no invalid values in matchedProducts
          const validatedMatches = matchedProducts.filter(match => {
            if (!match || typeof match !== 'object') {
              console.log(`⚠️ Skipping invalid match: ${JSON.stringify(match)}`)
              return false;
            }
            
            // Use our utility function for consistent validation
            if (!isValidProductId(match.productId)) {
              console.log(`⚠️ Skipping match with invalid productId: ${JSON.stringify(match)}`)
              return false;
            }
            
            // Verify the productId exists in the database
            const productExists = potentialMatches.some((p: any) => p.id === match.productId);
            if (!productExists) {
              console.log(`⚠️ Skipping match with non-existent productId: ${match.productId}`)
              return false;
            }
            
            return true;
          });
          
          console.log(`✅ Validated ${validatedMatches.length} matches for Firestore update`);
          
          // Log the structure of the first few matches for debugging
          if (validatedMatches.length > 0) {
            console.log(`🔍 Sample match structure: ${JSON.stringify(validatedMatches[0]).substring(0, 200)}...`)
          }
          
          const updateData: any = {
            matchedProducts: validatedMatches as any
          }

          // Handle auto-approval decision
          if (autoApprovalResult?.shouldAutoApprove && autoApprovalResult?.productId) {
            // Auto-approval approved - set status to applied_to_product
            updateData.matchingStatus = 'applied_to_product'
            updateData.selectedProductId = autoApprovalResult.productId
            updateData.autoApproved = true
            updateData.autoApprovalReason = autoApprovalResult.reasoning
            updateData.autoApprovalConfidence = autoApprovalResult.confidence || 0 // Ensure we always have a number value
            updateData.autoApprovedAt = Timestamp.now()
            updateData.autoApprovalStatus = 'success'
            
            console.log(`🚀 Auto-approved and applied to product: ${autoApprovalResult.productId}`)
            console.log(`📝 Status set to: applied_to_product`)
          } else {
            // Auto-approval failed - set status to waiting for manual approval
            updateData.matchingStatus = 'waiting_for_approval'
            updateData.autoApprovalStatus = 'failed'
            updateData.autoApprovalFailedAt = Timestamp.now()
            updateData.autoApprovalFailureReason = autoApprovalResult?.reasoning || 'Auto-approval evaluation failed'
            
            console.log(`⏳ Requires manual approval - status set to: waiting_for_approval`)
            console.log(`📝 Reason: ${autoApprovalResult?.reasoning || 'Auto-approval evaluation failed'}`)
          }

          try {
            // Race the Firestore update against a timeout
            await Promise.race([
              updateParsedFlyerItem(parsedItemId, updateData),
              new Promise<never>((_, reject) => {
                setTimeout(() => {
                  reject(new Error('Firestore update timed out after 20 seconds'))
                }, 20000)
              })
            ])
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errorType = error instanceof Error ? error.name : 'FirestoreUpdateError';
            
            console.error(`❌ Failed to update parsed flyer item [${errorType}]:`, {
              message: errorMessage,
              parsedItemId,
              updateOperation: 'save-matches-and-auto-approve',
              errorStack: error instanceof Error ? error.stack : undefined,
              timestamp: new Date().toISOString()
            });
            
            // Even if the update fails, we'll continue with the workflow
            // This prevents the workflow from getting stuck due to Firestore errors
          }
          console.log(`✅ Successfully saved matches and status for item ${parsedItemId}`)
          console.log(`🏁 Auto-approval status set to: ${updateData.autoApprovalStatus || 'not set'}`)
          console.log(`📊 Auto-approval fields: ${JSON.stringify({
            status: updateData.autoApprovalStatus,
            reason: updateData.autoApprovalReason || updateData.autoApprovalFailureReason,
            confidence: updateData.autoApprovalConfidence,
          })}`)
          
              // If auto-approved, apply discount
              if (autoApprovalResult?.shouldAutoApprove && autoApprovalResult?.productId) {
            console.log(`⏱️ Auto-discount application step started at ${new Date().toISOString()}`);
            
            try {
              // Create a logger for the discount application
              const logger: Logger = {
                log: (message, data) => console.log(`📝 ${message}`, data || ''),
                info: (message, data) => console.log(`ℹ️ ${message}`, data || ''),
                error: (message, data) => console.error(`❌ ${message}`, data || '')
              };
              
              // Use the imported helper function
              await helperApplyDiscountWithTimeout({
                productId: autoApprovalResult.productId,
                flyerId: parsedItemId,
                storeId: 'auto-approval',
                matchConfidence: autoApprovalResult.confidence || 0,
                logger
              });
              
              console.log(`✅ Auto-discount application completed at ${new Date().toISOString()}`);
            } catch (error: unknown) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              const errorType = error instanceof Error ? error.name : 'DiscountApplicationError';
              
              console.error(`❌ Error in auto-discount application [${errorType}]:`, {
                message: errorMessage,
                parsedItemId,
                productId: autoApprovalResult.productId,
                confidence: autoApprovalResult.confidence || 0,
                errorStack: error instanceof Error ? error.stack : undefined,
                timestamp: new Date().toISOString()
              });
              
                  // Continue workflow even if discount application fails
                }
              }
        } catch (e: unknown) {
          const errorMessage = e instanceof Error ? e.message : 'Unknown error';
          const errorType = e instanceof Error ? e.name : 'SaveMatchesError';
          
          console.error(`❌ Error in save-matches-and-auto-approve step [${errorType}]:`, {
            message: errorMessage,
            parsedItemId,
            matchCount: matchedProducts.length,
            errorStack: e instanceof Error ? e.stack : undefined,
            timestamp: new Date().toISOString()
          });
        }
      })
      
      // Stop the global watchdog timer since we completed successfully
      globalWatchdog.stop();
      
      // Calculate and log the total execution time
      const totalExecutionTime = globalWatchdog.getElapsed();
      console.log(`✅ Total execution time: ${totalExecutionTime}ms`);
      
      return {
        success: true,
        parsedItemId,
        matchedProducts: matchedProducts.length,
        autoApproved: autoApprovalResult?.shouldAutoApprove || false,
        executionTimeMs: totalExecutionTime
      };
    } catch (e: unknown) {
      // Stop the watchdog timer on error
      globalWatchdog.stop();
      
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      const errorType = e instanceof Error ? e.name : 'MatchProductsError';
      const isAbortError = errorMessage.includes('aborted') || (e instanceof Error && e.name === 'AbortError');
      
      console.error(`❌ Error in match-products function [${errorType}]:`, {
        message: errorMessage,
        parsedItemId,
        eventId: event.id,
        isAbortError,
        executionTimeMs: globalWatchdog.getElapsed(),
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
      // Don't retry if it was an abort error (timeout)
      if (isAbortError) {
        console.log('⚠️ Not retrying aborted operation');
        return {
          success: false,
          parsedItemId,
          error: errorMessage,
          executionTimeMs: globalWatchdog.getElapsed()
        };
      } else {
        throw e;
      }
    }
  })

// Export all functions for Inngest registration
export const inngestFunctions = [parseFlyerFunction, matchProductsFunction]