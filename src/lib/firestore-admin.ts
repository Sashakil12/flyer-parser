import { adminDb } from './firebase/admin'
import { FlyerImage, ParsedFlyerItem } from '@/types'

const FLYER_IMAGES_COLLECTION = 'flyer-images'
const PARSED_FLYER_ITEMS_COLLECTION = 'parsed-flyer-items'

// Server-side Firestore operations using Firebase Admin SDK
export const updateFlyerImageStatus = async (
  id: string,
  status: FlyerImage['processingStatus'],
  failureReason?: string
): Promise<void> => {
  try {
    console.log(`📝 Updating flyer image ${id} status to: ${status}`)
    
    const docRef = adminDb.collection(FLYER_IMAGES_COLLECTION).doc(id)
    
    const updateData: any = {
      processingStatus: status,
      updatedAt: new Date()
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
    
    console.log(`✅ Successfully updated flyer image ${id} status to: ${status}`)
  } catch (error: any) {
    console.error('❌ Error updating flyer image status:', error)
    throw new Error(`Failed to update processing status: ${error.message}`)
  }
}

export const addParsedFlyerItem = async (
  item: Omit<ParsedFlyerItem, 'id' | 'createdAt' | 'parsedAt'>
): Promise<string> => {
  try {
    console.log(`📝 Adding parsed item for flyer: ${item.flyerImageId}`)
    
    const docData = {
      ...item,
      createdAt: new Date(),
      parsedAt: new Date(),
    }
    
    const docRef = await adminDb.collection(PARSED_FLYER_ITEMS_COLLECTION).add(docData)
    
    console.log(`✅ Successfully added parsed item with ID: ${docRef.id}`)
    return docRef.id
  } catch (error: any) {
    console.error('❌ Error adding parsed flyer item:', error)
    throw new Error(`Failed to add parsed flyer item: ${error.message}`)
  }
}

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
