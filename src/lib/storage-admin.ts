import { adminStorage } from './firebase/admin'

/**
 * Get a data URL for an image stored in Firebase Storage
 */
export const getImageDataUrl = async (storageUrl: string): Promise<string> => {
  try {
    console.log(`📥 Getting image data URL for: ${storageUrl}`)
    
    // Extract the path from the storage URL
    // Example: https://storage.googleapis.com/badiyala-flyer-parser.appspot.com/flyers/image.jpg
    // We need to extract: flyers/image.jpg
    const urlObj = new URL(storageUrl)
    const pathWithBucket = urlObj.pathname.substring(1) // Remove leading slash
    const parts = pathWithBucket.split('/')
    const bucket = parts[0]
    const path = parts.slice(1).join('/')
    
    // Get the file from storage
    const file = adminStorage.bucket(bucket).file(path)
    const [exists] = await file.exists()
    
    if (!exists) {
      throw new Error(`File does not exist at path: ${path}`)
    }
    
    // Download the file
    const [buffer] = await file.download()
    
    // Convert to base64 data URL
    const mimeType = file.metadata?.contentType || 'image/jpeg'
    const base64 = buffer.toString('base64')
    const dataUrl = `data:${mimeType};base64,${base64}`
    
    console.log(`✅ Successfully got data URL (length: ${dataUrl.length})`)
    return dataUrl
  } catch (error: any) {
    console.error('❌ Error getting image data URL:', error)
    throw new Error(`Failed to get image data URL: ${error.message}`)
  }
}
