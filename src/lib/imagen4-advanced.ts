import { GoogleAuth } from 'google-auth-library'
import { ProductExtractionConfig, CleanProductImage } from '@/types'
import { appConfigServer } from '@/lib/config.server'

// Google Cloud AI Platform endpoints
const IMAGEN_ENDPOINT = 'https://us-central1-aiplatform.googleapis.com'
const PROJECT_ID = appConfigServer.firebase.projectId

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
CRITICAL TASK: Analyze this flyer image and identify the locations of individual product images that can be extracted and converted into clean e-commerce product photos.

WHAT TO DETECT:
- Actual product photos/images (food items, beverages, consumer goods, etc.)
- Physical products with clear visual details
- Product packaging, containers, or items with distinct shapes
- Products that would make good standalone e-commerce images

WHAT TO IGNORE:
- Price tags, discount percentages, promotional text
- Store logos, decorative elements, backgrounds
- Product names or descriptions (text only)
- Promotional badges, stickers, or sale banners
- Products that are too small, blurry, or partially obscured

DETECTION STRATEGY:
1. Scan the flyer systematically from top-left to bottom-right
2. Identify each distinct product that has sufficient visual detail
3. Focus on products that can be cleanly separated from the background
4. Provide approximate bounding box coordinates as percentages (0-1)
5. Prioritize products with clear, unobstructed views
6. Rate confidence based on product visibility and extraction potential

COORDINATE SYSTEM:
- x: horizontal position from left edge (0 = left, 1 = right)
- y: vertical position from top edge (0 = top, 1 = bottom)  
- width: horizontal span as percentage of total width
- height: vertical span as percentage of total height

IMPORTANT: Focus on products that Imagen4 can successfully extract and convert into professional product images.

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

