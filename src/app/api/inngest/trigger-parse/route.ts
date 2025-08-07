import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '@/lib/inngest'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { flyerImageId, storageUrl, dataUrl } = body

    if (!flyerImageId || !storageUrl || !dataUrl) {
      return NextResponse.json(
        { error: 'Missing required fields: flyerImageId, storageUrl, dataUrl' },
        { status: 400 }
      )
    }

    // Send event to Inngest
    await inngest.send({
      name: 'flyer/parse',
      data: {
        flyerImageId,
        storageUrl,
        dataUrl,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Inngest trigger error:', error)
    return NextResponse.json(
      { error: 'Failed to trigger parsing workflow' },
      { status: 500 }
    )
  }
}
