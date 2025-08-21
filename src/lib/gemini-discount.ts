import { GoogleGenerativeAI } from '@google/generative-ai'
import { appConfigServer } from './config.server'

const genAI = new GoogleGenerativeAI(appConfigServer.google.apiKey)

const DISCOUNT_PROMPT = `
You are an expert at calculating retail discounts.

TASK: Given a product's original price and a discount description, calculate the final discounted price.

ORIGINAL PRICE: {{originalPrice}}
DISCOUNT DESCRIPTION: "{{discountText}}"

Analyze the discount description and apply it to the original price.

Consider various discount formats:
- Percentage off (e.g., "20% OFF", "Save 15%")
- Fixed amount off (e.g., "SAVE $5", "$2.50 less")
- Multi-buy offers (e.g., "2 for $10", "3 for the price of 2")
- Fixed final price (e.g., "Now $9.99", "Sale price: $15")

OUTPUT FORMAT:
Return a JSON object with this exact structure:
{
  "newPrice": number, // The final calculated price
  "calculationDetails": "A brief explanation of how you calculated the price"
}

CRITICAL RULES:
- The "newPrice" field MUST be a valid number (integer or float), not a string.
- If the discount is a multi-buy offer (e.g., "2 for $10"), calculate the price for a single item (e.g., 5.00).
- If the discount description is unclear or cannot be calculated, set "newPrice" to the original price.
- Return ONLY valid JSON. No comments, no explanations, just the JSON object.
`

export interface DiscountCalculationResult {
  newPrice: number
  calculationDetails: string
}

export async function calculateDiscountedPrice(
  originalPrice: number,
  discountText: string
): Promise<DiscountCalculationResult> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' })

    const prompt = DISCOUNT_PROMPT
      .replace('{{originalPrice}}', originalPrice.toString())
      .replace('{{discountText}}', discountText)

    const result = await model.generateContent([prompt])
    const response = await result.response
    const text = response.text()

    // Clean and parse the JSON response
    let cleanedText = text
      .replace(/```json\n?/g, '') 
      .replace(/```\n?/g, '')
      .replace(/^[^\{]*/, '')
      .replace(/[^\}]*$/, '')
      .trim()
      
    const parsedResult = JSON.parse(cleanedText)

    if (typeof parsedResult.newPrice !== 'number' || !parsedResult.calculationDetails) {
      throw new Error('Invalid response format from discount calculation AI.')
    }

    return parsedResult

  } catch (error: any) {
    console.error('Error calculating discounted price with Gemini:', error)
    // Fallback to original price if calculation fails
    return {
      newPrice: originalPrice,
      calculationDetails: `AI calculation failed: ${error.message}. Using original price.`,
    }
  }
}
