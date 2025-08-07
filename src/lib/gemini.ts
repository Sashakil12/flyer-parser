import { GoogleGenerativeAI } from '@google/generative-ai'
import { GeminiParseResult } from '@/types'

if (!process.env.GOOGLE_AI_API_KEY) {
  throw new Error('GOOGLE_AI_API_KEY environment variable is required')
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)

// Prompt template for parsing flyer images
const PARSE_PROMPT = `
You are an expert at analyzing retail store flyers and extracting individual product offers with MULTILINGUAL SUPPORT.

Analyze this flyer image and identify DISTINCT PRODUCTS based on the following visual criteria, extracting both English AND Macedonian text when present:

1. **VISUAL PRODUCT IDENTIFICATION**: Only extract products that have:
   - A clear product image/photo (not just text or logos)
   - Associated pricing information near the product image
   - A product name/title that corresponds to the visible product image

2. **COMBO/GROUP PRODUCTS**: When multiple related products share a single price:
   - Combine all product names with " + " separator
   - Add "(COMBO)" at the end of the product name
   - Example: "Ariel Powder + Ariel Liquid + Ariel Pods (COMBO)"
   - Use the group pricing for that single entry

3. **AVOID OVER-PARSING**: Do NOT extract:
   - Product names that are just part of category headers or navigation
   - Text-only mentions without corresponding product images
   - Brand names or product variations separated by "/" or other symbols that refer to the same visual product
   - Multiple entries for the same visual product shown in the image

4. **MACEDONIAN TEXT SUPPORT**: When parsing flyers with Macedonian text (Cyrillic script):
   - Extract both English and Macedonian product names when both are present
   - Parse Macedonian price text (e.g., "ден" for Macedonian Denars)
   - Include Macedonian promotional text and product details
   - Detect MKD currency (Macedonian Denars) alongside standard currencies

Return a JSON array with this exact structure for each DISTINCT VISUAL PRODUCT:

[
  {
    "product_name": "Complete product name (English)",
    "product_name_mk": "Име на производ (Macedonian - optional)",
    "discount_price": 12.99,
    "discount_price_mk": "12,99 ден (Macedonian price text - optional)",
    "old_price": 19.99,
    "old_price_mk": "19,99 ден (Macedonian price text - optional)",
    "currency": "USD",
    "additional_info": ["Brand name", "Size info", "Promotional text"],
    "additional_info_mk": ["Бренд", "Големина", "Промоција (Macedonian - optional)"]
  }
]

Schema requirements:
- product_name: string (required) - Product name that corresponds to a visible product image
- product_name_mk: string (optional) - Macedonian product name if present in Cyrillic
- discount_price: number (optional) - Sale price if different from regular price
- discount_price_mk: string (optional) - Macedonian price text as shown on flyer
- old_price: number (required) - Regular/original price
- old_price_mk: string (optional) - Macedonian price text as shown on flyer
- currency: string (required) - 3-letter currency code (USD, CAD, EUR, GBP, MKD, etc.)
- additional_info: string[] (optional) - Additional details like brand, size, or promo text
- additional_info_mk: string[] (optional) - Macedonian additional details

**CURRENCY DETECTION RULES**:
- Analyze price symbols and text to determine currency ($ = USD/CAD, € = EUR, £ = GBP, ден/MKD = Macedonian Denar, etc.)
- Look for currency indicators like "CAD", "USD", "€", "$", "£", "ден", "MKD"
- Macedonian Denars: Look for "ден", "денари", "MKD" or Cyrillic price text
- If multiple currencies detected, use the most prominent one
- Default to USD if currency is ambiguous and cannot be determined
- Return standard 3-letter ISO currency codes (USD, CAD, EUR, GBP, AUD, etc.)

**CRITICAL RULES**:
- Only parse products with visible product images, not text-only mentions
- If a product title has no corresponding product image, skip it entirely
- For combo/group offers: combine product names with " + " and add "(COMBO)"
- One JSON object per distinct visual product or product combo
- Focus on actual retail products being sold, not category headers or brand logos
- Use precise numeric values for prices (12.99, not "$12.99")
- Always include currency code for each product based on visual currency indicators
- Return ONLY valid JSON, no explanations

**IF NO PRODUCTS CAN BE EXTRACTED**:
Return an error object with this exact format:
{
  "error": "NO_PRODUCTS_FOUND",
  "reason": "Brief explanation of why no products could be extracted"
}

**COMBO PRODUCT EXAMPLE**:
[
  {
    "product_name": "Ariel Powder + Ariel Liquid + Ariel Pods (COMBO)",
    "old_price": 19.99,
    "currency": "USD",
    "additional_info": ["Multi-product offer", "Save on bundle"]
  }
]

**POSSIBLE ERROR REASONS**:
- "NO_PRODUCTS_FOUND": No clear product images with pricing found
- "IMAGE_UNCLEAR": Image quality too poor to identify products
- "NO_PRICING": Products visible but no clear pricing information
- "NON_RETAIL": Image does not appear to be a retail flyer

Return valid JSON format only.
`

