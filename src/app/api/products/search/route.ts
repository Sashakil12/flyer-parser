import { NextRequest, NextResponse } from 'next/server'
import { searchProducts } from '@/lib/firestore-admin'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const query = searchParams.get('q')

  if (!query) {
    return NextResponse.json({ error: 'Search query is required' }, { status: 400 })
  }

  try {
    // We can reuse the existing searchProducts function.
    // We'll search only by the main product name for this manual search.
    const results = await searchProducts(query, undefined, undefined, undefined, 20); // Limit to 20 results

    return NextResponse.json({ success: true, data: results })
  } catch (error: any) {
    console.error('Error searching products:', error)
    return NextResponse.json({ error: `Failed to search products: ${error.message}` }, { status: 500 })
  }
}
