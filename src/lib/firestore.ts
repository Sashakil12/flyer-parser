import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit as firestoreLimit,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore'
import { db } from './firebase/config'
import { FlyerImage, ParsedFlyerItem, AutoApprovalRule } from '@/types'

// Collections
const FLYER_IMAGES_COLLECTION = 'flyer-images'
const PARSED_FLYER_ITEMS_COLLECTION = 'parsed-flyer-items'
const AUTO_APPROVAL_RULES_COLLECTION = 'auto-approval-rules'

// Flyer Images CRUD Operations
export const addFlyerImage = async (flyerImage: Omit<FlyerImage, 'id' | 'uploadedAt' | 'createdAt'>): Promise<string> => {
  try {
    const now = new Date()
    const docRef = await addDoc(collection(db, FLYER_IMAGES_COLLECTION), {
      ...flyerImage,
      originalName: flyerImage.filename, // Ensure originalName is set
      size: flyerImage.fileSize, // Ensure size alias is set
      uploadedAt: serverTimestamp(),
      createdAt: now.toISOString(),
    })
    return docRef.id
  } catch (error: any) {
    console.error('Error adding flyer image:', error)
    throw new Error('Failed to save flyer image')
  }
}

export const getFlyerImages = async (): Promise<FlyerImage[]> => {
  try {
    const q = query(
      collection(db, FLYER_IMAGES_COLLECTION),
      orderBy('uploadedAt', 'desc')
    )
    const querySnapshot = await getDocs(q)
    
    return querySnapshot.docs.map(doc => {
      const data = doc.data()
      return {
        id: doc.id,
        ...data,
        uploadedAt: data.uploadedAt as Timestamp,
        // Ensure all required fields are present
        originalName: data.originalName || data.filename,
        createdAt: data.createdAt || (data.uploadedAt ? data.uploadedAt.toDate().toISOString() : new Date().toISOString()),
        size: data.size || data.fileSize,
      } as FlyerImage
    })
  } catch (error: any) {
    console.error('Error getting flyer images:', error)
    throw new Error('Failed to load flyer images')
  }
}

export const updateFlyerImageStatus = async (
  id: string, 
  status: FlyerImage['processingStatus'],
  failureReason?: string
): Promise<void> => {
  try {
    const docRef = doc(db, FLYER_IMAGES_COLLECTION, id)
    const updateData: any = { processingStatus: status }
    
    // Add failure reason if status is failed
    if (status === 'failed' && failureReason) {
      updateData.failureReason = failureReason
    }
    
    // Clear failure reason if status is not failed
    if (status !== 'failed') {
      updateData.failureReason = null
    }
    
    await updateDoc(docRef, updateData)
  } catch (error: any) {
    console.error('Error updating flyer image status:', error)
    throw new Error('Failed to update processing status')
  }
}

export const deleteFlyerImage = async (id: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, FLYER_IMAGES_COLLECTION, id))
  } catch (error: any) {
    console.error('Error deleting flyer image:', error)
    throw new Error('Failed to delete flyer image')
  }
}

// Parsed Flyer Items CRUD Operations
export const addParsedFlyerItem = async (
  parsedItem: Omit<ParsedFlyerItem, 'id' | 'parsedAt'>
): Promise<string> => {
  try {
    const docRef = await addDoc(collection(db, PARSED_FLYER_ITEMS_COLLECTION), {
      ...parsedItem,
      parsedAt: serverTimestamp(),
    })
    return docRef.id
  } catch (error: any) {
    console.error('Error adding parsed flyer item:', error)
    throw new Error('Failed to save parsed data')
  }
}

export const getParsedItems = async (): Promise<ParsedFlyerItem[]> => {
  try {
    const q = query(
      collection(db, PARSED_FLYER_ITEMS_COLLECTION),
      orderBy('parsedAt', 'desc')
    )
    const querySnapshot = await getDocs(q)
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      parsedAt: doc.data().parsedAt as Timestamp,
    })) as ParsedFlyerItem[]
  } catch (error: any) {
    console.error('Error getting parsed items:', error)
    throw new Error('Failed to load parsed data')
  }
}

export const getParsedItemsByFlyerId = async (flyerImageId: string): Promise<ParsedFlyerItem[]> => {
  try {
    const q = query(
      collection(db, PARSED_FLYER_ITEMS_COLLECTION),
      where('flyerImageId', '==', flyerImageId),
      orderBy('parsedAt', 'desc')
    )
    const querySnapshot = await getDocs(q)
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      parsedAt: doc.data().parsedAt as Timestamp,
    })) as ParsedFlyerItem[]
  } catch (error: any) {
    console.error('Error getting parsed items by flyer ID:', error)
    throw new Error('Failed to load parsed data for flyer')
  }
}

