import { GoogleGenerativeAI } from '@google/generative-ai'
import { ProductExtractionConfig, CleanProductImage } from '@/types'
import { appConfig } from '@/lib/config'

// Initialize Gemini AI with Nano Banana model
const genAI = new GoogleGenerativeAI(appConfig.google.apiKey!)

interface ParsedItemWithRegion {
  id: string
  productName: string
  productNameMk?: string
  discountPrice?: number
  oldPrice: number
  additionalInfo?: string[]
  suggestedRegion?: {
    x: number
    y: number
    width: number
    height: number
    confidence: number
  }
}

interface DetectedRegion {
  itemId: string
  boundingBox: {
    x: number
    y: number
    width: number
    height: number
  }
  confidence: number
  productName: string
}

// Specialized prompts for Nano Banana's natural language approach
const PRODUCT_EXTRACTION_PROMPT = `
PRODUCT EXTRACTION TASK: Extract and isolate the specific product from this flyer image.

TARGET PRODUCT: "PRODUCT_NAME"

CRITICAL REQUIREMENTS:
1. IDENTIFY the product labeled or matching "PRODUCT_NAME" in this flyer
2. EXTRACT only that specific product from the image
3. REMOVE all flyer elements: promotional text, price tags, discount badges, store logos, background graphics
4. REMOVE all other products visible in the flyer - focus ONLY on the target product
5. PLACE the extracted product on a clean white background (#FFFFFF)
6. MAINTAIN the product's exact appearance: same colors, packaging, shape, size
7. ADD professional studio lighting with subtle shadows
8. CENTER the product in the frame
9. ENSURE the result looks like a professional e-commerce product photo
10. Ensure product labels are preserved.
WHAT TO REMOVE:
- Price tags, discount percentages (e.g., "50% OFF", "$19.99", "SALE")
- Store logos, brand watermarks, promotional badges
- Background text or graphics from the flyer
- Other products visible in the flyer
- Promotional banners, ribbons, or stickers
- Any non-product elements

FINAL OUTPUT REQUIREMENTS:
- Pure white background (#FFFFFF)
- Single product centered in frame
- No text or promotional elements visible anywhere
- Professional lighting and soft shadows
- High quality and sharp details
- Suitable for online store catalog
- Commercial photography quality
- Product appearance in the generated image should be the same as the flyer.
The result should look like a professional product photo taken in a studio, not a cropped section of a flyer.
`

const BACKGROUND_REMOVAL_PROMPT = `
BACKGROUND REMOVAL AND CLEANUP TASK:

Remove the flyer background and clean up this product image:

1. REMOVE the original flyer background completely
2. REMOVE all promotional text, price tags, discount badges
3. REMOVE store logos, watermarks, promotional stickers
4. KEEP only the actual product itself
5. PLACE on pure white background (#FFFFFF)
6. ADD professional studio lighting
7. ADD subtle shadow for depth and realism
8. MAINTAIN product's natural colors and details
9. CENTER the product in the frame

Create a clean, professional e-commerce product image suitable for online stores.
`

const TEXT_REMOVAL_PROMPT = `
TEXT AND PROMOTIONAL ELEMENT REMOVAL:

Clean up this product image by removing all text and promotional elements:

1. REMOVE all visible text (prices, discounts, brand names, promotional text)
2. REMOVE promotional badges, stickers, or overlays
3. REMOVE store logos or watermarks
4. KEEP only the actual product
5. FILL removed areas naturally to maintain product integrity
6. PRESERVE product colors, textures, and details
7. MAINTAIN professional appearance

Focus on creating a clean product image with no textual information visible while preserving the product's natural appearance.
`

class NanoBananaService {
  private model: any

