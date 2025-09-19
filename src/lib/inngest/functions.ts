import { inngest } from '../inngest'
import {
  updateFlyerImageStatus,
  updateParsedFlyerItem,
  addParsedFlyerItem,
  searchProducts,
  getActiveAutoApprovalRulesAdmin,
  getParsedFlyerItemsByIds,
} from '@/lib/firestore-admin'
import { parseImageWithGemini } from '@/lib/gemini'
import { scoreProductMatches, evaluateBestRuleMatch } from '@/lib/gemini-product-match'
import { extractCleanProductImages } from '@/lib/nano-banana-advanced'
import { optimizeForFlutter, validateImageQuality } from '@/lib/image-optimization'
import { uploadOptimizedImages } from '@/lib/storage-images'
import { getImageDataUrl } from '@/lib/storage-admin'
import { applyDiscountPercentage } from '@/lib/utils'
import { Timestamp } from 'firebase-admin/firestore'
import { GeminiParseResult, ParsedFlyerItem, Product } from '@/types'
import { adminDb } from '../firebase/admin'
import { applyDiscountWithTimeout as helperApplyDiscountWithTimeout, Logger } from './helpers'

// Utility function to remove undefined values from objects (Firestore doesn't allow undefined)
function removeUndefinedValues(obj: any): any {
  if (obj === null || obj === undefined) {
    return null
  }
  
  if (Array.isArray(obj)) {
    return obj.map(removeUndefinedValues).filter(item => item !== undefined)
  }
  
  if (typeof obj === 'object') {
    const cleaned: any = {}
    Object.keys(obj).forEach(key => {
      const value = removeUndefinedValues(obj[key])
      if (value !== undefined) {
        cleaned[key] = value
      }
    })
    return cleaned
  }
  
  return obj
}

