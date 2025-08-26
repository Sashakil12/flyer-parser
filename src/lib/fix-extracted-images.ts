/**
 * Utility to fix extracted images data structure for items that were processed
 * with the old buggy code structure
 */

import { adminDb } from './firebase/admin'
import { ParsedFlyerItem } from '@/types'

export async function fixExtractedImagesStructure(itemId: string) {
  try {
    const docRef = adminDb.collection('parsed-flyer-items').doc(itemId)
    const doc = await docRef.get()
    
    if (!doc.exists) {
      console.log(`❌ Item ${itemId} not found`)
      return { success: false, error: 'Item not found' }
    }
    
    const data = doc.data() as ParsedFlyerItem
    
    // Check if item has completed status but no proper extractedImages structure
    if (data.imageExtractionStatus === 'completed' && data.extractedImages) {
      console.log('🔍 Checking item structure:', {
        itemId,
        productName: data.productName,
        extractedImagesKeys: Object.keys(data.extractedImages),
        hasClean: 'clean' in data.extractedImages,
        extractedImages: data.extractedImages
      })
      
      // Check if the structure needs fixing
      const needsFix = !('clean' in data.extractedImages) || 
                       !data.extractedImages.clean ||
                       !data.extractedImages.clean.original ||
                       !data.extractedImages.clean.optimized
      
      if (needsFix) {
        console.log('🔧 Attempting to fix structure for item:', itemId)
        
        // Check if it has the old structure with direct URLs
        const oldStructure = data.extractedImages as any
        
        if (oldStructure.urls && oldStructure.urls.original) {
          // Transform old structure to new structure
          const cleanUrls: any = {
            original: oldStructure.urls.original,
            optimized: oldStructure.urls.optimized,
            thumbnail: oldStructure.urls.thumbnail
          }
          
          // Only add transparent if it's not undefined
          if (oldStructure.urls.transparent) {
            cleanUrls.transparent = oldStructure.urls.transparent
          }
          
          const fixedExtractedImages = {
            clean: cleanUrls,
            resolutions: oldStructure.urls.resolutions || {
              '1x': oldStructure.urls.original,
              '2x': oldStructure.urls.original,
              '3x': oldStructure.urls.original,
              'custom': oldStructure.urls.original
            },
            extractionMetadata: {
              confidence: 0.85,
              backgroundRemoved: true,
              textRemoved: true,
              qualityScore: 0.8,
              processingMethod: 'imagen4' as const,
              manualReviewRequired: false
            }
          }
          
          // Update the document
          await docRef.update({
            extractedImages: fixedExtractedImages
          })
          
          console.log('✅ Fixed structure for item:', itemId)
          return { success: true, fixed: true }
        } else {
          console.log('❌ Cannot fix - unknown structure for item:', itemId)
          return { success: false, error: 'Unknown structure' }
        }
      } else {
        console.log('✅ Item already has correct structure:', itemId)
        return { success: true, fixed: false }
      }
    } else {
      console.log('ℹ️ Item does not need fixing:', {
        itemId,
        status: data.imageExtractionStatus,
        hasExtractedImages: !!data.extractedImages
      })
      return { success: true, fixed: false }
    }
  } catch (error) {
    console.error('❌ Error fixing item structure:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export async function fixAllCompletedItems() {
  try {
    console.log('🔧 Starting bulk fix for all completed items...')
    
    // Query all items with completed status
    const snapshot = await adminDb
      .collection('parsed-flyer-items')
      .where('imageExtractionStatus', '==', 'completed')
      .get()
    
    console.log(`Found ${snapshot.size} completed items to check`)
    
    const results = {
      total: snapshot.size,
      fixed: 0,
      alreadyCorrect: 0,
      errors: 0
    }
    
    for (const doc of snapshot.docs) {
      const result = await fixExtractedImagesStructure(doc.id)
      
      if (result.success) {
        if (result.fixed) {
          results.fixed++
        } else {
          results.alreadyCorrect++
        }
      } else {
        results.errors++
      }
    }
    
    console.log('🎉 Bulk fix completed:', results)
    return results
  } catch (error) {
    console.error('❌ Error in bulk fix:', error)
    throw error
  }
}
