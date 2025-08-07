import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '@/lib/inngest'

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Trigger parse API called')
    const body = await request.json()
    console.log('📦 Request body:', body)
    const { flyerImageId, storageUrl } = body

    if (!flyerImageId || !storageUrl) {
      console.log('❌ Missing required fields')
      return NextResponse.json(
        { error: 'Missing required fields: flyerImageId, storageUrl' },
        { status: 400 }
      )
    }

    console.log('🔄 Sending event to Inngest...')
    // Send event to Inngest
    const result = await inngest.send({
      name: 'flyer/parse',
      data: {
        flyerImageId,
        storageUrl,
      },
    })
    
    console.log('✅ Inngest event sent:', result)
    return NextResponse.json({ success: true, inngestResult: result })
  } catch (error: any) {
    console.error('Inngest trigger error:', error)
    return NextResponse.json(
      { error: 'Failed to trigger parsing workflow' },
      { status: 500 }
    )
  }
}
