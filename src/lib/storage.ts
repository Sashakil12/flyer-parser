import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from './firebase/config'
import { addFlyerImage } from './firestore'
import { FlyerImage } from '@/types'
import { v4 as uuidv4 } from 'uuid'

/**
 * Upload multiple files to Firebase Storage and create Firestore records
 */
export const uploadFiles = async (
  files: File[],
  userId: string,
  onProgress?: (fileName: string, progress: number) => void
): Promise<string[]> => {
  const uploadPromises = files.map(file => uploadFile(file, userId, onProgress))
  return Promise.all(uploadPromises)
}

/**
 * Upload a single file to Firebase Storage and create Firestore record
 */
export const uploadFile = async (
  file: File,
  userId: string,
  onProgress?: (fileName: string, progress: number) => void
): Promise<string> => {
  try {
    // Generate unique filename
    const fileId = uuidv4()
    const fileExtension = file.name.split('.').pop()
    const fileName = `${fileId}.${fileExtension}`
    const storagePath = `flyer-images/${fileName}`
    
    // Create storage reference
    const storageRef = ref(storage, storagePath)
    
    // Start upload
    const uploadTask = uploadBytesResumable(storageRef, file)
    
    return new Promise<string>((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          // Calculate progress
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          
          if (onProgress) {
            onProgress(file.name, progress)
          }
        },
        (error) => {
          console.error('Upload error:', error)
          reject(new Error(`Upload failed: ${error.message}`))
        },
        async () => {
          try {
            // Get download URL
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref)
            
            // Create Firestore record
            const flyerImageId = await addFlyerImage({
              filename: file.name,
              fileSize: file.size,
              fileType: file.type,
              storageUrl: downloadUrl,
              processingStatus: 'pending',
              uploadedBy: userId,
            })
            
            // Trigger Inngest workflow for AI processing
            await triggerParseWorkflow(flyerImageId, downloadUrl)
            
            resolve(flyerImageId)
          } catch (error) {
            console.error('Post-upload processing error:', error)
            reject(error)
          }
        }
      )
    })
  } catch (error: any) {
    console.error('File upload error:', error)
    throw new Error('Failed to upload file: ' + error.message)
  }
}

/**
 * Delete a file from Firebase Storage
 */
export const deleteFile = async (storageUrl: string): Promise<void> => {
  try {
    const fileRef = ref(storage, storageUrl)
    await deleteObject(fileRef)
  } catch (error: any) {
    console.error('File deletion error:', error)
    throw new Error('Failed to delete file: ' + error.message)
  }
}

/**
 * Trigger Inngest workflow for AI parsing
 */
const triggerParseWorkflow = async (
  flyerImageId: string,
  storageUrl: string
): Promise<void> => {
  try {
    const response = await fetch('/api/inngest/trigger-parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        flyerImageId,
        storageUrl,
      }),
    })
    
    if (!response.ok) {
      throw new Error('Failed to trigger parsing workflow')
    }
  } catch (error: any) {
    console.error('Failed to trigger Inngest workflow:', error)
    throw new Error('Failed to start AI processing: ' + error.message)
  }
}

/**
 * Get file metadata from storage URL
 */
export const getFileMetadata = (storageUrl: string) => {
  try {
    const fileRef = ref(storage, storageUrl)
    return fileRef
  } catch (error) {
    console.error('Failed to get file metadata:', error)
    return null
  }
}

/**
 * Validate file before upload
 */
export const validateFile = (file: File): { isValid: boolean; error?: string } => {
  // Check file type
  if (!file.type.startsWith('image/')) {
    return { isValid: false, error: 'File must be an image' }
  }
  
  // Check file size (10MB limit)
  const maxSize = 10 * 1024 * 1024 // 10MB
  if (file.size > maxSize) {
    return { isValid: false, error: 'File size must be less than 10MB' }
  }
  
  // Check supported formats
  const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
  if (!supportedTypes.includes(file.type)) {
    return { isValid: false, error: 'Supported formats: JPEG, PNG, WebP, GIF' }
  }
  
  return { isValid: true }
}

/**
 * Get storage usage statistics
 */
export const getStorageStats = async (): Promise<{
  totalFiles: number;
  totalSize: number;
  avgFileSize: number;
}> => {
  try {
    // This would typically require a server-side function to get actual storage stats
    // For now, we'll return placeholder data
    return {
      totalFiles: 0,
      totalSize: 0,
      avgFileSize: 0,
    }
  } catch (error) {
    console.error('Failed to get storage stats:', error)
    throw new Error('Failed to retrieve storage statistics')
  }
}
