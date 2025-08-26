import { NextRequest, NextResponse } from 'next/server'
import { fixExtractedImagesStructure, fixAllCompletedItems } from '@/lib/fix-extracted-images'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { itemId, fixAll } = body

    if (fixAll) {
      // Fix all completed items
      const results = await fixAllCompletedItems()
      return NextResponse.json({
        success: true,
        message: `Fixed ${results.fixed} items, ${results.alreadyCorrect} already correct, ${results.errors} errors`,
        results
      })
    } else if (itemId) {
      // Fix specific item
      const result = await fixExtractedImagesStructure(itemId)
      return NextResponse.json({
        success: result.success,
        message: result.success 
          ? (result.fixed ? 'Item structure fixed' : 'Item already has correct structure')
          : `Error: ${result.error}`,
        result
      })
    } else {
      return NextResponse.json({
        success: false,
        message: 'Please provide either itemId or set fixAll to true'
      }, { status: 400 })
    }
  } catch (error) {
    console.error('Fix images API error:', error)
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
