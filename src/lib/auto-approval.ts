import { GoogleGenerativeAI } from '@google/generative-ai'
import { AutoApprovalRule, AutoApprovalDecision } from '@/types'
import { getActiveAutoApprovalRule } from './firestore'

if (!process.env.GOOGLE_AI_API_KEY) {
  throw new Error('GOOGLE_AI_API_KEY environment variable is required')
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)

// Auto-approval prompt template
const AUTO_APPROVAL_PROMPT = `You are an AI assistant that determines whether to automatically approve product matches based on specific criteria.

FLYER PRODUCT:
Name: {{flyerProductName}}
Macedonian Name: {{flyerProductNameMk}}
Additional Info: {{flyerAdditionalInfo}}
Additional Info (Macedonian): {{flyerAdditionalInfoMk}}

DATABASE PRODUCT:
Name: {{databaseProductName}}
Macedonian Name: {{databaseProductNameMk}}
Albanian Name: {{databaseProductAlbanianName}}
Description: {{databaseProductDescription}}
Category: {{databaseProductCategory}}
Supermarket: {{databaseProductSupermarket}}

AUTO-APPROVAL CRITERIA:
{{autoApprovalCriteria}}

CUSTOM INSTRUCTIONS:
{{customInstructions}}

Based on the above criteria and instructions, analyze the match between the flyer product and database product.

Respond with a JSON object in this exact format:
{
  "shouldAutoApprove": boolean,
  "confidence": number (0.0 to 1.0),
  "reasoning": "detailed explanation of your decision",
  "matchedFields": ["array", "of", "field", "names", "that", "matched", "criteria"]
}

Be strict with the criteria. Only auto-approve if the match clearly meets the specified requirements.`

export async function evaluateAutoApproval(
  flyerProduct: {
    productName: string
    productNameMk?: string
    additionalInfo?: string[]
    additionalInfoMk?: string[]
  },
  databaseProduct: {
    id: string
    name: string
    macedonianname?: string
    albenianname?: string
    description?: string
    category?: string
    superMarketName?: string
    [key: string]: any
  }
): Promise<AutoApprovalDecision> {
  try {
    console.log('🤖 Evaluating auto-approval for product match...')
    
    // Get active auto-approval rule
    const autoApprovalRule = await getActiveAutoApprovalRule()
    
    if (!autoApprovalRule) {
      console.log('⚠️ No active auto-approval rule found')
      return {
        shouldAutoApprove: false,
        confidence: 0,
        reasoning: 'No active auto-approval rule configured',
        matchedFields: []
      }
    }

    console.log(`📋 Using auto-approval rule: "${autoApprovalRule.name}"`)

    // Generate criteria text from rule
    const criteriaText = generateCriteriaText(autoApprovalRule)
    
    // Format the prompt
    const prompt = AUTO_APPROVAL_PROMPT
      .replace('{{flyerProductName}}', flyerProduct.productName || '')
      .replace('{{flyerProductNameMk}}', flyerProduct.productNameMk || '')
      .replace('{{flyerAdditionalInfo}}', Array.isArray(flyerProduct.additionalInfo) ? flyerProduct.additionalInfo.join(', ') : '')
      .replace('{{flyerAdditionalInfoMk}}', Array.isArray(flyerProduct.additionalInfoMk) ? flyerProduct.additionalInfoMk.join(', ') : '')
      .replace('{{databaseProductName}}', databaseProduct.name || '')
      .replace('{{databaseProductNameMk}}', databaseProduct.macedonianname || '')
      .replace('{{databaseProductAlbanianName}}', databaseProduct.albenianname || '')
      .replace('{{databaseProductDescription}}', databaseProduct.description || '')
      .replace('{{databaseProductCategory}}', databaseProduct.category || '')
      .replace('{{databaseProductSupermarket}}', databaseProduct.superMarketName || '')
      .replace('{{autoApprovalCriteria}}', criteriaText)
      .replace('{{customInstructions}}', autoApprovalRule.prompt)

    console.log('🔍 Auto-approval prompt length:', prompt.length)

    // Get Gemini model
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' })

    // Generate decision
    const result = await model.generateContent([prompt])
    const response = await result.response
    const text = response.text()

    console.log('🤖 Raw auto-approval response length:', text.length)

    // Parse the JSON response
    try {
      // Clean the response text
      let cleanedText = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .replace(/^[^\{]*/, '')
        .replace(/[^\}]*$/, '')
        .trim()

      const decision = JSON.parse(cleanedText) as AutoApprovalDecision

      // Validate the decision structure
      if (typeof decision.shouldAutoApprove !== 'boolean') {
        throw new Error('Invalid shouldAutoApprove value')
      }

      if (typeof decision.confidence !== 'number' || decision.confidence < 0 || decision.confidence > 1) {
        throw new Error('Invalid confidence value')
      }

      if (!decision.reasoning || typeof decision.reasoning !== 'string') {
        throw new Error('Invalid reasoning value')
      }

      if (!Array.isArray(decision.matchedFields)) {
        throw new Error('Invalid matchedFields value')
      }

      console.log(`✅ Auto-approval decision: ${decision.shouldAutoApprove ? 'APPROVE' : 'REJECT'} (confidence: ${decision.confidence})`)
      console.log(`📝 Reasoning: ${decision.reasoning}`)
      console.log(`🎯 Matched fields: ${decision.matchedFields.join(', ')}`)

      return decision

    } catch (parseError: any) {
      console.error('❌ Auto-approval JSON parsing error:', parseError.message)
      console.error('🔴 Raw response (first 500 chars):', text.substring(0, 500))
      
      return {
        shouldAutoApprove: false,
        confidence: 0,
        reasoning: `Failed to parse AI response: ${parseError.message}`,
        matchedFields: []
      }
    }

  } catch (error: any) {
    console.error('❌ Auto-approval evaluation error:', error)
    
    return {
      shouldAutoApprove: false,
      confidence: 0,
      reasoning: `Auto-approval evaluation failed: ${error.message}`,
      matchedFields: []
    }
  }
}

function generateCriteriaText(rule: AutoApprovalRule): string {
  const criteria: string[] = []
  
  Object.entries(rule.fieldCriteria).forEach(([fieldName, fieldCriteria]) => {
    if (!fieldCriteria.ignore) {
      const requiredText = fieldCriteria.isRequired ? ' (REQUIRED)' : ''
      criteria.push(`- ${fieldName}: ${fieldCriteria.matchPercentage}% similarity${requiredText}`)
    }
  })

  return criteria.length > 0 ? criteria.join('\n') : 'No specific field criteria defined'
}

export async function shouldAutoApproveMatch(
  flyerProduct: any,
  databaseProduct: any
): Promise<boolean> {
  try {
    const decision = await evaluateAutoApproval(flyerProduct, databaseProduct)
    return decision.shouldAutoApprove && decision.confidence >= 0.8 // Require high confidence
  } catch (error) {
    console.error('Error in auto-approval check:', error)
    return false // Default to manual approval on error
  }
}
