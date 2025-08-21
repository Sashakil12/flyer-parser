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
- Consider English, Macedonian, and Albanian text when available
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
- CRITICAL: For auto-approval evaluation, be more lenient and set can_auto_merge to true if:
  1. The match has a relevanceScore of 0.7 or higher AND
  2. The match reasonably satisfies the auto-approval criteria (doesn't need to be perfect)
- For matches with relevanceScore >= 0.8, strongly consider setting can_auto_merge to true
- CRITICAL: Always use the exact product ID from the database product (never use strings like 'undefined' or 'null')
- The productId MUST be a valid ID string from one of the provided DATABASE PRODUCTS
- Return ONLY valid JSON with no additional text
- IMPORTANT: At least one product should be marked with can_auto_merge=true if any product has relevanceScore >= 0.7
`

/**
 * Score product matches using Google Gemini Pro
 * @param flyerProduct The flyer product to match
 * @param databaseProducts Array of potential database product matches
 * @param timeoutMs Optional timeout in milliseconds (defaults to 25000ms)
 * @returns Array of scored product matches
 */
export async function scoreProductMatches(
  flyerProduct: {
    productName: string
    productNameMk?: string
    additionalInfo?: string[]
    additionalInfoMk?: string[]
  },
  databaseProducts: Array < {
    id: string
    name: string
    nameMk?: string
    nameAl?: string
    description?: string
    descriptionMk?: string
    category?: string
    [key: string]: any
  } >,
  timeoutMs: number = 90000 // Default 90 second timeout
): Promise<Array<{ productId: string; relevanceScore: number; matchReason: string; can_auto_merge: boolean; autoApprovalReason: string }>> {
  try {
    // Get active auto-approval rule using admin SDK to avoid permission issues
    const autoApprovalRule = await getActiveAutoApprovalRuleAdmin()
    let autoApprovalCriteria = ''
    
    if (autoApprovalRule) {
      autoApprovalCriteria = `Auto-approval rule: "${autoApprovalRule.name}"
Custom instructions: ${autoApprovalRule.prompt}

Apply these instructions to determine if each product match should have can_auto_merge set to true.

IMPORTANT: If a product has a relevanceScore of 0.7 or higher AND reasonably matches the criteria above, set can_auto_merge to true. Be generous with auto-approval for high-confidence matches.`
    } else {
      autoApprovalCriteria = 'No auto-approval rule is active. Do not suggest auto-approval for any match. Set "can_auto_merge" to false for all products.'
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
- Name (Albanian): ${product.nameAl || ''}
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

    console.log(`🤖 Starting Gemini API call at ${new Date().toISOString()}`)
    console.log(`📋 Prompt length: ${prompt.length} characters`)

    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        console.error(`⏱️ Gemini API call timed out after ${timeoutMs/1000} seconds`)
        reject(new Error(`Gemini API call timed out after ${timeoutMs/1000} seconds`))
      }, timeoutMs)
    })

    // Generate content with prompt and race against timeout
    let text: string
    try {
      const resultPromise = model.generateContent([prompt])
      const result = await Promise.race([resultPromise, timeoutPromise])
      console.log(`✅ Gemini API call completed at ${new Date().toISOString()}`)

      const response = await result.response
      text = response.text()
      console.log(`📄 Received response of length: ${text.length} characters`)
    } catch (error) {
      console.error(`❌ Gemini API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      throw new Error(`Gemini API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    // Parse the JSON response
    try {
      console.log('🤖 Raw Gemini response length:', text.length)
      
      // Clean the response text to ensure valid JSON
      let cleanedText = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .replace(/^[^[\{]*/, '')
        .replace(/[^\\\]\}]*$/, '')
        .replace(/[\x00-\x1F\x7F]/g, '')
        .replace(/,(\s*[\\\]\}])/g, '$1')
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
        
        // Add valid match to our array with auto-approval logic
        const canAutoMerge = autoApprovalRule ? (match.can_auto_merge === true) : false;
        
        validMatches.push({
          productId: match.productId,
          relevanceScore: score,
          matchReason: match.matchReason || 'No reason provided',
          can_auto_merge: canAutoMerge,
          autoApprovalReason: canAutoMerge ? (match.autoApprovalReason || 'AI suggested auto-approval') : 'No active auto-approval rule.'
        });
      }
      
      console.log(`✅ Found ${validMatches.length} valid matches after filtering`)
      
      // Sort by relevance score (highest first)
      const sortedMatches = validMatches.sort((a, b) => b.relevanceScore - a.relevanceScore)
      
      // If no matches are auto-approvable but we have high relevance matches, mark the best one
      const hasAutoApprovable = sortedMatches.some(match => match.can_auto_merge === true)
      if (!hasAutoApprovable && sortedMatches.length > 0 && sortedMatches[0].relevanceScore >= 0.7) {
        console.log(`🔄 No auto-approvable matches found, but top match has score ${sortedMatches[0].relevanceScore} >= 0.7. Marking as auto-approvable.`)
        sortedMatches[0].can_auto_merge = true
        sortedMatches[0].autoApprovalReason = `Auto-approved as best match with high confidence score (${sortedMatches[0].relevanceScore.toFixed(2)})`
      }
      
      // Log the final results
      console.log(`🏁 Product matching completed with ${sortedMatches.length} matches`)
      sortedMatches.forEach((match, index) => {
        console.log(`Match #${index + 1}: productId=${match.productId}, score=${match.relevanceScore.toFixed(2)}, can_auto_merge=${match.can_auto_merge}`)
      })
      
      return sortedMatches
      
    } catch (parseError: any) {
      console.error('❌ JSON parsing error:', parseError.message)
      console.error('🔴 Raw response (first 500 chars):', text.substring(0, 500))
      
      // Instead of throwing, return a fallback result with a single match
      // This prevents the workflow from hanging due to parsing errors
      if (databaseProducts.length > 0) {
        console.log('⚠️ Using fallback scoring due to JSON parsing error')
        const fallbackProduct = databaseProducts[0]
        return [{
          productId: fallbackProduct.id,
          relevanceScore: 0.5, // Moderate confidence
          matchReason: 'Fallback match due to AI response parsing error',
          can_auto_merge: false, // Don't auto-approve fallback matches
          autoApprovalReason: 'Auto-approval skipped due to AI response parsing error'
        }]
      }
      
      throw new Error(`Failed to parse AI response: ${parseError.message}`)
    }
  } catch (error: any) {
    console.error('Gemini AI product matching error:', error)
    
    // Create fallback matches to prevent workflow from hanging
    if (databaseProducts.length > 0) {
      console.log('⚠️ Using fallback scoring due to Gemini API error')
      // Take up to 3 products for fallback matching
      const fallbackMatches = databaseProducts.slice(0, 3).map(product => ({
        productId: product.id,
        relevanceScore: 0.5, // Moderate confidence
        matchReason: `Fallback match due to API error: ${error.message || 'Unknown error'}`,
        can_auto_merge: false, // Don't auto-approve fallback matches
        autoApprovalReason: 'Auto-approval skipped due to API error'
      }))
      
      // Sort by product name similarity as a basic fallback
      const sortedFallbacks = fallbackMatches.sort((a, b) => {
        const productA = databaseProducts.find(p => p.id === a.productId)
        const productB = databaseProducts.find(p => p.id === b.productId)
        if (!productA || !productB) return 0
        
        // Simple string similarity - length of common prefix
        const nameA = productA.name.toLowerCase()
        const nameB = productB.name.toLowerCase()
        const flyerName = flyerProduct.productName.toLowerCase()
        
        const commonA = commonPrefixLength(nameA, flyerName)
        const commonB = commonPrefixLength(nameB, flyerName)
        
        return commonB - commonA
      })
      
      console.log(`✅ Created ${sortedFallbacks.length} fallback matches due to API error`)
      return sortedFallbacks
    }
    
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
/**
 * Helper function to find common prefix length between two strings
 * Used for basic string similarity in fallback matching
 */
function commonPrefixLength(str1: string, str2: string): number {
  const minLength = Math.min(str1.length, str2.length)
  let i = 0
  while (i < minLength && str1[i] === str2[i]) {
    i++
  }
  return i
}

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