const PROFESSIONAL_PRODUCT_PROMPT = `
A studio photo of PRODUCT_NAME, 100mm macro lens, natural lighting, 4K, HDR, high-quality, beautiful, professional product photography, white background, centered composition, soft shadows, commercial photography
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
    // Use centralized server configuration
    const serviceAccountPath = appConfigServer.firebase.serviceAccountPath || './firebase-service-account.json'
    
    // Configure authentication with multiple fallback options
    const authConfig: any = {
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      projectId: PROJECT_ID
    }
    
    // Use service account file if available
    if (serviceAccountPath) {
      authConfig.keyFilename = serviceAccountPath
    }
    
    // Fallback to client credentials if available
    if (appConfigServer.firebase.clientEmail && appConfigServer.firebase.privateKey) {
      authConfig.credentials = {
        client_email: appConfigServer.firebase.clientEmail,
        private_key: appConfigServer.firebase.privateKey.replace(/\\n/g, '\n')
      }
    }
    
    this.auth = new GoogleAuth(authConfig)
    
    console.log(`🔐 Imagen4Service initialized with project: ${PROJECT_ID}`)
    console.log(`🔐 Using service account: ${serviceAccountPath || 'environment credentials'}`)
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now()
    if (this.accessToken && now < this.tokenExpiry) {
      return this.accessToken
    }

    try {
      console.log('🔐 Attempting to get Google Cloud access token...')
      const client = await this.auth.getClient()
      const tokenResponse = await client.getAccessToken()
      
      if (!tokenResponse.token) {
        throw new Error('Failed to obtain access token')
      }

      this.accessToken = tokenResponse.token
      this.tokenExpiry = now + (55 * 60 * 1000) // 55 minutes (tokens expire in 1 hour)
      
      console.log('✅ Successfully obtained Google Cloud access token')
      return this.accessToken
    } catch (error) {
      console.error('❌ Failed to get Google Cloud access token:', error)
      console.error('💡 Make sure GOOGLE_APPLICATION_CREDENTIALS is set or firebase-service-account.json exists')
      console.error('💡 Project ID:', PROJECT_ID)
      throw error
    }
  }

  private async callImagenAPI(prompt: string, imageData: string, operation: string): Promise<any> {
    const maxRetries = 3
    const baseDelay = 1000 // 1 second
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const accessToken = await this.getAccessToken()
        
        console.log(`🔄 Calling Imagen API for operation: ${operation} (attempt ${attempt}/${maxRetries})`)
        console.log(`🔄 Prompt: "${prompt.substring(0, 100)}..."`)
        
        // Validate input data
        if (!prompt || prompt.trim().length === 0) {
          throw new Error('Prompt is empty or invalid')
        }
        
        if (!imageData || !imageData.includes('base64')) {
          throw new Error('Image data is missing or invalid format')
        }
        
        const cleanBase64 = imageData.replace(/^data:image\/[a-z]+;base64,/, '')
        if (cleanBase64.length < 100) {
          throw new Error('Base64 image data is too short, likely invalid')
        }
        
        console.log(`🔄 Base64 data length: ${cleanBase64.length}`)
        
        // Use image-to-image with flyer input but force photorealistic output
        const requestBody = {
          instances: [{
            prompt: prompt,
            image: {
              bytesBase64Encoded: cleanBase64
            }
          }],
          parameters: {
            sampleCount: 1,
            aspectRatio: "1:1",
            safetyFilterLevel: "block_some",
            personGeneration: "dont_allow"
          }
        }
        
        console.log(`🔄 Request body structure:`, {
          instancesCount: requestBody.instances.length,
          promptLength: requestBody.instances[0].prompt.length,
          mode: 'image-to-image',
          hasImageData: !!requestBody.instances[0].image.bytesBase64Encoded,
          imageDataLength: requestBody.instances[0].image.bytesBase64Encoded.length,
          aspectRatio: requestBody.parameters.aspectRatio
        })

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

        if (response.ok) {
          console.log(`✅ Imagen API call successful for ${operation}`)
          return await response.json()
        }

        const errorText = await response.text()
        let errorData
        try {
          errorData = JSON.parse(errorText)
        } catch {
          errorData = { error: { message: errorText } }
        }

        console.error(`Imagen API error for ${operation} (attempt ${attempt}):`, errorData)

        // Handle specific error types
        if (response.status === 429) {
          // Quota exceeded - implement exponential backoff
          const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000
          console.warn(`⏳ Quota exceeded for ${operation}. Retrying in ${Math.round(delay)}ms...`)
          
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
          } else {
            throw new Error(`Quota exceeded for ${operation}. Please check your Google Cloud quotas and try again later.`)
          }
        } else if (response.status >= 500) {
          // Server error - retry with backoff
          const delay = baseDelay * Math.pow(2, attempt - 1)
          console.warn(`🔄 Server error for ${operation}. Retrying in ${Math.round(delay)}ms...`)
          
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
          }
        }

        // For other errors or final attempt, throw immediately
        throw new Error(`Imagen API failed for ${operation}: ${response.status} ${response.statusText}`)

      } catch (error) {
        if (attempt === maxRetries) {
          console.error(`❌ Final attempt failed for ${operation}:`, error)
          throw error
        }
        
        // For network errors, retry with backoff
        const delay = baseDelay * Math.pow(2, attempt - 1)
        console.warn(`🔄 Network error for ${operation}. Retrying in ${Math.round(delay)}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    throw new Error(`All retry attempts failed for ${operation}`)
  }

  async detectProductRegions(
    flyerImageData: string,
    parsedItems: ParsedItemWithRegion[]
  ): Promise<DetectedRegion[]> {
    console.log('🔍 Using AI to detect actual product locations in flyer...')
    console.log(`📊 Looking for ${parsedItems.length} products in flyer`)
    
    // Debug logging for input validation
    if (parsedItems.length === 0) {
      console.warn('⚠️ No parsed items provided for detection')
      return []
    }
    
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
      const fallbackRegions = this.fallbackHeuristicDetection(parsedItems)
      console.log(`🔄 Fallback detection created ${fallbackRegions.length} regions`)
      return fallbackRegions
    
    } catch (error) {
      console.error('❌ Error in AI product detection:', error)
      const fallbackRegions = this.fallbackHeuristicDetection(parsedItems)
      console.log(`🔄 Error fallback detection created ${fallbackRegions.length} regions`)
      return fallbackRegions
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
    console.log(`📊 Heuristic input: ${parsedItems.length} items`)
    
    if (parsedItems.length === 0) {
      console.warn('⚠️ No items provided to heuristic detection')
      return []
    }
    
    // Create a grid-based layout for products
    const itemsPerRow = Math.min(3, Math.ceil(Math.sqrt(parsedItems.length)))
    const rows = Math.ceil(parsedItems.length / itemsPerRow)
    
    console.log(`📐 Grid layout: ${itemsPerRow} items per row, ${rows} rows`)
    
    const regions = parsedItems.map((item, index) => {
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
    
    console.log(`✅ Heuristic detection created ${regions.length} regions`)
    return regions
  }

  async generateCleanProductImageDirect(
    flyerImageData: string,
    item: ParsedItemWithRegion,
    config: ProductExtractionConfig
  ): Promise<CleanProductImage> {
    console.log(`🎨 Direct creative generation for: ${item.productName}`)
    console.log(`🎨 Item details:`, {
      id: item.id,
      productName: item.productName,
      productNameMk: item.productNameMk
    })

    try {
      // Build enhanced prompt with product details
      const prompt = this.buildDirectCreativePrompt(item, config)
      console.log(`🎨 Generated prompt:`, prompt)
      console.log(`🎨 Flyer image data length:`, flyerImageData?.length || 'undefined')
      
      const response = await this.generateImage(prompt, flyerImageData)
      console.log(`🎨 API response:`, {
        success: response.success,
        hasImageUrl: !!response.imageUrl,
        error: response.error
      })
      
      if (!response.success || !response.imageUrl) {
        const errorMsg = `Failed to generate clean product image: ${response.error}`
        console.error(`❌ ${errorMsg}`)
        throw new Error(errorMsg)
      }

      console.log(`✅ Successfully generated professional product image using direct creative mode`)
      
      const cleanImage = {
        itemId: item.id,
        productName: item.productName,
        imageUrl: response.imageUrl,
        confidence: 0.9, // High confidence for direct generation
        extractionMethod: 'imagen4-direct-creative' as const,
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
      
      console.log(`✅ Created clean image object:`, {
        itemId: cleanImage.itemId,
        productName: cleanImage.productName,
        hasImageUrl: !!cleanImage.imageUrl,
        confidence: cleanImage.confidence
      })
      
      return cleanImage
    } catch (error) {
      console.error(`❌ Error in direct creative generation for ${item.productName}:`, error)
      console.error(`❌ Error stack:`, error instanceof Error ? error.stack : 'No stack trace')
      throw error
    }
  }

  private async extractRegion(imageData: string, boundingBox: any): Promise<string> {
    console.log(`🎨 Using Imagen4 in full creative mode to generate product from region:`, boundingBox)
    
    try {
      // Use Imagen4's full generative power to create a professional product image
      const creativeExtractionPrompt = `
CREATIVE PRODUCT GENERATION TASK:

You are looking at a grocery flyer/advertisement. I want you to focus on the product located in this approximate area:
- Horizontal position: ${Math.round(boundingBox.x * 100)}% from the left edge
- Vertical position: ${Math.round(boundingBox.y * 100)}% from the top edge  
- Area size: ${Math.round(boundingBox.width * 100)}% wide by ${Math.round(boundingBox.height * 100)}% tall

YOUR MISSION:
1. IDENTIFY what product is in that region (food item, beverage, household product, etc.)
2. RECREATE that exact product as a clean, professional e-commerce photo
3. IGNORE everything else in the flyer - prices, text, other products, backgrounds, promotional elements

CREATIVE GENERATION REQUIREMENTS:
✨ Generate a brand new, professional product photo of the identified item
✨ Pure white background (#FFFFFF) - no flyer elements whatsoever  
✨ Perfect studio lighting with soft shadows
✨ Product centered and properly sized in frame
✨ High-quality, crisp details and accurate colors
✨ Professional e-commerce photography style
✨ No text, prices, logos, or promotional elements anywhere
✨ Single product only - no other items visible

QUALITY STANDARDS:
- Looks like it was shot in a professional photography studio
- Suitable for Amazon, grocery store websites, or premium catalogs
- Clean, minimalist, and focused entirely on the product
- Proper proportions and realistic appearance
- Commercial photography quality

Think of this as: "Take the product concept from this flyer region and create a perfect studio photo of it"
`

      const result = await this.callImagenAPI(creativeExtractionPrompt, imageData, 'creative-product-generation')
      
      if (result.predictions && result.predictions[0] && result.predictions[0].bytesBase64Encoded) {
        const generatedImage = `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`
        console.log(`✅ Successfully generated professional product image using Imagen4 creative mode`)
        return generatedImage
      }
      
      throw new Error('Imagen4 creative generation failed - no valid image returned')
      
    } catch (error) {
      console.error('❌ Error in Imagen4 creative product generation:', error)
      throw error
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

  // Policy-compliant creative prompt for direct generation
private buildDirectCreativePrompt(item: ParsedItemWithRegion, config: ProductExtractionConfig): string {
  // Visual extraction prompt - focus on what's actually in the image
  let finalPrompt = `Look at this grocery flyer image and find the product that matches "${item.productName}". Extract ONLY that specific product and clean it up.

VISUAL EXTRACTION TASK:
1. SCAN the flyer image to locate the product labeled or matching "${item.productName}"
2. EXTRACT only that specific product from the image
3. REMOVE all text, price tags, promotional stickers, discount badges
4. REMOVE the flyer background completely  
5. PLACE the extracted product on a clean white background
6. KEEP the exact same product appearance - same colors, same packaging, same shape, same size
7. DO NOT change the product itself - only remove text and background
8. DO NOT generate a different product - use exactly what's shown in the flyer

The result should be the SAME EXACT PRODUCT from the flyer but cleaned up for e-commerce use. Professional studio lighting, white background, no text visible.`
  
  // Add alternative product name if available for better recognition
  if (item.productNameMk && item.productNameMk !== item.productName) {
    finalPrompt += `\n- Alternative product name: ${item.productNameMk}`
  }
  
  console.log(`🎨 Built enhanced prompt for ${item.productName}:`, finalPrompt)
  return finalPrompt
}

  // Simplified generate image method using existing API
  private async generateImage(prompt: string, imageData: string): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
    try {
      console.log('🎨 Calling Imagen4 API for direct creative generation...')
      console.log('🎨 Prompt length:', prompt.length)
      console.log('🎨 Image data type:', imageData.startsWith('data:') ? 'base64' : 'unknown')
      
      const result = await this.callImagenAPI(prompt, imageData, 'direct-creative-generation')
      
      console.log('🎨 API result structure:', {
        hasPredictions: !!result.predictions,
        predictionsLength: result.predictions?.length || 0,
        firstPredictionKeys: result.predictions?.[0] ? Object.keys(result.predictions[0]) : 'none'
      })
      
      if (result.predictions && result.predictions[0] && result.predictions[0].bytesBase64Encoded) {
        const base64Data = result.predictions[0].bytesBase64Encoded
        console.log('🎨 Received base64 image data, length:', base64Data.length)
        
        // Validate base64 data
        if (base64Data.length < 100) {
          console.warn('⚠️ Base64 data seems too short, might be invalid')
          return { success: false, error: 'Invalid base64 image data received' }
        }
        
        const imageUrl = `data:image/png;base64,${base64Data}`
        console.log('✅ Successfully created image URL')
        return { success: true, imageUrl }
      }
      
      console.error('❌ No valid image data in API response:', result)
      return { success: false, error: 'No image data returned from API' }
      
    } catch (error) {
      console.error('❌ Imagen4 API call failed:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('❌ Error details:', {
        message: errorMessage,
        stack: error instanceof Error ? error.stack?.substring(0, 500) : 'No stack'
      })
      return { success: false, error: errorMessage }
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

// Simplified main extraction function - Direct creative generation
export async function extractCleanProductImages(
  flyerImageData: string,
  parsedItems: ParsedItemWithRegion[],
  config: ProductExtractionConfig
): Promise<CleanProductImage[]> {
  console.log(`🚀 Starting SIMPLIFIED clean product image extraction for ${parsedItems.length} items`)
  console.log(`🚀 Config:`, config)
  console.log(`🚀 Flyer image data length:`, flyerImageData?.length || 'undefined')
  console.log(`🚀 Parsed items:`, parsedItems.map(item => ({
    id: item.id,
    productName: item.productName,
    productNameMk: item.productNameMk
  })))
  
  if (parsedItems.length === 0) {
    console.warn('⚠️ No items provided for extraction')
    return []
  }
  
  const cleanImages: CleanProductImage[] = []
  
  // Direct creative generation for each product - no region detection needed!
  for (let i = 0; i < parsedItems.length; i++) {
    const item = parsedItems[i]
    try {
      console.log(`🎨 Processing item ${i + 1}/${parsedItems.length}: ${item.productName}`)
      console.log(`🎨 Item ID: ${item.id}`)
      
      const cleanImage = await imagen4Service.generateCleanProductImageDirect(
        flyerImageData,
        item,
        config
      )
      
      console.log(`🎨 Received clean image:`, {
        itemId: cleanImage.itemId,
        productName: cleanImage.productName,
        hasImageUrl: !!cleanImage.imageUrl,
        extractionMethod: cleanImage.extractionMethod
      })
      
      cleanImages.push(cleanImage)
      console.log(`✅ Successfully added clean image for: ${item.productName}. Total so far: ${cleanImages.length}`)
      
      // Add rate limiting delay between API calls (except for the last item)
      if (i < parsedItems.length - 1) {
        const delay = 3000 // 3 seconds between API calls
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
      if (errorMessage.includes('content policy') || errorMessage.includes('58061214')) {
        console.error(`🚨 Content policy violation detected - this will affect all items`)
        throw new Error(`Content policy violation: ${errorMessage}`)
      }
      
      // For other errors, add a placeholder to track failed items
      cleanImages.push({
        itemId: item.id,
        productName: item.productName,
        imageUrl: '', // Empty URL indicates failure
        confidence: 0,
        extractionMethod: 'imagen4-direct-creative' as const,
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
  
  console.log(`🎯 FINAL RESULT: Successfully extracted ${cleanImages.length} clean product images`)
  console.log(`🎯 Final clean images array:`, cleanImages.map(img => ({
    itemId: img.itemId,
    productName: img.productName,
    hasImageUrl: !!img.imageUrl,
    imageUrlLength: img.imageUrl?.length || 0,
    confidence: img.confidence
  })))
  
  // Validate final results
  const successfulImages = cleanImages.filter(img => img.imageUrl && img.imageUrl.length > 0)
  const failedImages = cleanImages.filter(img => !img.imageUrl || img.imageUrl.length === 0)
  
  console.log(`🎯 EXTRACTION SUMMARY:`)
  console.log(`   ✅ Successful: ${successfulImages.length}`)
  console.log(`   ❌ Failed: ${failedImages.length}`)
  console.log(`   📊 Success Rate: ${((successfulImages.length / cleanImages.length) * 100).toFixed(1)}%`)
  
  if (failedImages.length > 0) {
    console.log(`⚠️ Failed items:`, failedImages.map(img => img.productName))
  }
  
  // Return all items (including failed ones) so process-images can handle them appropriately
  return cleanImages
}