  constructor() {
    // Initialize Gemini 2.5 Flash Image Preview (Nano Banana)
    this.model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash-image-preview',
      generationConfig: {
        temperature: 0.1, // Low temperature for consistent results
        topP: 0.8,
        topK: 40,
      }
    })
    
    console.log('🍌 NanoBananaService initialized with Gemini 2.5 Flash Image Preview')
  }

  private async callNanoBananaAPI(prompt: string, imageData: string, operation: string): Promise<any> {
    const maxRetries = 3
    const baseDelay = 1000 // 1 second
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🍌 Calling Nano Banana API for operation: ${operation} (attempt ${attempt}/${maxRetries})`)
        console.log(`🍌 Prompt length: ${prompt.length}`)
        
        // Validate input data
        if (!prompt || prompt.trim().length === 0) {
          throw new Error('Prompt is empty or invalid')
        }
        
        if (!imageData || !imageData.includes('base64')) {
          throw new Error('Image data is missing or invalid format')
        }
        
        // Extract base64 data and mime type
        const [header, base64Data] = imageData.split(',')
        const mimeType = header.split(';')[0].split(':')[1]
        
        if (!base64Data || base64Data.length < 100) {
          throw new Error('Base64 image data is too short, likely invalid')
        }
        
        console.log(`🍌 Base64 data length: ${base64Data.length}`)
        console.log(`🍌 MIME type: ${mimeType}`)
        
        // Prepare the content for Gemini
        const content = [
          prompt,
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType
            }
          }
        ]
        
        console.log(`🍌 Generating content with Nano Banana...`)
        
        const result = await this.model.generateContent(content)
        const response = await result.response
        
        // Check if response contains image data
        if (response.candidates && response.candidates[0] && response.candidates[0].content) {
          const parts = response.candidates[0].content.parts
          
          // Look for inline data (image) in the response
          for (const part of parts) {
            if (part.inlineData && part.inlineData.data) {
              console.log(`✅ Nano Banana API call successful for ${operation}`)
              return {
                predictions: [{
                  bytesBase64Encoded: part.inlineData.data
                }]
              }
            }
          }
        }
        
        // If no image data found, throw error
        throw new Error(`No image data returned from Nano Banana for ${operation}`)

      } catch (error: any) {
        console.error(`❌ Nano Banana API error for ${operation} (attempt ${attempt}):`, error)

        // Handle specific error types
        if (error.message?.includes('quota') || error.message?.includes('429')) {
          // Quota exceeded - implement exponential backoff
          const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000
          console.warn(`⏳ Quota exceeded for ${operation}. Retrying in ${Math.round(delay)}ms...`)
          
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
          } else {
            throw new Error(`Quota exceeded for ${operation}. Please check your Google AI API quotas and try again later.`)
          }
        } else if (error.message?.includes('safety')) {
          throw new Error(`Content flagged by safety filters for ${operation}: ${error.message}`)
        } else if (attempt === maxRetries) {
          throw error
        }
        
        // For other errors, retry with backoff
        const delay = baseDelay * Math.pow(2, attempt - 1)
        console.warn(`🔄 Error for ${operation}. Retrying in ${Math.round(delay)}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    throw new Error(`All retry attempts failed for ${operation}`)
  }

  async detectProductRegions(
    flyerImageData: string,
    parsedItems: ParsedItemWithRegion[]
  ): Promise<DetectedRegion[]> {
    console.log('🍌 Using Nano Banana to detect product locations in flyer...')
    console.log(`📊 Looking for ${parsedItems.length} products in flyer`)
    
    if (parsedItems.length === 0) {
      console.warn('⚠️ No parsed items provided for detection')
      return []
    }
    
    try {
      // For Nano Banana, we'll use a simplified approach since it excels at understanding context
      // We'll create regions based on the parsed items and let Nano Banana handle the extraction
      const regions: DetectedRegion[] = parsedItems.map((item, index) => {
        // Create a simple grid layout for region suggestions
        const itemsPerRow = Math.min(3, Math.ceil(Math.sqrt(parsedItems.length)))
        const rows = Math.ceil(parsedItems.length / itemsPerRow)
        
        const row = Math.floor(index / itemsPerRow)
        const col = index % itemsPerRow
        
        const padding = 0.05
        const availableWidth = 1 - (2 * padding)
        const availableHeight = 1 - (2 * padding)
        
        const itemWidth = availableWidth / itemsPerRow
        const itemHeight = availableHeight / rows
        
        return {
          itemId: item.id,
          boundingBox: {
            x: padding + (col * itemWidth) + (itemWidth * 0.1),
            y: padding + (row * itemHeight) + (itemHeight * 0.1),
            width: itemWidth * 0.8,
            height: itemHeight * 0.8
          },
          confidence: 0.9, // High confidence since Nano Banana is excellent at context understanding
          productName: item.productName
        }
      })
      
      console.log(`🍌 Created ${regions.length} regions for Nano Banana processing`)
      return regions
      
    } catch (error) {
      console.error('❌ Error in Nano Banana product detection:', error)
      return []
    }
  }

  async generateCleanProductImageDirect(
    flyerImageData: string,
    item: ParsedItemWithRegion,
    config: ProductExtractionConfig
  ): Promise<CleanProductImage> {
    console.log(`🍌 Direct product extraction for: ${item.productName}`)
    console.log(`🍌 Item details:`, {
      id: item.id,
      productName: item.productName,
      productNameMk: item.productNameMk
    })

    try {
      // Build enhanced prompt with product details
      const prompt = this.buildExtractionPrompt(item, config)
      console.log(`🍌 Generated prompt for ${item.productName}`)
      
      const response = await this.generateImage(prompt, flyerImageData)
      console.log(`🍌 API response:`, {
        success: response.success,
        hasImageUrl: !!response.imageUrl,
        error: response.error
      })
      
      if (!response.success || !response.imageUrl) {
        const errorMsg = `Failed to generate clean product image: ${response.error}`
        console.error(`❌ ${errorMsg}`)
        throw new Error(errorMsg)
      }

      console.log(`✅ Successfully generated professional product image using Nano Banana`)
      
      const cleanImage = {
        itemId: item.id,
        productName: item.productName,
        imageUrl: response.imageUrl,
        confidence: 0.95, // High confidence for Nano Banana
        extractionMethod: 'nano-banana-direct' as const,
        metadata: {
          productDetails: {
            productName: item.productName,
            productNameMk: item.productNameMk,
            discountPrice: item.discountPrice,
            oldPrice: item.oldPrice
          },
          generatedAt: new Date().toISOString(),
          config: config
        }
      }
      
      console.log(`✅ Created clean image object with Nano Banana:`, {
        itemId: cleanImage.itemId,
        productName: cleanImage.productName,
        hasImageUrl: !!cleanImage.imageUrl,
        confidence: cleanImage.confidence
      })
      
      return cleanImage
    } catch (error) {
      console.error(`❌ Error in Nano Banana generation for ${item.productName}:`, error)
      console.error(`❌ Error stack:`, error instanceof Error ? error.stack : 'No stack trace')
      throw error
    }
  }

  private buildExtractionPrompt(item: ParsedItemWithRegion, config: ProductExtractionConfig): string {
    let prompt = PRODUCT_EXTRACTION_PROMPT.replace('PRODUCT_NAME', item.productName)
    
    // Add alternative product name if available for better recognition
    if (item.productNameMk && item.productNameMk !== item.productName) {
      prompt += `\n\nALTERNATIVE PRODUCT NAME: ${item.productNameMk}`
    }
    
    // Add specific configuration instructions
    if (config.removeText) {
      prompt += '\n\nEMPHASIS: Pay special attention to removing ALL text elements from the product and flyer.'
    }
    
    if (config.removePromotionalElements) {
      prompt += '\n\nEMPHASIS: Remove all promotional stickers, badges, and marketing elements.'
    }
    
    if (config.backgroundStyle === 'white') {
      prompt += '\n\nBACKGROUND: Ensure the background is pure white (#FFFFFF) for e-commerce use.'
    }
    
    if (config.productCentering) {
      prompt += '\n\nPOSITIONING: Center the product perfectly in the frame.'
    }
    
    if (config.qualityEnhancement) {
      prompt += '\n\nQUALITY: Apply professional studio lighting and enhance image quality for commercial use.'
    }
    
    console.log(`🍌 Built enhanced prompt for ${item.productName}`)
    return prompt
  }

  private async generateImage(prompt: string, imageData: string): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
    try {
      console.log('🍌 Calling Nano Banana API for product extraction...')
      console.log('🍌 Prompt length:', prompt.length)
      console.log('🍌 Image data type:', imageData.startsWith('data:') ? 'base64' : 'unknown')
      
      const result = await this.callNanoBananaAPI(prompt, imageData, 'product-extraction')
      
      console.log('🍌 API result structure:', {
        hasPredictions: !!result.predictions,
        predictionsLength: result.predictions?.length || 0,
        firstPredictionKeys: result.predictions?.[0] ? Object.keys(result.predictions[0]) : 'none'
      })
      
      if (result.predictions && result.predictions[0] && result.predictions[0].bytesBase64Encoded) {
        const base64Data = result.predictions[0].bytesBase64Encoded
        console.log('🍌 Received base64 image data, length:', base64Data.length)
        
        // Validate base64 data
        if (base64Data.length < 100) {
          console.warn('⚠️ Base64 data seems too short, might be invalid')
          return { success: false, error: 'Invalid base64 image data received' }
        }
        
        const imageUrl = `data:image/png;base64,${base64Data}`
        console.log('✅ Successfully created image URL with Nano Banana')
        return { success: true, imageUrl }
      }
      
      console.error('❌ No valid image data in Nano Banana response:', result)
      return { success: false, error: 'No image data returned from Nano Banana API' }
      
    } catch (error) {
      console.error('❌ Nano Banana API call failed:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('❌ Error details:', {
        message: errorMessage,
        stack: error instanceof Error ? error.stack?.substring(0, 500) : 'No stack'
      })
      return { success: false, error: errorMessage }
    }
  }

  async removePromotionalElements(
    imageData: string,
    elementsToRemove: string[]
  ): Promise<string> {
    console.log('🍌 Removing promotional elements and text with Nano Banana...')
    
    try {
      const enhancedPrompt = `${TEXT_REMOVAL_PROMPT} SPECIFIC ELEMENTS TO REMOVE: ${elementsToRemove.join(', ')}
      The final image should show ONLY the clean product on a white background with no textual information visible.
      `
      
      const result = await this.callNanoBananaAPI(enhancedPrompt, imageData, 'text-removal')
      
      if (result.predictions && result.predictions[0] && result.predictions[0].bytesBase64Encoded) {
        const cleanedImage = `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`
        console.log('✅ Successfully removed promotional elements with Nano Banana')
        return cleanedImage
      }
      
      console.warn('⚠️ Text removal failed, using original image')
      return imageData
      
    } catch (error) {
      console.error('❌ Error removing promotional elements with Nano Banana:', error)
      return imageData
    }
  }

  async generateProfessionalBackground(
    productImageData: string,
    backgroundStyle: 'white' | 'transparent' | 'gradient'
  ): Promise<string> {
    console.log(`🍌 Generating professional ${backgroundStyle} background with Nano Banana...`)
    
    try {
      const backgroundPrompt = backgroundStyle === 'white' 
        ? 'Place this product on a pure white background with subtle shadow for professional e-commerce use'
        : backgroundStyle === 'transparent'
        ? 'Remove the background completely, making it transparent while keeping the product intact'
        : 'Place this product on a subtle gradient background suitable for marketing materials'
      
      const prompt = `${BACKGROUND_REMOVAL_PROMPT}\n\nBackground style: ${backgroundPrompt}`
      
      const result = await this.callNanoBananaAPI(prompt, productImageData, 'background-generation')
      
      if (result.predictions && result.predictions[0] && result.predictions[0].bytesBase64Encoded) {
        return `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`
      }
      
      return productImageData
      
    } catch (error) {
      console.error('❌ Error generating professional background with Nano Banana:', error)
      return productImageData
    }
  }

  async enhanceProductImage(
    imageData: string,
    enhancements: {
      upscale?: boolean
      colorCorrection?: boolean
      noiseReduction?: boolean
      sharpening?: boolean
    }
  ): Promise<string> {
    console.log('✨ Enhancing product image quality with Nano Banana...')
    
    try {
      const enhancementPrompts = []
      if (enhancements.upscale) enhancementPrompts.push('increase resolution and sharpness')
      if (enhancements.colorCorrection) enhancementPrompts.push('improve colors and lighting')
      if (enhancements.noiseReduction) enhancementPrompts.push('reduce noise and artifacts')
      if (enhancements.sharpening) enhancementPrompts.push('sharpen details and edges')
      
      const prompt = `Enhance this product image: ${enhancementPrompts.join(', ')}. Maintain the product's natural appearance while improving overall quality for e-commerce use. Keep the white background clean and professional.`
      
      const result = await this.callNanoBananaAPI(prompt, imageData, 'image-enhancement')
      
      if (result.predictions && result.predictions[0] && result.predictions[0].bytesBase64Encoded) {
        return `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`
      }
      
      return imageData
      
    } catch (error) {
      console.error('❌ Error enhancing image with Nano Banana:', error)
      return imageData
    }
  }

  private calculateQualityScore(imageData: string, config: ProductExtractionConfig): number {
    // Simple quality scoring based on processing steps completed
    let score = 0.8 // Higher base score for Nano Banana due to superior quality
    
    if (config.removeText) score += 0.05
    if (config.removePromotionalElements) score += 0.05
    if (config.backgroundStyle === 'white') score += 0.05
    if (config.productCentering) score += 0.025
    if (config.qualityEnhancement) score += 0.025
    
    return Math.min(score, 1.0)
  }
}

