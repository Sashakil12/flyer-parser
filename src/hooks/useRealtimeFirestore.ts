'use client'

import { useEffect, useState } from 'react'
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  where,
  Timestamp 
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { FlyerImage, ParsedFlyerItem } from '@/types'

// Real-time flyer images hook
export const useRealtimeFlyerImages = () => {
  const [flyerImages, setFlyerImages] = useState<FlyerImage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = query(
      collection(db, 'flyer-images'),
      orderBy('uploadedAt', 'desc')
    )

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        try {
          const flyers = snapshot.docs.map(doc => {
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
          
          setFlyerImages(flyers)
          setError(null)
        } catch (err) {
          console.error('Error processing flyer images:', err)
          setError('Failed to load flyer images')
        } finally {
          setIsLoading(false)
        }
      },
      (err) => {
        console.error('Firestore error:', err)
        setError('Connection error')
        setIsLoading(false)
      }
    )

    return () => unsubscribe()
  }, [])

  return { flyerImages, isLoading, error }
}

// Real-time parsed items hook
export const useRealtimeParsedItems = (flyerImageId?: string, autoApprovalStatus?: 'success' | 'failed') => {
  const [parsedItems, setParsedItems] = useState<ParsedFlyerItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setIsLoading(true); // Reset loading state on filter change
    let q;
    const collectionRef = collection(db, 'parsed-flyer-items');
    
    const constraints = [orderBy('createdAt', 'desc')];

    if (flyerImageId) {
      constraints.push(where('flyerImageId', '==', flyerImageId));
    }

    if (autoApprovalStatus) {
      constraints.push(where('autoApprovalStatus', '==', autoApprovalStatus));
    }

    q = query(collectionRef, ...constraints);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        try {
          const items = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
              createdAt: data.createdAt as Timestamp,
              parsedAt: data.parsedAt as Timestamp,
              // Explicitly map auto-approval fields to ensure they're included
              autoApprovalStatus: data.autoApprovalStatus,
              autoApprovalReason: data.autoApprovalReason,
              autoApprovalFailureReason: data.autoApprovalFailureReason,
              autoApprovalConfidence: data.autoApprovalConfidence,
              autoApprovedAt: data.autoApprovedAt,
              autoApprovalFailedAt: data.autoApprovalFailedAt
            } as ParsedFlyerItem
          })
          
          setParsedItems(items)
          setError(null)
        } catch (err) {
          console.error('Error processing parsed items:', err)
          setError('Failed to load parsed items')
        } finally {
          setIsLoading(false)
        }
      },
      (err) => {
        console.error('Firestore error:', err)
        setError('Connection error')
        setIsLoading(false)
      }
    )

    return () => unsubscribe()
  }, [flyerImageId, autoApprovalStatus])

  return { parsedItems, isLoading, error }
}

// Real-time stats hook
export const useRealtimeStats = (autoApproved?: boolean) => {
  const { flyerImages } = useRealtimeFlyerImages()
  const { parsedItems } = useRealtimeParsedItems(undefined, autoApproved)

  const stats = {
    totalFlyers: flyerImages.length,
    totalParsedItems: parsedItems.length,
    pendingFlyers: flyerImages.filter(f => f.processingStatus === 'pending').length,
    processingFlyers: flyerImages.filter(f => f.processingStatus === 'processing').length,
    completedFlyers: flyerImages.filter(f => f.processingStatus === 'completed').length,
    failedFlyers: flyerImages.filter(f => f.processingStatus === 'failed').length,
    verifiedItems: parsedItems.filter(item => item.verified).length,
    unverifiedItems: parsedItems.filter(item => !item.verified).length,
  }

  return stats
}

// Real-time single flyer hook
export const useRealtimeFlyer = (flyerId: string) => {
  const [flyer, setFlyer] = useState<FlyerImage | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { flyerImages } = useRealtimeFlyerImages()

  useEffect(() => {
    if (flyerImages.length > 0) {
      const foundFlyer = flyerImages.find(f => f.id === flyerId)
      setFlyer(foundFlyer || null)
      setError(foundFlyer ? null : 'Flyer not found')
      setIsLoading(false)
    }
  }, [flyerId, flyerImages])

  return { flyer, isLoading, error }
}
