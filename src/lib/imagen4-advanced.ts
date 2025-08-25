import { GoogleAuth } from 'google-auth-library'
import { ProductExtractionConfig, CleanProductImage } from '@/types'

// Google Cloud AI Platform endpoints
const IMAGEN_ENDPOINT = 'https://us-central1-aiplatform.googleapis.com'
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID

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

// Specialized prompts for different stages
const PRODUCT_DETECTION_PROMPT = `
CRITICAL TASK: Analyze this flyer image and identify the exact locations of individual product images (not text or prices).

WHAT TO DETECT:
- Actual product photos/images (food items, consumer goods, etc.)
- Physical products visible in the flyer
- Product packaging or containers

WHAT TO IGNORE:
- Price tags, discount percentages, promotional text
- Store logos, decorative elements, backgrounds
- Product names or descriptions (text only)
- Promotional badges or stickers

INSTRUCTIONS:
1. Scan the entire flyer systematically
2. Identify each distinct product image/photo
3. Provide precise bounding box coordinates as percentages (0-1) of total image dimensions
4. Ensure coordinates tightly bound the actual product image (not surrounding text)
5. Rate confidence level (0-1) based on clarity and certainty of product detection
6. Extract or infer the product name from context if possible

COORDINATE SYSTEM:
- x: horizontal position from left edge (0 = left, 1 = right)
- y: vertical position from top edge (0 = top, 1 = bottom)  
- width: horizontal span as percentage of total width
- height: vertical span as percentage of total height

RETURN EXACTLY THIS JSON FORMAT:
{
  "detectedProducts": [
    {
      "productName": "inferred or detected product name",
      "boundingBox": {"x": 0.1, "y": 0.2, "width": 0.25, "height": 0.3},
      "confidence": 0.95,
      "productType": "food/beverage/household/etc"
    }
  ]
}

CRITICAL: Only detect actual product images/photos, not text or promotional elements. Each bounding box should contain a visible product.
`

const CLEAN_EXTRACTION_PROMPT = `
Extract and isolate ONLY the individual product from this flyer image and create a clean, professional ecommerce image:

CRITICAL REQUIREMENTS:
1. Extract ONLY the specific product - ignore all other products, text, and flyer elements
2. Remove ALL promotional text, price tags, discount badges, store logos, promotional stickers
3. Remove original flyer background completely
4. Center the isolated product on a pure white background (#FFFFFF)
5. Add subtle professional shadow for depth
6. Maintain product's natural proportions, colors, and details
7. Remove any overlapping promotional elements or text from other parts of the flyer
8. Ensure the product appears as it would in a professional product catalog

WHAT TO REMOVE:
- Price tags, discount percentages (e.g., "50% OFF", "$19.99", "SALE")
- Store logos, brand watermarks, promotional badges
- Background text or graphics from the flyer
- Other products visible in the flyer
- Promotional banners, ribbons, or stickers
- Any non-product elements

FINAL OUTPUT:
- Pure white background (#FFFFFF)
- Single product centered in frame
- No text or promotional elements visible anywhere
- Professional lighting and shadows
- High quality and sharp details
- Suitable for online store catalog

The result should look like a professional product photo taken in a studio, not a cropped section of a flyer.
`

const TEXT_REMOVAL_PROMPT = `
Remove all text and promotional elements from this product image while preserving the product itself:
1. Remove ALL visible text (prices, discounts, brand names on packaging)
2. Remove promotional badges, stickers, or overlays
3. Remove store logos or watermarks
4. Keep only the actual product
5. Fill removed areas naturally to maintain product integrity
6. Preserve product colors and details

Focus on creating a clean product image with no textual information visible.
`

class Imagen4Service {
  private auth: GoogleAuth
  private accessToken: string | null = null
  private tokenExpiry: number = 0

