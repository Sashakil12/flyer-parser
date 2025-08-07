import { inngest } from '../inngest'
import { parseImageWithGemini } from '../gemini'
import { updateFlyerImageStatus, addParsedFlyerItem } from '../firestore-admin'
import { GeminiParseResult } from '@/types'

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
        await updateFlyerImageStatus(flyerImageId, 'failed')
        return { status: 'failed' }
      })
      
      throw new Error(`Parsing failed: ${parseResult.error}`)
    }

    // Step 3b: Save parsed data to Firestore
    const savedItems = await step.run('save-parsed-data', async () => {
      const results = parseResult.data
      const savedItemIds: string[] = []
      
      for (const item of results) {
        try {
          const itemId = await addParsedFlyerItem({
            flyerImageId,
            productName: item.product_name,
            discountPrice: item.discount_price,
            oldPrice: item.old_price,
            additionalInfo: item.additional_info,
            confidence: 0.85, // Default confidence score
            verified: false,
          })
          savedItemIds.push(itemId)
        } catch (error: any) {
          console.error('Error saving parsed item:', error)
        }
      }
      
      return savedItemIds
    })

    // Step 4: Update status to completed
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

// Export all functions
export const inngestFunctions = [
  parseFlyerFunction,
  statusUpdateFunction,
]