// Constants for timeouts and circuit breaker settings
const AI_SCORING_TIMEOUT = 90000; // 90 seconds timeout for AI scoring

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
      await updateFlyerImageStatus(flyerImageId, 'processing', undefined, storageUrl)
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
          if (retryCount > 0) {
            console.log(`🔄 Retry attempt ${retryCount}/${MAX_RETRIES} for parsing image ${flyerImageId}`);
          }
          
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
            
            const buffer = await response.arrayBuffer()
            const base64 = Buffer.from(buffer).toString('base64')
            const contentType = response.headers.get('content-type') || 'image/jpeg'
            const dataUrl = `data:${contentType};base64,${base64}`
            
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
          
          console.error(`❌ Gemini parsing error on attempt ${retryCount + 1}/${MAX_RETRIES + 1} [${errorCode}]:`, {
            message: errorMessage,
            flyerImageId: event.data.flyerImageId,
            retryCount,
            errorStack: error instanceof Error ? error.stack : undefined,
            timestamp: new Date().toISOString()
          });
          
          const isNetworkError = errorMessage.includes('network') || 
                               errorMessage.includes('timeout') || 
                               errorMessage.includes('timed out') ||
                               errorMessage.includes('ECONNRESET');
          
          if (retryCount < MAX_RETRIES && isNetworkError) {
            retryCount++;
            const backoffMs = Math.pow(2, retryCount) * 1000;
            console.log(`⏱️ Backing off for ${backoffMs}ms before retry ${retryCount}`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
            continue;
          }
          
          return { 
            success: false, 
            error: errorMessage,
            errorCode,
            timestamp: new Date().toISOString()
          };
        }
      }
      
      const errorMessage = lastError instanceof Error ? lastError.message : 'Unknown error after retries';
      return {
        success: false,
        error: errorMessage,
        errorCode: 'MAX_RETRIES_EXCEEDED',
        timestamp: new Date().toISOString()
      };
    })

    if (!parseResult.success) {
      await step.run('update-status-failed', async () => {
        await updateFlyerImageStatus(flyerImageId, 'failed', parseResult.error, storageUrl)
        return { status: 'failed', reason: parseResult.error }
      })
      
      throw new Error(`Parsing failed: ${parseResult.error}`)
    }

    const savedItems = await step.run('save-parsed-data', async () => {
      const results = parseResult.data
      const savedItemIds: string[] = []
      
      console.log(`📝 Saving ${results.length} parsed items to Firestore...`);

      for (const item of results) {
        try {
          const parsedFlyerItem: Omit<ParsedFlyerItem, 'id' | 'parsedAt' | 'createdAt'> = {
            flyerImageId,
            productName: item.product_name,
            productNamePrefixes: item.product_name_prefixes,
            oldPrice: item.old_price,
            currency: item.currency,
            confidence: 0.85,
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

          const itemId = await addParsedFlyerItem(parsedFlyerItem)
          savedItemIds.push(itemId)
        } catch (error: any) {
          console.error(`❌ Error saving parsed item:`, {
            message: error.message,
            flyerImageId,
            itemData: JSON.stringify(item),
          });
        }
      }
      
      return savedItemIds
    })

    await step.run('trigger-product-matching', async () => {
      for (const itemId of savedItems) {
        const matchingItem = parseResult.data.find((_, index) => savedItems[index] === itemId);
        if (matchingItem) {
          await inngest.send({
            name: 'flyer/product-match',
            data: {
              parsedItemId: itemId,
              flyerImageId,
              productName: matchingItem.product_name || '',
              productNameMk: matchingItem.product_name_mk || '',
              productNamePrefixes: matchingItem.product_name_prefixes || [],
              productNamePrefixesMk: matchingItem.product_name_prefixes_mk || [],
              additionalInfo: matchingItem.additional_info || [],
              additionalInfoMk: matchingItem.additional_info_mk || [],
              discountText: matchingItem.discount_text,
            }
          });
        }
      }
    })

    // Step 5: Update status to completed
    await step.run('update-status-completed', async () => {
      await updateFlyerImageStatus(flyerImageId, 'completed', undefined, storageUrl)
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

export const statusUpdateFunction = inngest.createFunction(
  { id: 'status-update', name: 'Handle Status Updates' },
  { event: 'flyer/parse-status-update' },
  async ({ event, step }) => {
    const { flyerImageId, status, error, storageUrl } = event.data

    try {
      await step.run('update-flyer-status', async () => {
        try {
          await updateFlyerImageStatus(flyerImageId, status, undefined, storageUrl)
          
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
          throw updateError;
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
      
      throw e;
    }
  }
)

export const matchProductsFunction = inngest.createFunction(
  { 
    id: 'match-products', 
    name: 'Match Products to Database',
    timeouts: {
      finish: '3m'
    },
    retries: 2
  },
  { event: 'flyer/product-match' },
  async ({ event, step }) => {
    const { parsedItemId, productName, productNameMk, additionalInfo, additionalInfoMk } = event.data;

    try {
      await step.run('update-status-to-processing', async () => {
        await updateParsedFlyerItem(parsedItemId, {
          matchingStatus: 'processing'
        })
      })

      const potentialMatches = await step.run('search-products', async () => {
        return await searchProducts(
          productName,
          productNameMk,
          additionalInfo,
          additionalInfoMk,
          10
        );
      })

      if (potentialMatches.length === 0) {
        await step.run('update-no-matches', async () => {
          await updateParsedFlyerItem(parsedItemId, {
            matchingStatus: 'completed',
            matchedProducts: [],
          })
        })
        return { success: true, message: 'No potential matches found' }
      }

      const scoredMatches = await step.run('score-matches', async () => {
        const flyerProduct = {
          productName,
          productNameMk,
          additionalInfo,
          additionalInfoMk
        }
        
        const uniqueProducts = potentialMatches.filter((product: any, index: number, array: any[]) => 
          isValidProductId(product.id) && index === array.findIndex((p: any) => p.id === product.id)
        );
        
        const formattedProducts = uniqueProducts.map((p: any) => ({
          id: p.id,
          name: p.name || '',
          nameMk: p.nameMk || p.macedonianname || '',
          nameAl: p.albenianname || '',
          description: p.description || '',
          descriptionMk: p.descriptionMk || '',
          category: p.category || p.categoryId || ''
        }));
        
        return await scoreProductMatches(flyerProduct, formattedProducts, AI_SCORING_TIMEOUT);
      })

      const MIN_RELEVANCE_SCORE = 0.4;
      const filteredMatches = scoredMatches ? scoredMatches.filter(match => match.relevanceScore >= MIN_RELEVANCE_SCORE) : [];

      const productMap = new Map(potentialMatches.map((p: any) => [p.id.trim(), p]));

      const matchedProducts = filteredMatches
        .filter(match => isValidProductId(match.productId))
        .map(match => {
          const originalProduct = productMap.get(match.productId.trim());
          return {
            productId: match.productId,
            relevanceScore: match.relevanceScore,
            matchReason: match.matchReason || 'AI matched based on product name and details',
            can_auto_merge: match.can_auto_merge,
            autoApprovalReason: match.autoApprovalReason,
            matchedAt: Timestamp.now(),
            productData: originalProduct || null,
          };
        });

      const autoApprovalResult: AutoApprovalResult | null = await step.run('check-auto-approval', async () => {
        const autoApprovalRules = await getActiveAutoApprovalRulesAdmin();

        if (autoApprovalRules.length === 0) {
          return {
            shouldAutoApprove: false,
            reasoning: 'No active auto-approval rules found.',
            confidence: 0,
            productId: null,
          };
        }

        if (filteredMatches.length === 0) {
          return {
            shouldAutoApprove: false,
            reasoning: 'No suitable product matches found to evaluate against rules.',
            confidence: 0,
            productId: null,
          };
        }

        const bestMatch = filteredMatches[0];
        if (!bestMatch || !isValidProductId(bestMatch.productId)) {
          return {
            shouldAutoApprove: false,
            reasoning: 'Best match has an invalid product ID.',
            confidence: 0,
            productId: null,
          };
        }

        const parsedItems = await getParsedFlyerItemsByIds([parsedItemId]);
        if (parsedItems.length === 0) {
          throw new Error(`Failed to retrieve parsed item ${parsedItemId} for rule evaluation.`);
        }
        const parsedItem = parsedItems[0];

        const productData = potentialMatches.find(p => p.id === bestMatch.productId) as Product | undefined;
        if (!productData) {
          throw new Error(`Failed to retrieve product data for ${bestMatch.productId} for rule evaluation.`);
        }

        const aiDecision = await evaluateBestRuleMatch(parsedItem, productData, autoApprovalRules);

        return {
          shouldAutoApprove: aiDecision.shouldAutoApprove,
          reasoning: aiDecision.reasoning,
          confidence: bestMatch.relevanceScore,
          productId: aiDecision.shouldAutoApprove ? bestMatch.productId : null,
        };
      });

      await step.run('save-matches-and-update-status', async () => {
        const updateData: any = {
          matchedProducts: matchedProducts as any,
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

      if (autoApprovalResult?.shouldAutoApprove && autoApprovalResult.productId) {
        const autoApprovedProductId = autoApprovalResult.productId;
        await step.run('apply-auto-discount', async () => {
          const logger: Logger = {
            log: (message, data) => console.log(`📝 ${message}`, data || ''),
            info: (message, data) => console.log(`ℹ️ ${message}`, data || ''),
            error: (message, data) => console.error(`❌ ${message}`, data || '')
          };

          const discountResult = await helperApplyDiscountWithTimeout({
            productId: autoApprovedProductId,
            flyerId: parsedItemId,
            storeId: 'auto-approval',
            matchConfidence: autoApprovalResult.confidence || 0,
            logger
          });

          // After applying the discount, update the parsed item to reflect this
          if (discountResult.success) {
            await updateParsedFlyerItem(parsedItemId, {
              discountApplied: true,
              autoDiscountApplied: true,
              selectedProductId: autoApprovedProductId,
              discountAppliedAt: Timestamp.now(),
              discountPercentage: discountResult.discountPercentage,
            });
          }
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
      console.error(`❌ Error in match-products function:`, {
        message: errorMessage,
        parsedItemId,
        eventId: event.id,
      });
      
      try {
        await updateParsedFlyerItem(event.data.parsedItemId, {
          matchingStatus: 'failed',
          matchingError: `Matching process failed: ${errorMessage.substring(0, 200)}`
        });
      } catch (updateError) {
        console.error('Failed to update status after error', updateError);
      }
      
      throw e;
    }
  }
)

export const extractImagesFunction = inngest.createFunction(
  { 
    id: 'extract-item-images', 
    name: 'Extract Clean Product Images from Flyer',
    retries: 3
  },
  { event: 'flyer/extract-images' },
  async ({ event, step }) => {
    const { flyerImageId, storageUrl, parsedItems } = event.data
    
    console.log('🍌 Starting image extraction with Nano Banana', { 
      flyerImageId,
      itemCount: parsedItems.length 
    })
    
    await step.run('update-status-processing', async () => {
      const updates = parsedItems.map((item: any) => 
        updateParsedFlyerItem(item.id, { imageExtractionStatus: 'processing' })
      )
      await Promise.all(updates)
      return { updated: parsedItems.length }
    })
    
    const flyerImageData = await step.run('download-flyer-image', async () => {
      const response = await fetch(storageUrl)
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`)
      }
      
      const buffer = await response.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      const contentType = response.headers.get('content-type') || 'image/jpeg'
      
      return `data:${contentType};base64,${base64}`
    })
    
    const extractedImages = await step.run('extract-with-ai', async () => {
      const transformedItems = parsedItems.map((item: any) => ({
        id: item.id,
        productName: item.productName,
        productNameMk: item.productNameMk,
        discountPrice: item.discountPrice,
        oldPrice: item.originalPrice || item.oldPrice || 0,
        additionalInfo: item.additionalInfo || []
      }))
      
      return await extractCleanProductImages(flyerImageData, transformedItems, {
        removeText: true,
        removePromotionalElements: true,
        backgroundStyle: 'white',
        productCentering: true,
        shadowGeneration: true,
        qualityEnhancement: true
      })
    })
    
    const processResults = await step.run('process-images', async () => {
      const results = []
      
      for (const cleanImage of extractedImages) {
        try {
          const itemId = cleanImage.itemId || 'unknown'
          let imageData = cleanImage.imageUrl || cleanImage.extractedImageData
          
          if (!imageData || typeof imageData !== 'string' || imageData.trim() === '') {
            results.push({ 
              itemId, 
              success: false, 
              error: 'No valid image data available' 
            })
            continue
          }
          
          let imageDataToOptimize = imageData.trim()
          
          if (imageDataToOptimize.startsWith('http')) {
            const response = await fetch(imageDataToOptimize)
            if (!response.ok) {
              throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`)
            }
            const buffer = await response.arrayBuffer()
            const base64 = Buffer.from(buffer).toString('base64')
            const mimeType = response.headers.get('content-type') || 'image/jpeg'
            imageDataToOptimize = `data:${mimeType};base64,${base64}`
          }
          
          const optimized = await optimizeForFlutter(imageDataToOptimize, {
            maxWidth: 1200,
            maxHeight: 1200,
            quality: 85,
            format: 'webp',
            generateThumbnail: true,
            generateMultipleResolutions: true
          })
          
          const urls = await uploadOptimizedImages(flyerImageId, itemId, optimized)
          
          results.push({ itemId, success: true, urls })
          
        } catch (error: any) {
          const itemId = cleanImage?.itemId || 'unknown'
          results.push({ 
            itemId, 
            success: false, 
            error: `Processing failed: ${error.message}` 
          })
        }
      }
      
      return results
    })
    
    await step.run('update-database', async () => {
      const updates = processResults.map(async (result) => {
        if (result.success && 'urls' in result) {
          const urlData = result.urls as any
          
          const cleanUrls: any = {}
          if (urlData.original !== undefined) cleanUrls.original = urlData.original
          if (urlData.optimized !== undefined) cleanUrls.optimized = urlData.optimized
          if (urlData.thumbnail !== undefined) cleanUrls.thumbnail = urlData.thumbnail
          if (urlData.transparent !== undefined) cleanUrls.transparent = urlData.transparent
          
          const cleanResolutions: any = {}
          if (urlData.resolutions && typeof urlData.resolutions === 'object') {
            Object.keys(urlData.resolutions).forEach(key => {
              if (urlData.resolutions[key] !== undefined) {
                cleanResolutions[key] = urlData.resolutions[key]
              }
            })
          }

          const extractedImages = {
            clean: cleanUrls,
            resolutions: cleanResolutions,
            extractionMetadata: {
              confidence: 0.95,
              backgroundRemoved: true,
              textRemoved: true,
              qualityScore: 0.9,
              processingMethod: 'nano-banana' as const,
              manualReviewRequired: false
            }
          }
          
          const cleanData = removeUndefinedValues({
            extractedImages,
            imageExtractionStatus: 'completed',
            imageExtractedAt: Timestamp.now() as any
          })
          
          await updateParsedFlyerItem(result.itemId, cleanData)
        } else {
          await updateParsedFlyerItem(result.itemId, {
            imageExtractionStatus: 'failed',
            imageExtractionError: 'error' in result ? result.error : 'Unknown error'
          })
        }
      })
      
      await Promise.all(updates)
    })
    
    const successCount = processResults.filter(r => r.success).length
    
    return {
      success: true,
      flyerImageId,
      totalItems: parsedItems.length,
      extractedImages: successCount,
      failedExtractions: processResults.length - successCount
    }
  }
)

export const inngestFunctions = [parseFlyerFunction, statusUpdateFunction, matchProductsFunction, extractImagesFunction]