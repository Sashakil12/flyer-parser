import { GoogleGenerativeAI } from '@google/generative-ai'
import { GeminiParseResult } from '@/types'

if (!process.env.GOOGLE_AI_API_KEY) {
  throw new Error('GOOGLE_AI_API_KEY environment variable is required')
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)

// Prompt template for parsing flyer images
const PARSE_PROMPT = `
You are an expert at analyzing retail store flyers and extracting product information with high accuracy.

Analyze this store flyer image and extract product information. Return a valid JSON array with objects following this exact structure:

[
  {
    "product_name": "Complete product name as shown on the flyer",
    "discount_price": 12.99,
    "old_price": 19.99,
    "additional_info": ["Brand name", "Size info", "Promotional text"]
  }
]

Schema requirements:
- product_name: string (required) - Complete product name as shown on the flyer
- discount_price: number (optional) - Current sale/promotional price if available 
- old_price: number (required) - Original/regular price (use this if only one price is shown)
- additional_info: string[] (optional) - Additional product details, brand names, or promotional text

Instructions:
- Extract ALL visible product information accurately
- Be precise with numerical price values (use numbers, not strings)
- Include brand names when clearly visible
- Capture any promotional conditions or restrictions
- If you see multiple products, include all of them in the array
- Return ONLY valid JSON, no additional text or explanations
- If uncertain about a value, omit optional fields rather than guessing
- Ensure all prices are in the correct numeric format (e.g., 12.99, not "$12.99" or "12.99$")

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
      // Clean the response - remove any markdown formatting or extra text
      const cleanedText = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()
      
      parsedData = JSON.parse(cleanedText)
      
      // Ensure it's an array
      if (!Array.isArray(parsedData)) {
        parsedData = [parsedData]
      }
      
      // Validate the structure
      const validatedData = parsedData.map((item, index) => {
        if (!item.product_name || typeof item.product_name !== 'string') {
          throw new Error(`Invalid product_name for item ${index + 1}`)
        }
        
        if (!item.old_price || typeof item.old_price !== 'number') {
          throw new Error(`Invalid old_price for item ${index + 1}`)
        }
        
        // Optional discount_price validation
        if (item.discount_price !== undefined && typeof item.discount_price !== 'number') {
          throw new Error(`Invalid discount_price for item ${index + 1}`)
        }
        
        // Optional additional_info validation
        if (item.additional_info !== undefined && !Array.isArray(item.additional_info)) {
          throw new Error(`Invalid additional_info for item ${index + 1}`)
        }
        
        return {
          product_name: item.product_name.trim(),
          discount_price: item.discount_price,
          old_price: item.old_price,
          additional_info: item.additional_info || [],
        }
      })
      
      return validatedData
      
    } catch (parseError: any) {
      console.error('JSON parsing error:', parseError)
      console.error('Raw response:', text)
      throw new Error(`Failed to parse AI response: ${parseError.message}`)
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