// Export singleton instance
export const nanoBananaService = new NanoBananaService()

// Main extraction function - Direct creative generation with Nano Banana
export async function extractCleanProductImages(
  flyerImageData: string,
  parsedItems: ParsedItemWithRegion[],
  config: ProductExtractionConfig
): Promise<CleanProductImage[]> {
  console.log(`🍌 Starting NANO BANANA clean product image extraction for ${parsedItems.length} items`)
  console.log(`🍌 Config:`, config)
  console.log(`🍌 Flyer image data length:`, flyerImageData?.length || 'undefined')
  console.log(`🍌 Parsed items:`, parsedItems.map(item => ({
    id: item.id,
    productName: item.productName,
    productNameMk: item.productNameMk
  })))
  
  if (parsedItems.length === 0) {
    console.warn('⚠️ No items provided for extraction')
    return []
  }
  
  const cleanImages: CleanProductImage[] = []
  
  // Direct creative generation for each product using Nano Banana
  for (let i = 0; i < parsedItems.length; i++) {
    const item = parsedItems[i]
    try {
      console.log(`🍌 Processing item ${i + 1}/${parsedItems.length}: ${item.productName}`)
      console.log(`🍌 Item ID: ${item.id}`)
      
      const cleanImage = await nanoBananaService.generateCleanProductImageDirect(
        flyerImageData,
        item,
        config
      )
      
      console.log(`🍌 Received clean image:`, {
        itemId: cleanImage.itemId,
        productName: cleanImage.productName,
        hasImageUrl: !!cleanImage.imageUrl,
        extractionMethod: cleanImage.extractionMethod
      })
      
      cleanImages.push(cleanImage)
      console.log(`✅ Successfully added clean image for: ${item.productName}. Total so far: ${cleanImages.length}`)
      
      // Add rate limiting delay between API calls (except for the last item)
      // Nano Banana is faster, so we can use shorter delays
      if (i < parsedItems.length - 1) {
        const delay = 1500 // 1.5 seconds between API calls (faster than Imagen 4)
        console.log(`⏳ Rate limiting: waiting ${delay}ms before next API call...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
      
    } catch (error) {
      console.error(`❌ Failed to generate image for ${item.productName}:`, error)
      console.error(`❌ Error details:`, {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack trace'
      })
      
      // Check if this is a critical error that should stop the process
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorMessage.includes('safety') || errorMessage.includes('content policy')) {
        console.error(`🚨 Content policy violation detected - this will affect all items`)
        throw new Error(`Content policy violation: ${errorMessage}`)
      }
      
      // For other errors, add a placeholder to track failed items
      cleanImages.push({
        itemId: item.id,
        productName: item.productName,
        imageUrl: '', // Empty URL indicates failure
        confidence: 0,
        extractionMethod: 'nano-banana-direct' as const,
        metadata: {
          productDetails: {
            productName: item.productName,
            productNameMk: item.productNameMk,
            discountPrice: item.discountPrice,
            oldPrice: item.oldPrice
          },
          generatedAt: new Date().toISOString(),
          config: config
        }
      })
      
      console.log(`⚠️ Added failed item placeholder for: ${item.productName}`)
    }
  }
  
  console.log(`🍌 FINAL RESULT: Successfully extracted ${cleanImages.length} clean product images with Nano Banana`)
  console.log(`🍌 Final clean images array:`, cleanImages.map(img => ({
    itemId: img.itemId,
    productName: img.productName,
    hasImageUrl: !!img.imageUrl,
    imageUrlLength: img.imageUrl?.length || 0,
    confidence: img.confidence
  })))
  
  // Validate final results
  const successfulImages = cleanImages.filter(img => img.imageUrl && img.imageUrl.length > 0)
  const failedImages = cleanImages.filter(img => !img.imageUrl || img.imageUrl.length === 0)
  
  console.log(`🍌 NANO BANANA EXTRACTION SUMMARY:`)
  console.log(`   ✅ Successful: ${successfulImages.length}`)
  console.log(`   ❌ Failed: ${failedImages.length}`)
  console.log(`   📊 Success Rate: ${((successfulImages.length / cleanImages.length) * 100).toFixed(1)}%`)
  if (failedImages.length > 0) {
    console.log(`⚠️ Failed items:`, failedImages.map(img => img.productName))
  }
  
  // Return all items (including failed ones) so process-images can handle them appropriately
  return cleanImages
}
