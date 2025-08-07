import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  where,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore'
import { db } from './firebase/config'
import { FlyerImage, ParsedFlyerItem } from '@/types'

// Collections
const FLYER_IMAGES_COLLECTION = 'flyer-images'
const PARSED_FLYER_ITEMS_COLLECTION = 'parsed-flyer-items'

// Flyer Images CRUD Operations
export const addFlyerImage = async (flyerImage: Omit<FlyerImage, 'id' | 'uploadedAt'>): Promise<string> => {
  try {
    const docRef = await addDoc(collection(db, FLYER_IMAGES_COLLECTION), {
      ...flyerImage,
      uploadedAt: serverTimestamp(),
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
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      uploadedAt: doc.data().uploadedAt as Timestamp,
    })) as FlyerImage[]
  } catch (error: any) {
    console.error('Error getting flyer images:', error)
    throw new Error('Failed to load flyer images')
  }
}

export const updateFlyerImageStatus = async (
  id: string, 
  status: FlyerImage['processingStatus']
): Promise<void> => {
  try {
    const docRef = doc(db, FLYER_IMAGES_COLLECTION, id)
    await updateDoc(docRef, { processingStatus: status })
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