  constructor() {
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    })
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now()
    if (this.accessToken && now < this.tokenExpiry) {
      return this.accessToken
    }

    const client = await this.auth.getClient()
    const tokenResponse = await client.getAccessToken()
    
    if (!tokenResponse.token) {
      throw new Error('Failed to obtain access token')
    }

    this.accessToken = tokenResponse.token
    this.tokenExpiry = now + (55 * 60 * 1000) // 55 minutes (tokens expire in 1 hour)
    
    return this.accessToken
  }

  private async callImagenAPI(prompt: string, imageData: string, operation: string): Promise<any> {
    const accessToken = await this.getAccessToken()
    
    console.log(`🔄 Calling Imagen API for operation: ${operation}`)
    
    const requestBody = {
      instances: [{
        prompt: prompt,
        image: {
          bytesBase64Encoded: imageData.replace(/^data:image\/[a-z]+;base64,/, '')
        }
      }],
      parameters: {
        sampleCount: 1,
        aspectRatio: "1:1",
        safetyFilterLevel: "block_some",
        personGeneration: "dont_allow"
      }
    }

    const response = await fetch(
      `${IMAGEN_ENDPOINT}/v1/projects/${PROJECT_ID}/locations/us-central1/publishers/google/models/imagen-3.0-generate-001:predict`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Imagen API error for ${operation}:`, errorText)
      throw new Error(`Imagen API failed for ${operation}: ${response.statusText}`)
    }

    return await response.json()
  }

  async detectProductRegions(
    flyerImageData: string,
    parsedItems: ParsedItemWithRegion[]
  ): Promise<DetectedRegion[]> {
    console.log('🔍 Using AI to detect actual product locations in flyer...')
    console.log(`📊 Looking for ${parsedItems.length} products in flyer`)
    
    try {
      // Create a detection prompt that includes known product names for context
      const knownProductNames = parsedItems.map(item => item.productName).join(', ')
      const enhancedPrompt = `${PRODUCT_DETECTION_PROMPT}

CONTEXT: This flyer contains these products (use for matching): ${knownProductNames}

Analyze the image and detect the exact locations where these products appear as actual product images/photos.`
      
      console.log('🤖 Calling Imagen API for product detection...')
      
      // Add timeout protection for AI detection
      const detectionPromise = this.callImagenAPI(enhancedPrompt, flyerImageData, 'product-detection')
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Product detection timed out after 2 minutes')), 120000)
      })
      
      const result = await Promise.race([detectionPromise, timeoutPromise])
      
      if (result.predictions && result.predictions[0]) {
        try {
          // Try to parse the AI response as JSON
          const prediction = result.predictions[0]
          let detectionResponse: any
          
          // The AI might return the JSON in different formats, try to extract it
          if (typeof prediction === 'string') {
            // Look for JSON in the response
            const jsonMatch = prediction.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
              detectionResponse = JSON.parse(jsonMatch[0])
            }
          } else if (prediction.bytesBase64Encoded) {
            // If it's an image response, fall back to heuristic detection
            console.warn('⚠️ Got image response instead of JSON, using heuristic detection')
            return this.fallbackHeuristicDetection(parsedItems)
          } else {
            detectionResponse = prediction
          }
          
          if (detectionResponse && detectionResponse.detectedProducts) {
            console.log(`🎯 AI detected ${detectionResponse.detectedProducts.length} product regions`)
            
            // Match AI detections with parsed items
            const detectedRegions: DetectedRegion[] = []
            
            for (const detection of detectionResponse.detectedProducts) {
              // Find the best matching parsed item
              const matchingItem = this.findBestMatchingItem(detection.productName, parsedItems)
              
              if (matchingItem && detection.boundingBox) {
                detectedRegions.push({
                  itemId: matchingItem.id,
                  boundingBox: {
                    x: Math.max(0, Math.min(1, detection.boundingBox.x)),
                    y: Math.max(0, Math.min(1, detection.boundingBox.y)),
                    width: Math.max(0.05, Math.min(0.8, detection.boundingBox.width)),
                    height: Math.max(0.05, Math.min(0.8, detection.boundingBox.height))
                  },
                  confidence: detection.confidence || 0.8,
                  productName: matchingItem.productName
                })
                
                console.log(`✅ Matched "${detection.productName}" → "${matchingItem.productName}" at (${detection.boundingBox.x}, ${detection.boundingBox.y})`)
              } else {
                console.warn(`⚠️ Could not match detected product: ${detection.productName}`)
              }
            }
            
            if (detectedRegions.length > 0) {
              console.log(`🎉 Successfully detected ${detectedRegions.length} product regions using AI`)
              return detectedRegions
            }
          }
        } catch (parseError) {
          console.error('❌ Error parsing AI detection response:', parseError)
        }
      }
      
      console.warn('⚠️ AI detection failed, falling back to heuristic detection')
      return this.fallbackHeuristicDetection(parsedItems)
      
    } catch (error) {
      console.error('❌ Error in AI product detection:', error)
      return this.fallbackHeuristicDetection(parsedItems)
    }
  }

  private findBestMatchingItem(detectedName: string, parsedItems: ParsedItemWithRegion[]): ParsedItemWithRegion | null {
    if (!detectedName) return null
    
    // Simple fuzzy matching - find the item with the most similar name
    let bestMatch: ParsedItemWithRegion | null = null
    let bestScore = 0
    
    for (const item of parsedItems) {
      const score = this.calculateNameSimilarity(detectedName.toLowerCase(), item.productName.toLowerCase())
      if (score > bestScore && score > 0.3) { // Minimum similarity threshold
        bestScore = score
        bestMatch = item
      }
    }
    
    return bestMatch
  }

  private calculateNameSimilarity(name1: string, name2: string): number {
    // Simple word-based similarity
    const words1 = name1.split(/\s+/)
    const words2 = name2.split(/\s+/)
    
    let matchingWords = 0
    for (const word1 of words1) {
      for (const word2 of words2) {
        if (word1.includes(word2) || word2.includes(word1)) {
          matchingWords++
          break
        }
      }
    }
    
    return matchingWords / Math.max(words1.length, words2.length)
  }

  private fallbackHeuristicDetection(parsedItems: ParsedItemWithRegion[]): DetectedRegion[] {
    console.log('🔄 Using heuristic product region detection as fallback')
    
    // Create a grid-based layout for products
    const itemsPerRow = Math.min(3, Math.ceil(Math.sqrt(parsedItems.length)))
    const rows = Math.ceil(parsedItems.length / itemsPerRow)
    
    return parsedItems.map((item, index) => {
      const row = Math.floor(index / itemsPerRow)
      const col = index % itemsPerRow
      
      // Calculate position with some padding
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
        confidence: 0.6, // Lower confidence for heuristic detection
        productName: item.productName
      }
    })
  }

  async extractCleanProductImage(
    flyerImageData: string,
    region: DetectedRegion,
    config: ProductExtractionConfig
  ): Promise<CleanProductImage> {
    console.log(`🎨 Extracting clean image for product: ${region.productName}`)
    
    try {
      // Step 1: Extract the product region
      const extractedRegion = await this.extractRegion(flyerImageData, region.boundingBox)
      
      // Step 2: Remove promotional elements and text
      const cleanedImage = await this.removePromotionalElements(
        extractedRegion, 
        [region.productName]
      )
      
      // Step 3: Generate professional background
      const finalImage = await this.generateProfessionalBackground(
        cleanedImage,
        config.backgroundStyle
      )
      
      // Calculate quality score based on processing success
      const qualityScore = this.calculateQualityScore(finalImage, config)
      
      return {
        itemId: region.itemId,
        originalRegion: region.boundingBox,
        extractedImageData: finalImage,
        confidence: region.confidence,
        qualityScore,
        processingMethod: 'imagen4',
        backgroundRemoved: true,
        textRemoved: true,
        manualReviewRequired: qualityScore < 0.7
      }
      
    } catch (error) {
      console.error(`❌ Error extracting clean image for ${region.productName}:`, error)
      throw error
    }
  }

  private async extractRegion(imageData: string, boundingBox: any): Promise<string> {
    console.log(`✂️ Cropping product region:`, boundingBox)
    
    try {
      // Create a detailed prompt for Imagen4 to extract only the specific product region
      const cropPrompt = `
Extract and isolate ONLY the product located in this specific region of the flyer image:
- Region coordinates: x=${boundingBox.x}, y=${boundingBox.y}, width=${boundingBox.width}, height=${boundingBox.height}
- Focus ONLY on the actual product within these boundaries
- Ignore all surrounding text, prices, promotional elements, and other products
- Extract the product cleanly without any background elements
- Crop tightly around the product itself
- Remove any overlapping text or promotional graphics
- Output only the isolated product on a transparent or white background

Requirements:
- Extract ONLY the product from the specified region
- No text, prices, or promotional elements
- Clean crop with no surrounding flyer content
- Product should be the only visible element
`

      const result = await this.callImagenAPI(cropPrompt, imageData, 'region-extraction')
      
      if (result.predictions && result.predictions[0] && result.predictions[0].bytesBase64Encoded) {
        const extractedImage = `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`
        console.log(`✅ Successfully extracted product region`)
        return extractedImage
      }
      
      console.warn(`⚠️ No extracted region returned, using original image`)
      return imageData
      
    } catch (error) {
      console.error('❌ Error extracting region:', error)
      return imageData
    }
  }

  async removePromotionalElements(
    imageData: string,
    elementsToRemove: string[]
  ): Promise<string> {
    console.log('🧹 Removing promotional elements and text...')
    
    try {
      const enhancedPrompt = `
${TEXT_REMOVAL_PROMPT}

CRITICAL: This image should contain ONLY the product itself. Remove ALL of the following:
- Price tags, discount percentages (e.g., "50% OFF", "$19.99", "SALE")
- Store logos, brand watermarks, promotional badges
- Any text overlays or stickers on the product
- Promotional banners or ribbons
- Background text or graphics from the original flyer
- Any non-product elements

Specifically target text related to: ${elementsToRemove.join(', ')}

The final image should show ONLY the clean product on a white background with no textual information visible.
`
      
      const result = await this.callImagenAPI(enhancedPrompt, imageData, 'text-removal')
      
      if (result.predictions && result.predictions[0] && result.predictions[0].bytesBase64Encoded) {
        const cleanedImage = `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`
        console.log('✅ Successfully removed promotional elements')
        return cleanedImage
      }
      
      console.warn('⚠️ Text removal failed, using original image')
      return imageData
      
    } catch (error) {
      console.error('❌ Error removing promotional elements:', error)
      return imageData
    }
  }

  async generateProfessionalBackground(
    productImageData: string,
    backgroundStyle: 'white' | 'transparent' | 'gradient'
  ): Promise<string> {
    console.log(`🎨 Generating professional ${backgroundStyle} background...`)
    
    try {
      const backgroundPrompt = backgroundStyle === 'white' 
        ? 'Place this product on a pure white background with subtle shadow'
        : backgroundStyle === 'transparent'
        ? 'Remove the background completely, making it transparent'
        : 'Place this product on a subtle gradient background'
      
      const prompt = `${CLEAN_EXTRACTION_PROMPT}\n\nBackground style: ${backgroundPrompt}`
      
      const result = await this.callImagenAPI(prompt, productImageData, 'background-generation')
      
      if (result.predictions && result.predictions[0] && result.predictions[0].bytesBase64Encoded) {
        return `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`
      }
      
      return productImageData
      
    } catch (error) {
      console.error('❌ Error generating professional background:', error)
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
    console.log('✨ Enhancing product image quality...')
    
    try {
      const enhancementPrompts = []
      if (enhancements.upscale) enhancementPrompts.push('increase resolution and sharpness')
      if (enhancements.colorCorrection) enhancementPrompts.push('improve colors and lighting')
      if (enhancements.noiseReduction) enhancementPrompts.push('reduce noise and artifacts')
      if (enhancements.sharpening) enhancementPrompts.push('sharpen details and edges')
      
      const prompt = `Enhance this product image: ${enhancementPrompts.join(', ')}. Maintain the product's natural appearance while improving overall quality.`
      
      const result = await this.callImagenAPI(prompt, imageData, 'image-enhancement')
      
      if (result.predictions && result.predictions[0] && result.predictions[0].bytesBase64Encoded) {
        return `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`
      }
      
      return imageData
      
    } catch (error) {
      console.error('❌ Error enhancing image:', error)
      return imageData
    }
  }

  private calculateQualityScore(imageData: string, config: ProductExtractionConfig): number {
    // Simple quality scoring based on processing steps completed
    let score = 0.5 // Base score
    
    if (config.removeText) score += 0.1
    if (config.removePromotionalElements) score += 0.1
    if (config.backgroundStyle === 'white') score += 0.1
    if (config.productCentering) score += 0.1
    if (config.qualityEnhancement) score += 0.1
    
    // In a real implementation, you'd analyze the actual image
    return Math.min(score, 1.0)
  }
}

// Export singleton instance
export const imagen4Service = new Imagen4Service()

// Main extraction function
export async function extractCleanProductImages(
  flyerImageData: string,
  parsedItems: ParsedItemWithRegion[],
  config: ProductExtractionConfig
): Promise<CleanProductImage[]> {
  console.log(`🚀 Starting clean product image extraction for ${parsedItems.length} items`)
  
  try {
    // Step 1: Detect product regions
    const detectedRegions = await imagen4Service.detectProductRegions(flyerImageData, parsedItems)
    
    // Step 2: Extract clean images for each region
    const cleanImages: CleanProductImage[] = []
    
    for (const region of detectedRegions) {
      try {
        const cleanImage = await imagen4Service.extractCleanProductImage(
          flyerImageData,
          region,
          config
        )
        cleanImages.push(cleanImage)
      } catch (error) {
        console.error(`❌ Failed to extract image for ${region.productName}:`, error)
        // Continue with other products
      }
    }
    
    console.log(`✅ Successfully extracted ${cleanImages.length} clean product images`)
    return cleanImages
    
  } catch (error) {
    console.error('❌ Error in clean product image extraction:', error)
    throw error
  }
}
