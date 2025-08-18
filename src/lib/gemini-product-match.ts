import { GoogleGenerativeAI } from '@google/generative-ai'

if (!process.env.GOOGLE_AI_API_KEY) {
  throw new Error('GOOGLE_AI_API_KEY environment variable is required')
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)

// Prompt template for scoring product relevance
const PRODUCT_MATCH_PROMPT = `
You are an expert retail product matcher that specializes in determining the relevance between a flyer product and database products.

TASK: Score how well a FLYER PRODUCT matches potential DATABASE PRODUCTS on a scale from 0.0 to 1.0.

FLYER PRODUCT:
- Name: {{flyerProductName}}
- Name (Macedonian): {{flyerProductNameMk}}
- Additional Info: {{flyerAdditionalInfo}}
- Additional Info (Macedonian): {{flyerAdditionalInfoMk}}

POTENTIAL DATABASE MATCHES:
{{databaseProducts}}

SCORING GUIDELINES:
- 0.0-0.2: No match or extremely weak connection (different product categories)
- 0.3-0.5: Partial match (same category but different products)
- 0.6-0.7: Good match (likely the same product with some differences)
- 0.8-0.9: Strong match (almost certainly the same product)
- 1.0: Perfect match (identical products)

MATCHING FACTORS (in order of importance):
1. Product name similarity (accounting for brand, type, variant)
2. Product category alignment
3. Size/weight/quantity match
4. Brand match
5. Flavor/variant match

MULTILINGUAL MATCHING:
- Consider both English and Macedonian text when available
- Match across languages (e.g., "Apple" in English matches "Јаболко" in Macedonian)
- Give higher weight to matches in the same language

OUTPUT FORMAT:
Return a JSON array with each potential match scored:
[
  {
    "productId": "id1",
    "relevanceScore": 0.85,
    "matchReason": "Strong name similarity and matching brand"
  },
  {
    "productId": "id2",
    "relevanceScore": 0.45,
    "matchReason": "Same category but different brand and size"
  }
]

IMPORTANT RULES:
- Score EACH database product individually based on its match to the flyer product
- Be conservative - only give high scores (0.8+) for very confident matches
- Consider partial word matches (e.g., "Apple Juice" should match "Organic Apple Juice")
- Account for common retail variations (sizes, packaging, etc.)
- Return ONLY valid JSON with no additional text
`

/**
 * Score product matches using Google Gemini Pro
 */
export async function scoreProductMatches(
  flyerProduct: {
    productName: string
    productNameMk?: string
    additionalInfo?: string[]
    additionalInfoMk?: string[]
  },
  databaseProducts: Array<{
    id: string
    name: string
    nameMk?: string
    description?: string
    descriptionMk?: string
    category?: string
    [key: string]: any
  }>
): Promise<Array<{ productId: string; relevanceScore: number; matchReason: string }>> {
  try {
    // Get Gemini model
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' })

    // Format the flyer product info
    const flyerProductName = flyerProduct.productName || ''
    const flyerProductNameMk = flyerProduct.productNameMk || ''
    const flyerAdditionalInfo = Array.isArray(flyerProduct.additionalInfo) 
      ? flyerProduct.additionalInfo.join(', ') 
      : ''
    const flyerAdditionalInfoMk = Array.isArray(flyerProduct.additionalInfoMk) 
      ? flyerProduct.additionalInfoMk.join(', ') 
      : ''

    // Format the database products for the prompt
    const formattedDatabaseProducts = databaseProducts.map((product, index) => {
      return `PRODUCT ${index + 1}:
- ID: ${product.id}
- Name: ${product.name || ''}
- Name (Macedonian): ${product.nameMk || ''}
- Description: ${product.description || ''}
- Description (Macedonian): ${product.descriptionMk || ''}
- Category: ${product.category || ''}
`
    }).join('\n')

    // Replace placeholders in the prompt
    const prompt = PRODUCT_MATCH_PROMPT
      .replace('{{flyerProductName}}', flyerProductName)
      .replace('{{flyerProductNameMk}}', flyerProductNameMk)
      .replace('{{flyerAdditionalInfo}}', flyerAdditionalInfo)
      .replace('{{flyerAdditionalInfoMk}}', flyerAdditionalInfoMk)
      .replace('{{databaseProducts}}', formattedDatabaseProducts)

    // Generate content with prompt
    const result = await model.generateContent([prompt])
    const response = await result.response
    const text = response.text()

    // Parse the JSON response
    try {
      console.log('🤖 Raw Gemini response length:', text.length)
      
      // Clean the response text to ensure valid JSON
      let cleanedText = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .replace(/^[^\[\{]*/, '')
        .replace(/[^\]\}]*$/, '')
        .replace(/[\x00-\x1F\x7F]/g, '')
        .replace(/,(\s*[\]\}])/g, '$1')
        .trim()
      
      // Parse the cleaned JSON
      const parsedData = JSON.parse(cleanedText)
      
      // Validate the structure
      if (!Array.isArray(parsedData)) {
        throw new Error('Response is not an array')
      }
      
      // Validate and normalize each match
      const validatedMatches = parsedData.map((match: any) => {
        if (!match.productId || typeof match.productId !== 'string') {
          throw new Error(`Invalid productId: ${JSON.stringify(match)}`)
        }
        
        if (match.relevanceScore === undefined || typeof match.relevanceScore !== 'number') {
          throw new Error(`Invalid relevanceScore for product ${match.productId}`)
        }
        
        // Ensure score is within valid range
        const score = Math.max(0, Math.min(1, match.relevanceScore))
        
        return {
          productId: match.productId,
          relevanceScore: score,
          matchReason: match.matchReason || 'No reason provided'
        }
      })
      
      // Sort by relevance score (highest first)
      return validatedMatches.sort((a, b) => b.relevanceScore - a.relevanceScore)
      
    } catch (parseError: any) {
      console.error('❌ JSON parsing error:', parseError.message)
      console.error('🔴 Raw response (first 500 chars):', text.substring(0, 500))
      throw new Error(`Failed to parse AI response: ${parseError.message}`)
    }
  } catch (error: any) {
    console.error('Gemini AI product matching error:', error)
    
    if (error.message?.includes('API key')) {
      throw new Error('Invalid Google AI API key')
    } else if (error.message?.includes('quota')) {
      throw new Error('Google AI API quota exceeded')
    } else {
      throw new Error(`AI product matching failed: ${error.message}`)
    }
  }
}

/**
 * Test function to validate product matching
 */
export async function testProductMatching(): Promise<boolean> {
  try {
    const testResult = await scoreProductMatches(
      {
        productName: 'Organic Apple Juice 1L',
        additionalInfo: ['100% pure', 'No added sugar']
      },
      [
        {
          id: 'test1',
          name: 'Apple Juice',
          description: 'Natural apple juice, 1 liter'
        },
        {
          id: 'test2',
          name: 'Orange Juice',
          description: 'Fresh orange juice, 1 liter'
        }
      ]
    )
    
    return Array.isArray(testResult) && testResult.length > 0
  } catch (error) {
    console.error('Product matching test failed:', error)
    return false
  }
}
