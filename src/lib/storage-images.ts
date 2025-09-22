import { getStorage } from 'firebase-admin/storage'
import { ImageOptimizationResult } from '@/types'

export interface ImageUploadResult {
  urls: {
    original: string
    optimized: string
    thumbnail: string
    transparent?: string
    resolutions: {
      '1x': string
      '2x': string
      '3x': string
      'custom': string
    }
  }
  metadata: {
    uploadedAt: string
    sizes: {
      original: number
      optimized: number
      thumbnail: number
      transparent?: number
      resolutions: {
        '1x': number
        '2x': number
        '3x': number
        'custom': number
      }
    }
  }
}

export class ImageStorageService {
  private bucket = getStorage().bucket()

  async uploadOptimizedImages(
    flyerImageId: string,
    parsedItemId: string,
    optimizedImages: ImageOptimizationResult
  ): Promise<ImageUploadResult> {
    console.log(`📤 Uploading optimized images for item: ${parsedItemId}`)
    
    try {
      const basePath = `flyer-images/${flyerImageId}/extracted/${parsedItemId}`
      const uploadPromises: Promise<any>[] = []
      const urls: any = { resolutions: {} }
      const sizes: any = { resolutions: {} }
      
      // Upload original
      uploadPromises.push(
        this.uploadSingleImage(
          optimizedImages.original,
          `${basePath}/clean/original.webp`
        ).then(result => {
          urls.original = result.url
          sizes.original = result.size
        })
      )
      
      // Upload optimized
      uploadPromises.push(
        this.uploadSingleImage(
          optimizedImages.optimized,
          `${basePath}/clean/optimized.webp`
        ).then(result => {
          urls.optimized = result.url
          sizes.optimized = result.size
        })
      )
      
      // Upload thumbnail
      uploadPromises.push(
        this.uploadSingleImage(
          optimizedImages.thumbnail,
          `${basePath}/clean/thumbnail.webp`
        ).then(result => {
          urls.thumbnail = result.url
          sizes.thumbnail = result.size
        })
      )
      
      // Upload transparent version if available
      if (optimizedImages.transparent) {
        uploadPromises.push(
          this.uploadSingleImage(
            optimizedImages.transparent,
            `${basePath}/clean/transparent.webp`
          ).then(result => {
            urls.transparent = result.url
            sizes.transparent = result.size
          })
        )
      }
      
      // Upload resolutions
      Object.entries(optimizedImages.resolutions).forEach(([resolution, imageData]) => {
        uploadPromises.push(
          this.uploadSingleImage(
            imageData,
            `${basePath}/resolutions/${resolution}.webp`
          ).then(result => {
            urls.resolutions[resolution as keyof typeof urls.resolutions] = result.url
            sizes.resolutions[resolution as keyof typeof sizes.resolutions] = result.size
          })
        )
      })
      
      // Wait for all uploads to complete
      await Promise.all(uploadPromises)
      
      const result: ImageUploadResult = {
        urls,
        metadata: {
          uploadedAt: new Date().toISOString(),
          sizes
        }
      }
      
      console.log(`✅ Successfully uploaded all optimized images for item: ${parsedItemId}`)
      return result
      
    } catch (error) {
      console.error(`❌ Error uploading optimized images for item ${parsedItemId}:`, error)
      throw error
    }
  }
  
  private async uploadSingleImage(
    imageData: string,
    filePath: string
  ): Promise<{ url: string; size: number }> {
    try {
      // Convert base64 to buffer
      const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '')
      const buffer = Buffer.from(base64Data, 'base64')
      
      // Create file reference
      const file = this.bucket.file(filePath)
      
      // Upload with metadata
      await file.save(buffer, {
        metadata: {
          contentType: this.getContentTypeFromPath(filePath),
          cacheControl: 'public, max-age=31536000', // 1 year cache
          metadata: {
            uploadedAt: new Date().toISOString(),
            source: 'imagen4-extraction'
          }
        }
      })
      
      // Make file publicly readable
      await file.makePublic()
      
      // Get public URL
      const publicUrl = `https://storage.googleapis.com/${this.bucket.name}/${filePath}`
      
      return {
        url: publicUrl,
        size: buffer.length
      }
      
    } catch (error) {
      console.error(`❌ Error uploading single image to ${filePath}:`, error)
      throw error
    }
  }
  
  private getContentTypeFromPath(filePath: string): string {
    if (filePath.endsWith('.webp')) return 'image/webp'
    if (filePath.endsWith('.png')) return 'image/png'
    if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg'
    return 'image/webp' // default
  }
  
  async deleteExtractedImages(flyerImageId: string, parsedItemId: string): Promise<void> {
    console.log(`🗑️ Deleting extracted images for item: ${parsedItemId}`)
    
    try {
      const basePath = `flyer-images/${flyerImageId}/extracted/${parsedItemId}/`
      
      // List all files in the directory
      const [files] = await this.bucket.getFiles({
        prefix: basePath
      })
      
      // Delete all files
      const deletePromises = files.map(file => file.delete())
      await Promise.all(deletePromises)
      
      console.log(`✅ Deleted ${files.length} extracted images for item: ${parsedItemId}`)
      
    } catch (error) {
      console.error(`❌ Error deleting extracted images for item ${parsedItemId}:`, error)
      throw error
    }
  }
  
  async getImageMetadata(flyerImageId: string, parsedItemId: string): Promise<any> {
    try {
      const metadataPath = `flyer-images/${flyerImageId}/extracted/${parsedItemId}/metadata.json`
      const file = this.bucket.file(metadataPath)
      
      const [exists] = await file.exists()
      if (!exists) {
        return null
      }
      
      const [contents] = await file.download()
      return JSON.parse(contents.toString())
      
    } catch (error) {
      console.error(`❌ Error getting image metadata for item ${parsedItemId}:`, error)
      return null
    }
  }
  
  async saveImageMetadata(
    flyerImageId: string,
    parsedItemId: string,
    metadata: any
  ): Promise<void> {
    try {
      const metadataPath = `flyer-images/${flyerImageId}/extracted/${parsedItemId}/metadata.json`
      const file = this.bucket.file(metadataPath)
      
      await file.save(JSON.stringify(metadata, null, 2), {
        metadata: {
          contentType: 'application/json'
        }
      })
      
      console.log(`✅ Saved image metadata for item: ${parsedItemId}`)
      
    } catch (error) {
      console.error(`❌ Error saving image metadata for item ${parsedItemId}:`, error)
      throw error
    }
  }
}

// Export singleton instance
export const imageStorageService = new ImageStorageService()

// Utility functions
export async function uploadOptimizedImages(
  flyerImageId: string,
  parsedItemId: string,
  optimizedImages: ImageOptimizationResult
): Promise<ImageUploadResult> {
  return imageStorageService.uploadOptimizedImages(flyerImageId, parsedItemId, optimizedImages)
}

export async function deleteExtractedImages(
  flyerImageId: string,
  parsedItemId: string
): Promise<void> {
  return imageStorageService.deleteExtractedImages(flyerImageId, parsedItemId)
}

export async function getImageMetadata(
  flyerImageId: string,
  parsedItemId: string
): Promise<any> {
  return imageStorageService.getImageMetadata(flyerImageId, parsedItemId)
}

export async function saveImageMetadata(
  flyerImageId: string,
  parsedItemId: string,
  metadata: any
): Promise<void> {
  return imageStorageService.saveImageMetadata(flyerImageId, parsedItemId, metadata)
}
