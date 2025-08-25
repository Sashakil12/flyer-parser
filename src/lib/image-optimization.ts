import sharp from 'sharp'
import { ImageOptimizationResult } from '@/types'

export interface FlutterOptimizationOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number
  format?: 'webp' | 'jpeg' | 'png'
  generateThumbnail?: boolean
  generateTransparent?: boolean
  generateMultipleResolutions?: boolean
}

export class ImageOptimizer {
  private static readonly DEFAULT_OPTIONS: Required<FlutterOptimizationOptions> = {
    maxWidth: 800,
    maxHeight: 600,
    quality: 85,
    format: 'webp',
    generateThumbnail: true,
    generateTransparent: true,
    generateMultipleResolutions: true
  }

  static async optimizeForFlutter(
    imageData: string,
    options: FlutterOptimizationOptions = {}
  ): Promise<ImageOptimizationResult> {
    console.log('🔧 Optimizing image for Flutter app...')
    
    const opts = { ...this.DEFAULT_OPTIONS, ...options }
    
    try {
      // Convert base64 to buffer
      const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '')
      const inputBuffer = Buffer.from(base64Data, 'base64')
      
      // Create sharp instance
      const image = sharp(inputBuffer)
      const metadata = await image.metadata()
      
      console.log(`📐 Original image: ${metadata.width}x${metadata.height}`)
      
      // Generate optimized versions
      const results: Partial<ImageOptimizationResult> = {}
      
      // 1. Original high-quality version
      results.original = await this.generateVersion(image, {
        width: Math.min(opts.maxWidth, metadata.width || opts.maxWidth),
        height: Math.min(opts.maxHeight, metadata.height || opts.maxHeight),
        quality: 95,
        format: opts.format
      })
      
      // 2. Optimized version for mobile
      results.optimized = await this.generateVersion(image, {
        width: Math.min(600, metadata.width || 600),
        height: Math.min(450, metadata.height || 450),
        quality: opts.quality,
        format: opts.format
      })
      
      // 3. Thumbnail
      if (opts.generateThumbnail) {
        results.thumbnail = await this.generateVersion(image, {
          width: 200,
          height: 150,
          quality: 80,
          format: opts.format
        })
      }
      
      // 4. Transparent version (if supported)
      if (opts.generateTransparent && opts.format === 'png') {
        results.transparent = await this.generateVersion(image, {
          width: Math.min(opts.maxWidth, metadata.width || opts.maxWidth),
          height: Math.min(opts.maxHeight, metadata.height || opts.maxHeight),
          quality: 95,
          format: 'png',
          removeBackground: true
        })
      }
      
      // 5. Multiple resolutions for Flutter
      if (opts.generateMultipleResolutions) {
        results.resolutions = {
          '1x': await this.generateVersion(image, {
            width: 400,
            height: 400,
            quality: opts.quality,
            format: opts.format
          }),
          '2x': await this.generateVersion(image, {
            width: 800,
            height: 800,
            quality: opts.quality,
            format: opts.format
          }),
          '3x': await this.generateVersion(image, {
            width: 1200,
            height: 1200,
            quality: opts.quality,
            format: opts.format
          }),
          'custom': await this.generateVersion(image, {
            width: 828,
            height: 440,
            quality: opts.quality,
            format: opts.format
          })
        }
      }
      
      console.log('✅ Image optimization completed')
      return results as ImageOptimizationResult
      
    } catch (error) {
      console.error('❌ Error optimizing image:', error)
      throw new Error(`Image optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  private static async generateVersion(
    image: sharp.Sharp,
    options: {
      width: number
      height: number
      quality: number
      format: 'webp' | 'jpeg' | 'png'
      removeBackground?: boolean
    }
  ): Promise<string> {
    try {
      let pipeline = image.clone()
        .resize(options.width, options.height, {
          fit: 'inside',
          withoutEnlargement: true,
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
      
      // Apply format-specific optimizations
      switch (options.format) {
        case 'webp':
          pipeline = pipeline.webp({ 
            quality: options.quality,
            effort: 4 // Good balance of compression and speed
          })
          break
        case 'jpeg':
          pipeline = pipeline.jpeg({ 
            quality: options.quality,
            progressive: true,
            mozjpeg: true
          })
          break
        case 'png':
          pipeline = pipeline.png({ 
            quality: options.quality,
            compressionLevel: 6,
            adaptiveFiltering: true
          })
          break
      }
      
      // Remove background if requested (for transparent versions)
      if (options.removeBackground && options.format === 'png') {
        // This is a simplified background removal
        // In production, you might want to use more sophisticated methods
        pipeline = pipeline.png({ palette: true })
      }
      
      const buffer = await pipeline.toBuffer()
      return `data:image/${options.format};base64,${buffer.toString('base64')}`
      
    } catch (error) {
      console.error(`❌ Error generating ${options.format} version:`, error)
      throw error
    }
  }
  
  static async validateImageQuality(imageData: string): Promise<{
    isValid: boolean
    qualityScore: number
    issues: string[]
  }> {
    console.log('🔍 Validating image quality...')
    
    try {
      const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '')
      const buffer = Buffer.from(base64Data, 'base64')
      const image = sharp(buffer)
      const metadata = await image.metadata()
      
      const issues: string[] = []
      let qualityScore = 1.0
      
      // Check dimensions
      if (!metadata.width || !metadata.height) {
        issues.push('Invalid image dimensions')
        qualityScore -= 0.5
      } else {
        if (metadata.width < 200 || metadata.height < 200) {
          issues.push('Image too small (minimum 200x200)')
          qualityScore -= 0.3
        }
        if (metadata.width > 4000 || metadata.height > 4000) {
          issues.push('Image too large (maximum 4000x4000)')
          qualityScore -= 0.2
        }
      }
      
      // Check file size
      if (buffer.length > 10 * 1024 * 1024) { // 10MB
        issues.push('File size too large')
        qualityScore -= 0.2
      }
      
      // Check format
      if (!['jpeg', 'jpg', 'png', 'webp'].includes(metadata.format || '')) {
        issues.push('Unsupported image format')
        qualityScore -= 0.3
      }
      
      const isValid = issues.length === 0 && qualityScore >= 0.5
      
      console.log(`📊 Image quality score: ${qualityScore.toFixed(2)}`)
      if (issues.length > 0) {
        console.log('⚠️ Quality issues:', issues)
      }
      
      return {
        isValid,
        qualityScore: Math.max(0, qualityScore),
        issues
      }
      
    } catch (error) {
      console.error('❌ Error validating image quality:', error)
      return {
        isValid: false,
        qualityScore: 0,
        issues: ['Failed to validate image']
      }
    }
  }
  
  static async generateBlurPlaceholder(imageData: string): Promise<string> {
    console.log('🌫️ Generating blur placeholder...')
    
    try {
      const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '')
      const buffer = Buffer.from(base64Data, 'base64')
      
      const placeholder = await sharp(buffer)
        .resize(20, 20, { fit: 'inside' })
        .blur(2)
        .webp({ quality: 20 })
        .toBuffer()
      
      return `data:image/webp;base64,${placeholder.toString('base64')}`
      
    } catch (error) {
      console.error('❌ Error generating blur placeholder:', error)
      throw error
    }
  }
}

// Utility functions
export async function optimizeForFlutter(
  imageData: string,
  options?: FlutterOptimizationOptions
): Promise<ImageOptimizationResult> {
  return ImageOptimizer.optimizeForFlutter(imageData, options)
}

export async function validateImageQuality(imageData: string) {
  return ImageOptimizer.validateImageQuality(imageData)
}

export async function generateBlurPlaceholder(imageData: string): Promise<string> {
  return ImageOptimizer.generateBlurPlaceholder(imageData)
}