export const updateParsedFlyerItem = async (
  id: string,
  updates: Partial<Omit<ParsedFlyerItem, 'id' | 'parsedAt'>>
): Promise<void> => {
  try {
    const docRef = doc(db, PARSED_FLYER_ITEMS_COLLECTION, id)
    await updateDoc(docRef, updates)
  } catch (error: any) {
    console.error('Error updating parsed flyer item:', error)
    throw new Error('Failed to update parsed item')
  }
}

export const approveParsedFlyerItem = async (id: string): Promise<void> => {
  try {
    const docRef = doc(db, PARSED_FLYER_ITEMS_COLLECTION, id)
    await updateDoc(docRef, { verified: true })
  } catch (error: any) {
    console.error('Error approving parsed flyer item:', error)
    throw new Error('Failed to update parsed data')
  }
}

export const deleteParsedFlyerItem = async (id: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, PARSED_FLYER_ITEMS_COLLECTION, id))
  } catch (error: any) {
    console.error('Error deleting parsed flyer item:', error)
    throw new Error('Failed to delete parsed data')
  }
}

// Auto-Approval Rules CRUD Operations
export const getAutoApprovalRules = async (): Promise<AutoApprovalRule[]> => {
  try {
    const q = query(
      collection(db, AUTO_APPROVAL_RULES_COLLECTION),
      orderBy('createdAt', 'desc')
    )
    const querySnapshot = await getDocs(q)
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as AutoApprovalRule))
  } catch (error: any) {
    console.error('Error fetching auto-approval rules:', error)
    throw new Error('Failed to fetch auto-approval rules')
  }
}

export const getActiveAutoApprovalRule = async (): Promise<AutoApprovalRule | null> => {
  try {
    const q = query(
      collection(db, AUTO_APPROVAL_RULES_COLLECTION),
      where('isActive', '==', true),
      orderBy('createdAt', 'desc'),
      firestoreLimit(1)
    )
    const querySnapshot = await getDocs(q)
    
    if (querySnapshot.empty) {
      return null
    }
    
    const doc = querySnapshot.docs[0]
    return {
      id: doc.id,
      ...doc.data()
    } as AutoApprovalRule
  } catch (error: any) {
    console.error('Error fetching active auto-approval rule:', error)
    throw new Error('Failed to fetch active auto-approval rule')
  }
}

export const saveAutoApprovalRule = async (
  id: string | null, 
  ruleData: Omit<AutoApprovalRule, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>
): Promise<string> => {
  try {
    const now = Timestamp.now()
    const userId = 'admin' // Replace with actual user ID from auth context
    
    if (id) {
      // Update existing rule
      const docRef = doc(db, AUTO_APPROVAL_RULES_COLLECTION, id)
      await updateDoc(docRef, {
        ...ruleData,
        updatedAt: now
      })
      return id
    } else {
      // Create new rule
      const docRef = await addDoc(collection(db, AUTO_APPROVAL_RULES_COLLECTION), {
        ...ruleData,
        createdAt: now,
        updatedAt: now,
        createdBy: userId
      })
      return docRef.id
    }
  } catch (error: any) {
    console.error('Error saving auto-approval rule:', error)
    throw new Error('Failed to save auto-approval rule')
  }
}

export const deleteAutoApprovalRule = async (id: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, AUTO_APPROVAL_RULES_COLLECTION, id))
  } catch (error: any) {
    console.error('Error deleting auto-approval rule:', error)
    throw new Error('Failed to delete auto-approval rule')
  }
}

// Utility functions
export const getFlyerImageById = async (id: string): Promise<FlyerImage | null> => {
  try {
    const docRef = doc(db, FLYER_IMAGES_COLLECTION, id)
    const docSnap = await getDocs(query(collection(db, FLYER_IMAGES_COLLECTION), where('__name__', '==', id)))
    
    if (docSnap.empty) {
      return null
    }
    
    const docData = docSnap.docs[0].data()
    return {
      id: docSnap.docs[0].id,
      ...docData,
      uploadedAt: docData.uploadedAt as Timestamp,
    } as FlyerImage
  } catch (error: any) {
    console.error('Error getting flyer image by ID:', error)
    throw new Error('Failed to load flyer image')
  }
}

export const getProcessingStats = async () => {
  try {
    const flyerImages = await getFlyerImages()
    const parsedItems = await getParsedItems()
    
    const statusCounts = flyerImages.reduce((acc, image) => {
      acc[image.processingStatus] = (acc[image.processingStatus] || 0) + 1
      return acc
    }, {} as Record<FlyerImage['processingStatus'], number>)
    
    return {
      totalImages: flyerImages.length,
      totalParsedItems: parsedItems.length,
      pending: statusCounts.pending || 0,
      processing: statusCounts.processing || 0,
      completed: statusCounts.completed || 0,
      failed: statusCounts.failed || 0,
      successRate: flyerImages.length > 0 
        ? Math.round(((statusCounts.completed || 0) / flyerImages.length) * 100) 
        : 0
    }
  } catch (error: any) {
    console.error('Error getting processing stats:', error)
    throw new Error('Failed to calculate processing statistics')
  }
}
