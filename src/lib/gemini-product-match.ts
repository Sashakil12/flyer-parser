import { GoogleGenerativeAI } from '@google/generative-ai'
import { getActiveAutoApprovalRuleAdmin } from './firestore-admin'

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
Return a JSON array with each potential match scored and auto-approval evaluation:
[
  {
    "productId": "id1",
    "relevanceScore": 0.85,
    "matchReason": "Strong name similarity and matching brand",
    "can_auto_merge": true,
    "autoApprovalReason": "Meets auto-approval criteria: name 95% match"
  },
  {
    "productId": "id2",
    "relevanceScore": 0.45,
    "matchReason": "Same category but different brand and size",
    "can_auto_merge": false,
    "autoApprovalReason": "Does not meet auto-approval criteria: name only 40% match"
  }
]

AUTO-APPROVAL CRITERIA:
{{autoApprovalCriteria}}

IMPORTANT RULES:
- Score EACH database product individually based on its match to the flyer product
- Be conservative - only give high scores (0.8+) for very confident matches
- Consider partial word matches (e.g., "Apple Juice" should match "Organic Apple Juice")
- Account for common retail variations (sizes, packaging, etc.)
- Evaluate can_auto_merge based on the auto-approval criteria above
- Set can_auto_merge to true ONLY if the match clearly meets the specified auto-approval requirements
- CRITICAL: Always use the exact product ID from the database product (never use strings like 'undefined' or 'null')
- The productId MUST be a valid ID string from one of the provided DATABASE PRODUCTS
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
): Promise<Array<{ productId: string; relevanceScore: number; matchReason: string; can_auto_merge: boolean; autoApprovalReason: string }>> {
  try {
    // Get active auto-approval rule using admin SDK to avoid permission issues
    const autoApprovalRule = await getActiveAutoApprovalRuleAdmin()
    let autoApprovalCriteria = 'No auto-approval rule configured - set can_auto_merge to false for all products'
    
    if (autoApprovalRule) {
      autoApprovalCriteria = `Auto-approval rule: "${autoApprovalRule.name}"
Custom instructions: ${autoApprovalRule.prompt}

Apply these instructions to determine if each product match should have can_auto_merge set to true.`
    }

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
      .replace('{{autoApprovalCriteria}}', autoApprovalCriteria)

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
      const validMatches = [];
      
      for (const match of parsedData) {
        // Skip invalid matches instead of throwing an error
        if (!match.productId || 
            typeof match.productId !== 'string' || 
            match.productId === 'undefined' || 
            match.productId === 'null') {
          console.log(`⚠️ Skipping match with invalid productId: ${JSON.stringify(match)}`)
          continue;
        }
        
        // Skip matches with invalid relevance scores
        if (match.relevanceScore === undefined || typeof match.relevanceScore !== 'number') {
          console.log(`⚠️ Skipping match with invalid relevanceScore: ${JSON.stringify(match)}`)
          continue;
        }
        
        // Ensure score is within valid range
        const score = Math.max(0, Math.min(1, match.relevanceScore))
        
        // Add valid match to our array
        validMatches.push({
          productId: match.productId,
          relevanceScore: score,
          matchReason: match.matchReason || 'No reason provided',
          can_auto_merge: match.can_auto_merge === true,
          autoApprovalReason: match.autoApprovalReason || 'No auto-approval evaluation provided'
        });
      }
      
      console.log(`✅ Found ${validMatches.length} valid matches after filtering`)
      
      // Sort by relevance score (highest first)
      return validMatches.sort((a, b) => b.relevanceScore - a.relevanceScore)
      
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
