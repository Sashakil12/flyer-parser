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
    }> => {
      try {
        // Download image from Firebase Storage URL
        const response = await fetch(storageUrl)
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
      } catch (error: any) {
        console.error('Gemini parsing error:', error)
        return { success: false, error: error.message }
      }
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
      
      for (const item of results) {
        try {
          // Build the item object, excluding undefined values for Firestore compatibility
          const parsedFlyerItem: any = {
            flyerImageId,
            productName: item.product_name,
            productNamePrefixes: item.product_name_prefixes,
            oldPrice: item.old_price,
            currency: item.currency,
            confidence: 0.85, // Default confidence score
            verified: false,
            // Initialize product matching fields
            matchingStatus: 'pending',
            matchedProducts: [],
          }

          // Only add optional fields if they have values
          if (item.product_name_mk) parsedFlyerItem.productNameMk = item.product_name_mk
          if (item.product_name_prefixes_mk) parsedFlyerItem.productNamePrefixesMk = item.product_name_prefixes_mk
          if (item.discount_price !== undefined) parsedFlyerItem.discountPrice = item.discount_price
          if (item.discount_price_mk) parsedFlyerItem.discountPriceMk = item.discount_price_mk
          if (item.discount_start_date) parsedFlyerItem.discountStartDate = item.discount_start_date
          if (item.discount_end_date) parsedFlyerItem.discountEndDate = item.discount_end_date
          if (item.old_price_mk) parsedFlyerItem.oldPriceMk = item.old_price_mk
          if (item.additional_info) parsedFlyerItem.additionalInfo = item.additional_info
          if (item.additional_info_mk) parsedFlyerItem.additionalInfoMk = item.additional_info_mk

          const itemId = await addParsedFlyerItem(parsedFlyerItem)
          savedItemIds.push(itemId)
        } catch (error: any) {
          console.error('Error saving parsed item:', error)
        }
      }
      
      return savedItemIds
    })

    // Step 4: Trigger product matching for each parsed item
    await step.run('trigger-product-matching', async () => {
      // Use batch processing to avoid overloading the system
      const batchId = `batch-${flyerImageId}-${Date.now()}`
      
      for (let index = 0; index < savedItems.length; index++) {
        try {
          const itemId = savedItems[index]
          
          // Get the item details from the parsing results (no nested step needed)
          const matchingItem = parseResult.data[index]
          if (!matchingItem) throw new Error(`Item ${itemId} not found in results`)
          
          const item = {
            id: itemId,
            productName: matchingItem.product_name,
            productNameMk: matchingItem.product_name_mk,
            productNamePrefixes: matchingItem.product_name_prefixes,
            productNamePrefixesMk: matchingItem.product_name_prefixes_mk,
            additionalInfo: matchingItem.additional_info,
            additionalInfoMk: matchingItem.additional_info_mk
          }
          
          // Trigger product matching event
          await inngest.send({
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
          })
        } catch (error) {
          console.error(`Error triggering product matching for item ${savedItems[index]}:`, error)
          // Continue with other items even if one fails
        }
      }
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

    await step.run('update-flyer-status', async () => {
      await updateFlyerImageStatus(flyerImageId, status)
      
      if (error) {
        console.error(`Status update for ${flyerImageId}:`, error)
      }
      
      return { flyerImageId, status, error }
    })

    return { success: true }
  }
)

