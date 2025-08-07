import { NextRequest, NextResponse } from 'next/server'
import { updateFlyerImageStatus, addParsedFlyerItem } from '@/lib/firestore-admin'
import { parseImageWithGemini } from '@/lib/gemini'

// Manual test endpoint to bypass Inngest for debugging
export async function POST(request: NextRequest) {
  try {
    console.log('🧪 Manual parsing test started...')
    
    const { flyerImageId, storageUrl } = await request.json()
    
    if (!flyerImageId || !storageUrl) {
      return NextResponse.json(
        { error: 'Missing flyerImageId or storageUrl' },
        { status: 400 }
      )
    }

    console.log(`📝 Testing with flyerImageId: ${flyerImageId}`)
    console.log(`🔗 Storage URL: ${storageUrl}`)

    // Step 1: Update status to processing
    console.log('⏳ Step 1: Updating status to processing...')
    await updateFlyerImageStatus(flyerImageId, 'processing')
    
    // Step 2: Download and parse image
    console.log('🤖 Step 2: Downloading and parsing image...')
    const response = await fetch(storageUrl)
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`)
    }
    
    const buffer = await response.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const contentType = response.headers.get('content-type') || 'image/jpeg'
    const dataUrl = `data:${contentType};base64,${base64}`
    
    console.log('🧠 Step 3: Parsing with Gemini AI...')
    const parseResult = await parseImageWithGemini(dataUrl)
    
    console.log(`📊 Parsed ${parseResult.length} items`)
    
    // Step 3: Save parsed data
    console.log('💾 Step 4: Saving parsed data...')
    const savedItems: string[] = []
    
    for (const item of parseResult) {
      try {
        const itemId = await addParsedFlyerItem({
          flyerImageId,
          productName: item.product_name,
          discountPrice: item.discount_price,
          oldPrice: item.old_price,
          currency: item.currency,
          additionalInfo: item.additional_info,
          confidence: 0.85,
          verified: false,
        })
        savedItems.push(itemId)
        console.log(`✅ Saved item: ${item.product_name}`)
      } catch (error: any) {
        console.error(`❌ Error saving item: ${item.product_name}`, error)
      }
    }
    
    // Step 4: Update status to completed
    console.log('✅ Step 5: Updating status to completed...')
    await updateFlyerImageStatus(flyerImageId, 'completed')
    
    console.log(`🎉 Test completed! Saved ${savedItems.length} items`)
    
    return NextResponse.json({
      success: true,
      flyerImageId,
      itemsSaved: savedItems.length,
      savedItemIds: savedItems,
      parsedData: parseResult
    })
    
  } catch (error: any) {
    console.error('❌ Manual test error:', error)
    return NextResponse.json(
      { error: error.message, stack: error.stack },
      { status: 500 }
    )
  }
}