/**
 * Parse a flyer image using Google Gemini Pro 2.5
 */
export async function parseImageWithGemini(dataUrl: string): Promise<GeminiParseResult[]> {
  try {
    // Get Gemini model
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' })

    // Convert data URL to the format expected by Gemini
    const base64Data = dataUrl.split(',')[1]
    const mimeType = dataUrl.split(';')[0].split(':')[1]

    if (!base64Data || !mimeType) {
      throw new Error('Invalid image data URL format')
    }

    // Generate content with image and prompt
    const result = await model.generateContent([
      PARSE_PROMPT,
      {
        inlineData: {
          data: base64Data,
          mimeType: mimeType,
        },
      },
    ])

    const response = await result.response
    const text = response.text()

    // Parse the JSON response
    let parsedData: GeminiParseResult[]
    
    try {
      console.log('🤖 Raw Gemini response length:', text.length)
      console.log('🔍 Raw response preview:', text.substring(0, 200) + '...')
      
      // Comprehensive JSON cleaning
      let cleanedText = text
        // Remove markdown code blocks
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        // Remove any text before the first [ or {
        .replace(/^[^\[\{]*/, '')
        // Remove any text after the last ] or }
        .replace(/[^\]\}]*$/, '')
        // Clean control characters that break JSON
        .replace(/[\x00-\x1F\x7F]/g, '')
        // Fix common AI response issues
        .replace(/\\n/g, '\\\\n')  // Fix newlines in strings
        .replace(/\\t/g, '\\\\t')  // Fix tabs in strings
        .replace(/\\r/g, '\\\\r')  // Fix carriage returns
        .replace(/"([^"]*?)\n([^"]*?)"/g, '"$1\\\\n$2"') // Fix unescaped newlines in strings
        .trim()
      
      console.log('✨ Cleaned text length:', cleanedText.length)
      console.log('🔍 Cleaned text preview:', cleanedText.substring(0, 200) + '...')
      
      // Additional safety check - ensure it starts with [ or {
      if (!cleanedText.startsWith('[') && !cleanedText.startsWith('{')) {
        throw new Error('Response does not appear to be valid JSON (no opening bracket/brace)')
      }
      
      parsedData = JSON.parse(cleanedText)
      
      // Check if it's an error object
      if (parsedData && typeof parsedData === 'object' && !Array.isArray(parsedData) && 'error' in parsedData) {
        const errorObj = parsedData as { error: string; reason?: string }
        const errorReason = `${errorObj.error}: ${errorObj.reason || 'No specific reason provided'}`
        throw new Error(errorReason)
      }
      
      // Ensure it's an array
      if (!Array.isArray(parsedData)) {
        parsedData = [parsedData]
      }
      
      // Validate the structure
      const validatedData = parsedData.map((item, index) => {
        if (!item.product_name || typeof item.product_name !== 'string') {
          throw new Error(`Invalid product_name for item ${index + 1}`)
        }
        
        // Enhanced old_price validation with string conversion
        if (item.old_price === undefined || item.old_price === null) {
          throw new Error(`Missing old_price for item ${index + 1}: received ${item.old_price}`)
        }
        
        // Convert string prices to numbers if possible
        let oldPrice = item.old_price
        if (typeof oldPrice === 'string') {
          console.log(`⚠️ Converting string price to number for item ${index + 1}: "${oldPrice}"`)  
          const parsed = parseFloat(oldPrice)
          if (isNaN(parsed) || parsed <= 0) {
            throw new Error(`Invalid old_price for item ${index + 1}: cannot convert "${oldPrice}" to valid number`)
          }
          oldPrice = parsed
        }
        
        if (typeof oldPrice !== 'number' || isNaN(oldPrice) || oldPrice <= 0) {
          throw new Error(`Invalid old_price for item ${index + 1}: received ${typeof oldPrice} - ${JSON.stringify(oldPrice)}`)
        }
        
        // Currency validation - required field
        if (!item.currency || typeof item.currency !== 'string') {
          throw new Error(`Invalid or missing currency for item ${index + 1}`)
        }
        
        // Enhanced discount_price validation with string conversion
        let discountPrice = item.discount_price
        if (discountPrice !== undefined) {
          if (typeof discountPrice === 'string') {
            console.log(`⚠️ Converting string discount price to number for item ${index + 1}: "${discountPrice}"`)  
            const parsed = parseFloat(discountPrice)
            if (isNaN(parsed) || parsed <= 0) {
              throw new Error(`Invalid discount_price for item ${index + 1}: cannot convert "${discountPrice}" to valid number`)
            }
            discountPrice = parsed
          }
          
          if (typeof discountPrice !== 'number' || isNaN(discountPrice) || discountPrice <= 0) {
            throw new Error(`Invalid discount_price for item ${index + 1}: received ${typeof discountPrice} - ${JSON.stringify(discountPrice)}`)
          }
        }
        
        // Optional additional_info validation
        if (item.additional_info !== undefined && !Array.isArray(item.additional_info)) {
          throw new Error(`Invalid additional_info for item ${index + 1}`)
        }
        
        // Optional Macedonian fields validation
        if (item.product_name_mk !== undefined && typeof item.product_name_mk !== 'string') {
          throw new Error(`Invalid product_name_mk for item ${index + 1}`)
        }
        if (item.discount_price_mk !== undefined && typeof item.discount_price_mk !== 'string') {
          throw new Error(`Invalid discount_price_mk for item ${index + 1}`)
        }
        if (item.old_price_mk !== undefined && typeof item.old_price_mk !== 'string') {
          throw new Error(`Invalid old_price_mk for item ${index + 1}`)
        }
        if (item.additional_info_mk !== undefined && !Array.isArray(item.additional_info_mk)) {
          throw new Error(`Invalid additional_info_mk for item ${index + 1}`)
        }
        
        return {
          product_name: item.product_name.trim(),
          product_name_mk: item.product_name_mk?.trim(),
          discount_price: discountPrice,
          discount_price_mk: item.discount_price_mk?.trim(),
          old_price: oldPrice,
          old_price_mk: item.old_price_mk?.trim(),
          currency: item.currency.toUpperCase(), // Normalize to uppercase
          additional_info: item.additional_info || [],
          additional_info_mk: item.additional_info_mk || [],
        }
      })
      
      return validatedData
      
    } catch (parseError: any) {
      console.error('❌ JSON parsing error:', parseError.message)
      console.error('🔴 Raw response (first 1000 chars):', text.substring(0, 1000))
      console.error('🔴 Error position:', parseError.message.match(/position (\d+)/) ? parseError.message.match(/position (\d+)/)[1] : 'unknown')
      
      // Show problematic area if position is available
      const positionMatch = parseError.message.match(/position (\d+)/)
      if (positionMatch) {
        const position = parseInt(positionMatch[1])
        const start = Math.max(0, position - 50)
        const end = Math.min(text.length, position + 50)
        console.error('📍 Problematic area:', text.substring(start, end))
        console.error('🖺 Character codes around error:', Array.from(text.substring(position - 5, position + 5)).map(c => c.charCodeAt(0)))
      }
      
      throw new Error(`Failed to parse AI response: ${parseError.message}. Check server logs for full response details.`)
    }

  } catch (error: any) {
    console.error('Gemini AI parsing error:', error)
    
    if (error.message?.includes('API key')) {
      throw new Error('Invalid Google AI API key')
    } else if (error.message?.includes('quota')) {
      throw new Error('Google AI API quota exceeded')
    } else if (error.message?.includes('safety')) {
      throw new Error('Image content flagged by safety filters')
    } else {
      throw new Error(`AI parsing failed: ${error.message}`)
    }
  }
}

/**
 * Test function to validate Gemini AI setup
 */
export async function testGeminiConnection(): Promise<boolean> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' })
    const result = await model.generateContent(['Say "Hello" if you can read this.'])
    const response = await result.response
    const text = response.text()
    
    return text.toLowerCase().includes('hello')
  } catch (error) {
    console.error('Gemini connection test failed:', error)
    return false
  }
}

/**
 * Get available Gemini models
 */
export async function getAvailableModels(): Promise<string[]> {
  try {
    // This is a placeholder - the actual API might have different methods
    return ['gemini-1.5-pro', 'gemini-1.5-flash']
  } catch (error) {
    console.error('Failed to get available models:', error)
    return []
  }
}