/**
 * Match products for a parsed flyer item
 */
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
    const { parsedItemId, productName, productNameMk, additionalInfo, additionalInfoMk } = event.data

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
          const results = await searchProducts(
            productName,
            productNameMk,
            additionalInfo?.join(', '),
            additionalInfoMk?.join(', '),
            10 // Limit to top 10 matches for performance
          )
          console.log(`✅ Found ${results.length} potential matches`)
          return results
        } catch (error: any) {
          console.error('❌ Product search failed:', error.message)
          return [] // Return empty array instead of failing
        }
      })

      if (potentialMatches.length === 0) {
        // No potential matches found
        console.log('⚠️ No potential matches found, marking as completed')
        await step.run('update-no-matches', async () => {
          await updateParsedFlyerItem(parsedItemId, {
            matchingStatus: 'completed',
            matchedProducts: [] // Empty array indicates no matches found
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
          description: p.description || '',
          descriptionMk: p.descriptionMk || '',
          category: p.category || p.categoryId || ''
        }))
        
        try {
          // Add timeout to prevent hanging - increased to 40 seconds for more reliability
          const AI_SCORING_TIMEOUT = 40000; // 40 seconds
          console.log(`⏱️ Setting AI scoring timeout to ${AI_SCORING_TIMEOUT/1000} seconds`)
          
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
              console.error(`⏱️ AI scoring timeout after ${AI_SCORING_TIMEOUT/1000} seconds`)
              reject(new Error(`AI scoring timeout after ${AI_SCORING_TIMEOUT/1000} seconds`))
            }, AI_SCORING_TIMEOUT)
          })
          
          // Pass the timeout value to the scoreProductMatches function
          const scoringPromise = scoreProductMatches(flyerProduct, formattedProducts, AI_SCORING_TIMEOUT - 5000) // 5s buffer
          
          console.log(`🚀 AI scoring promise created at ${new Date().toISOString()}`)
          const result = await Promise.race([scoringPromise, timeoutPromise])
          console.log(`🎯 AI scoring completed at ${new Date().toISOString()} with ${result.length} scored matches`)
          
          // Validate the result structure to ensure it's usable
          const validatedResult = result.filter(match => {
            if (!match || typeof match !== 'object') return false;
            if (typeof match.productId !== 'string' || !match.productId) return false;
            if (typeof match.relevanceScore !== 'number') return false;
            return true;
          });
          
          if (validatedResult.length === 0 && result.length > 0) {
            console.warn('⚠️ All AI scoring results were invalid - using fallback')
            throw new Error('Invalid AI scoring results structure')
          }
          
          return validatedResult
        } catch (error: any) {
          console.error(`❌ AI scoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
          // Fallback: create basic matches with moderate scores and no auto-approval
          const fallbackMatches = formattedProducts.slice(0, 3).map(product => ({
            productId: product.id,
            relevanceScore: 0.5, // Moderate score as fallback
            matchReason: `Fallback match due to AI scoring failure: ${error instanceof Error ? error.message : 'Unknown error'}`,
            can_auto_merge: false, // Never auto-approve fallback matches
            autoApprovalReason: 'Auto-approval skipped due to AI scoring failure'
          }))
          console.log(`🔄 Using fallback scoring for ${fallbackMatches.length} products`)
          return fallbackMatches
        } finally {
          console.log(`⏱️ Score matches step completed at ${new Date().toISOString()}`)
        }
      })

      // Step 3: Filter matches with minimum relevance score
      const MIN_RELEVANCE_SCORE = 0.4 // Only keep matches with at least 40% relevance
      const filteredMatches = scoredMatches.filter((match: { relevanceScore: number }) => match.relevanceScore >= MIN_RELEVANCE_SCORE)

      // Step 4: Format matches for database and check auto-approval
      const matchedProducts = filteredMatches
        // Enhanced filter for invalid productIds - strict validation
        .filter((match: { productId: any }) => {
          if (!isValidProductId(match.productId)) {
            console.log(`⚠️ Filtering out match with invalid productId: ${JSON.stringify(match)}`)
            return false;
          }
          return true;
        })
        .map((match: any) => ({
          productId: match.productId,
          relevanceScore: match.relevanceScore,
          matchReason: match.matchReason || 'AI matched based on product name and details',
          matchedAt: Timestamp.now(),
          productData: {
            name: match.name || '',
            macedonianname: match.nameMk || match.macedonianname || '',
            albenianname: match.nameAl || match.albenianname || '',
            iconUrl: match.iconUrl || '',
            superMarketName: match.superMarketName || '',
            categoryId: match.categoryId || '',
          }
        }))

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

        // Add timeout to prevent this step from hanging - increased to 20 seconds
        const MAX_AUTO_APPROVAL_TIME = 20000; // 20 seconds timeout
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
          } catch (error) {
            console.error(`❌ Error in processAutoApproval: ${error instanceof Error ? error.message : 'Unknown error'}`)
            throw error;
          }
        }
        
        try {
          // Execute the auto-approval process with timeout handling
          const result = await Promise.race([
            processAutoApproval(),
            new Promise<AutoApprovalResult>((resolve, reject) => {
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
        } catch (error) {
          // Clear the timeout to prevent memory leaks
          clearTimeout(timeoutId);
          
          console.error(`❌ Auto-approval error: ${error instanceof Error ? error.message : 'Unknown error'}`)
          
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
        
        // Add timeout to prevent this step from hanging
        const MAX_SAVE_TIME = 25000; // 25 seconds timeout
        let saveTimeoutId: NodeJS.Timeout | null = null;
        
        const saveTimeoutPromise = new Promise<never>((_, reject) => {
          saveTimeoutId = setTimeout(() => {
            console.error(`⏱️ Save matches timed out after ${MAX_SAVE_TIME/1000} seconds`)
            reject(new Error(`Save matches timed out after ${MAX_SAVE_TIME/1000} seconds`))
          }, MAX_SAVE_TIME);
        });
        
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
            updateData.autoApprovedAt = new Date()
            updateData.autoApprovalStatus = 'success'
            
            console.log(`🚀 Auto-approved and applied to product: ${autoApprovalResult.productId}`)
            console.log(`📝 Status set to: applied_to_product`)
          } else {
            // Auto-approval failed - set status to waiting for manual approval
            updateData.matchingStatus = 'waiting_for_approval'
            updateData.autoApprovalStatus = 'failed'
            updateData.autoApprovalFailedAt = new Date()
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
          } catch (error) {
            console.error(`❌ Failed to update parsed flyer item: ${error instanceof Error ? error.message : 'Unknown error'}`)
            // Even if the update fails, we'll continue with the workflow
            // This prevents the workflow from getting stuck due to Firestore errors
          }
          console.log(`✅ Successfully saved matches and status for item ${parsedItemId}`)
          console.log(`🏁 Auto-approval status set to: ${updateData.autoApprovalStatus || 'not set'}`)
          console.log(`📊 Auto-approval fields: ${JSON.stringify({
            status: updateData.autoApprovalStatus,
            reason: updateData.autoApprovalReason || updateData.autoApprovalFailureReason,
            confidence: updateData.autoApprovalConfidence,
            timestamp: updateData.autoApprovedAt || updateData.autoApprovalFailedAt
          })}`)
          console.log(`⏱️ Workflow step completed at ${new Date().toISOString()}`)
          // Fix the lint error by ensuring event.ts is a valid timestamp
          const startTime = typeof event.ts === 'number' ? event.ts : Date.now()
          console.log(`🔄 Total workflow duration: ${(Date.now() - startTime) / 1000} seconds`)

          // Step 7: Apply discount automatically if auto-approved
          if (autoApprovalResult?.shouldAutoApprove && autoApprovalResult?.productId) {
            await step.run('auto-apply-discount', async () => {
              console.log(`⏱️ Auto-discount application step started at ${new Date().toISOString()}`)
              // Add timeout to prevent this step from hanging
              const MAX_DISCOUNT_APPLICATION_TIME = 20000; // 20 seconds timeout
              
              try {
                // Create a promise that will be rejected after the timeout
                const timeoutPromise = new Promise((_, reject) => {
                  setTimeout(() => {
                    console.error(`⏱️ Auto-discount application timed out after ${MAX_DISCOUNT_APPLICATION_TIME/1000} seconds`)
                    reject(new Error(`Auto-discount application timed out after ${MAX_DISCOUNT_APPLICATION_TIME/1000} seconds`))
                  }, MAX_DISCOUNT_APPLICATION_TIME);
                });
                
                // Create the actual discount application promise
                const discountPromise = (async () => {
                  const productId = autoApprovalResult.productId as string;
                  
                  try {
                    // Get the parsed flyer item to extract price information
                    const parsedItemRef = adminDb.collection('parsed-flyer-items').doc(parsedItemId);
                    const parsedItemDoc = await parsedItemRef.get();
                    const parsedItem = parsedItemDoc.data();
                    
                    // Get the product to update
                    const productRef = adminDb.collection('products').doc(productId);
                    const productDoc = await productRef.get();
                    
                    if (!productDoc.exists) {
                      console.error(`❌ Product ${productId} not found for auto-discount application`);
                      return { success: false, error: 'Product not found' };
                    }
                    
                    if (!parsedItem) {
                      console.error(`❌ Parsed item ${parsedItemId} data not found`);
                      return { success: false, error: 'Parsed item data not found' };
                    }
                    
                    const product = productDoc.data();
                    const currentPrice = product?.price || 0;
                    
                    // Extract price information from parsed item
                    const regularPrice = parsedItem.regularPrice;
                    const discountPrice = parsedItem.discountPrice;
                    
                    if (!regularPrice || !discountPrice) {
                      console.log(`⚠️ Missing price information for auto-discount application`);
                      return { success: false, error: 'Missing price information' };
                    }
                    
                    // Calculate discount percentage
                    const discountPercentage = applyDiscountPercentage(regularPrice, discountPrice);
                    const discountedPrice = discountPrice;
                    
                    // Update product with discount
                    try {
                      await productRef.update({
                        discountPercentage,
                        discountAppliedAt: FieldValue.serverTimestamp(),
                        discountAppliedBy: 'auto-approval',
                        discountSource: `flyer-item-${parsedItemId}`,
                        discountActive: true
                      });
                      console.log(`✅ Successfully updated product ${productId} with discount`);
                    } catch (error) {
                      console.error(`❌ Failed to update product with discount: ${error instanceof Error ? error.message : 'Unknown error'}`);
                      return { success: false, error: 'Failed to update product' };
                    }
                    
                    // Update the parsed flyer item to mark the discount as applied
                    try {
                      await parsedItemRef.update({
                        discountApplied: true,
                        discountAppliedAt: new Date(),
                        discountPercentage,
                        autoDiscountApplied: true
                      });
                      console.log(`✅ Successfully marked parsed item as discount applied`);
                    } catch (error) {
                      console.error(`❌ Failed to update parsed item: ${error instanceof Error ? error.message : 'Unknown error'}`);
                      // Even if this fails, we've already applied the discount to the product
                    }
                    
                    console.log(`🎁 Auto-applied discount of ${discountPercentage}% to product ${productId}`);
                    return { success: true, productId, discountPercentage, discountedPrice };
                  } catch (error) {
                    console.error(`❌ Error in discount application: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
                  }
                })();
                
                // Race the discount application against the timeout
                const result = await Promise.race([discountPromise, timeoutPromise]);
                console.log(`✅ Auto-discount application completed at ${new Date().toISOString()}`);
                return result;
              } catch (error) {
                console.error(`❌ Auto-discount application failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                // Instead, log it and continue with the workflow
                console.log('⚠️ Continuing workflow despite discount application error to prevent hanging');
                return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
              } finally {
                console.log(`⏱️ Auto-discount application step completed at ${new Date().toISOString()}`);
              }
            });
          }
        } finally {
          // Clear the timeout to prevent memory leaks
          if (saveTimeoutId) clearTimeout(saveTimeoutId);
          console.log(`⏱️ Save matches step completed at ${new Date().toISOString()}`)
        }
      })

      return {
        success: true,
        matchCount: matchedProducts.length,
        message: `Successfully matched ${matchedProducts.length} products`
      }
    } catch (error: any) {
      console.error('Product matching error:', error)
      
      // Update status to failed
      await updateParsedFlyerItem(parsedItemId, {
        matchingStatus: 'failed',
        matchingError: error.message || 'Unknown error during product matching'
      })
      
      return {
        success: false,
        error: error.message || 'Unknown error during product matching'
      }
    }
  }
)

// Export all functions
export const inngestFunctions = [
  parseFlyerFunction,
  matchProductsFunction,
  statusUpdateFunction,
]
