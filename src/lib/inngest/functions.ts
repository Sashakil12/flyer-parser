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
  { id: 'match-products' },
  { event: 'flyer/product-match' },
  async ({ event, step }) => {
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
        
        // Step 2a: Remove duplicates based on product ID
        const uniqueProducts = potentialMatches.filter((product: any, index: number, array: any[]) => {
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
          // Add timeout to prevent hanging
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('AI scoring timeout after 30 seconds')), 30000)
          })
          
          const scoringPromise = scoreProductMatches(flyerProduct, formattedProducts)
          
          const result = await Promise.race([scoringPromise, timeoutPromise])
          console.log(`🎯 AI scoring completed with ${result.length} scored matches`)
          return result
        } catch (error: any) {
          console.error('❌ AI scoring failed:', error.message)
          // Fallback: create basic matches with moderate scores and no auto-approval
          const fallbackMatches = formattedProducts.slice(0, 3).map(product => ({
            productId: product.id,
            relevanceScore: 0.5, // Moderate score as fallback
            matchReason: 'Fallback match due to AI scoring failure',
            can_auto_merge: false, // Never auto-approve fallback matches
            autoApprovalReason: 'Auto-approval skipped due to AI scoring failure'
          }))
          console.log(`🔄 Using fallback scoring for ${fallbackMatches.length} products`)
          return fallbackMatches
        }
      })

      // Step 3: Filter matches with minimum relevance score
      const MIN_RELEVANCE_SCORE = 0.4 // Only keep matches with at least 40% relevance
      const filteredMatches = scoredMatches.filter((match: { relevanceScore: number }) => match.relevanceScore >= MIN_RELEVANCE_SCORE)

      // Step 4: Format matches for database and check auto-approval
      const matchedProducts = filteredMatches
        // Filter out any matches with invalid productIds
        .filter((match: { productId: string | undefined }) => {
          // Check for undefined, null, or string versions of those values
          if (match.productId === undefined || 
              match.productId === null || 
              match.productId === 'undefined' || 
              match.productId === 'null' ||
              !match.productId) { // Also catches empty strings
            console.log(`⚠️ Filtering out match with invalid productId: ${JSON.stringify(match)}`)
            return false;
          }
          return true;
        })
        .map((match: { productId: string; relevanceScore: number; matchReason: string; can_auto_merge: boolean; autoApprovalReason: string }) => {
          const productData = potentialMatches.find((p: any) => p.id === match.productId)
          
          // Create a server-side object that will be properly converted to Firestore Timestamp
          // We don't cast to MatchedProduct here since that uses the client-side Timestamp
          const matchedProduct: any = {
            productId: match.productId || '', // Ensure productId is never undefined
            relevanceScore: match.relevanceScore || 0,
            matchReason: match.matchReason || '',
            can_auto_merge: match.can_auto_merge === true,
            autoApprovalReason: match.autoApprovalReason || '',
            matchedAt: new Date() // Firestore Admin SDK will convert this to Timestamp
          }
          
          // Only add productData if it exists and has valid data
          if (productData && productData.name) {
            matchedProduct.productData = {
              name: productData.name || '',
              macedonianname: productData.nameMk || productData.macedonianname || '',
              albenianname: productData.albenianname || '',
              iconUrl: productData.iconUrl || '',
              superMarketName: productData.superMarketName || '',
              categoryId: productData.categoryId || ''
            }
          }
          
          return matchedProduct
        })

      // Define type for auto-approval result
      type AutoApprovalResult = {
        shouldAutoApprove: boolean;
        reasoning: string;
        confidence: number;
        productId: string | null;
      }

      // Step 5: Check for auto-approval from Gemini results
      const autoApprovalResult: AutoApprovalResult | null = await step.run('check-auto-approval', async () => {
        console.log(`📊 Checking auto-approval for ${matchedProducts.length} potential matches`)
        
        if (matchedProducts.length === 0) {
          console.log('⚠️ No matches to check for auto-approval')
          return null
        }

        // Log all matches with their auto-approval status
        matchedProducts.forEach((match: any, index: number) => {
          console.log(`Match #${index + 1}: productId=${match.productId}, relevanceScore=${match.relevanceScore}, can_auto_merge=${match.can_auto_merge}, reason=${match.autoApprovalReason || 'N/A'}`)
        })

        // Find the first match that can be auto-merged
        const autoApprovableMatch = matchedProducts.find((match: any) => match.can_auto_merge === true)
        
        if (autoApprovableMatch) {
          console.log(`🚀 Auto-approval approved for product: ${autoApprovableMatch.productId} with confidence ${autoApprovableMatch.relevanceScore}`)
          console.log(`📝 Reason: ${autoApprovableMatch.autoApprovalReason}`)
          
          return {
            shouldAutoApprove: true,
            productId: autoApprovableMatch.productId,
            reasoning: autoApprovableMatch.autoApprovalReason,
            confidence: autoApprovableMatch.relevanceScore
          }
        } else {
          console.log('⚠️ No matches meet auto-approval criteria - requires manual review')
          return {
            shouldAutoApprove: false,
            reasoning: 'No matches meet the configured auto-approval criteria',
            confidence: 0,
            productId: null // Add null productId for type consistency
          }
        }
      })

      // Step 6: Save matches and handle auto-approval
      await step.run('save-matches-and-auto-approve', async () => {
        console.log(`💾 Saving ${matchedProducts.length} matches to database`)
        try {
          // Final validation to ensure no invalid values in matchedProducts
          const validatedMatches = matchedProducts.filter(match => {
            if (!match || typeof match !== 'object') {
              console.log(`⚠️ Skipping invalid match: ${JSON.stringify(match)}`)
              return false;
            }
            
            // Comprehensive check for invalid productId values
            if (match.productId === undefined || 
                match.productId === null || 
                match.productId === 'undefined' || 
                match.productId === 'null' || 
                !match.productId || // Catches empty strings
                typeof match.productId !== 'string') {
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
            updateData.autoApprovalConfidence = autoApprovalResult.confidence
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

          await updateParsedFlyerItem(parsedItemId, updateData)
          console.log(`✅ Successfully saved matches and status for item ${parsedItemId}`)

          // Step 7: Apply discount automatically if auto-approved
          if (autoApprovalResult?.shouldAutoApprove && autoApprovalResult?.productId) {
            await step.run('auto-apply-discount', async () => {
              try {
                const productId = autoApprovalResult.productId as string;
                
                // Get the parsed flyer item to extract price information
                const parsedItemRef = adminDb.collection('parsed-flyer-items').doc(parsedItemId);
                const parsedItemDoc = await parsedItemRef.get();
                const parsedItem = parsedItemDoc.data();
                
                // Get the product to update
                const productRef = adminDb.collection('products').doc(productId);
                const productDoc = await productRef.get();
                
                if (!productDoc.exists) {
                  console.error(`❌ Product ${productId} not found for auto-discount application`);
                  return;
                }
                
                const product = productDoc.data();
                const currentPrice = product?.price || 0;
                
                // Calculate discount percentage based on parsed item prices
                let discountPercentage = 0;
                if (parsedItem?.oldPrice && parsedItem?.discountPrice) {
                  // Calculate from parsed flyer prices
                  const oldPrice = parseFloat(parsedItem.oldPrice);
                  const discountPrice = parseFloat(parsedItem.discountPrice);
                  
                  if (oldPrice > 0 && discountPrice > 0 && discountPrice < oldPrice) {
                    discountPercentage = Math.round(((oldPrice - discountPrice) / oldPrice) * 100);
                  }
                }
                
                // Use a default discount percentage if we couldn't calculate one
                if (discountPercentage <= 0 || discountPercentage >= 100) {
                  console.log(`⚠️ Could not calculate valid discount percentage, using default`);
                  discountPercentage = 10; // Default 10% discount
                }
                
                // Calculate the discounted price
                const discountedPrice = applyDiscountPercentage(currentPrice, discountPercentage);
                
                console.log(`💰 Auto-applying ${discountPercentage}% discount to product ${productId}`);
                console.log(`💰 Original price: ${currentPrice}, Discounted price: ${discountedPrice}`);
                
                // Update the product with the discount
                await productRef.update({
                  discountedPrice,
                  discountPercentage,
                  discountSource: {
                    type: 'flyer',
                    parsedItemId,
                    appliedAt: new Date(),
                    appliedBy: 'auto-approval',
                    originalPrice: currentPrice
                  },
                  hasActiveDiscount: true
                });
                
                // Update the parsed flyer item to mark the discount as applied
                await parsedItemRef.update({
                  discountApplied: true,
                  discountAppliedAt: new Date(),
                  discountPercentage,
                  autoDiscountApplied: true
                });
                
                console.log(`✅ Successfully applied auto-discount to product ${productId}`);
                return { success: true, productId, discountPercentage, discountedPrice };
              } catch (error: any) {
                console.error('❌ Error applying auto-discount:', error);
                return { success: false, error: error.message };
              }
            });
          }
        } catch (error: any) {
          console.error('❌ Error saving matches:', error)
          throw error
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
