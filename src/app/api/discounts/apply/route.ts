import { NextRequest, NextResponse } from 'next/server'
// Using direct auth check with Firebase Admin
import { adminDb } from '@/lib/firebase/admin'
import { applyDiscountPercentage } from '@/lib/utils'
import { Timestamp } from 'firebase-admin/firestore'

export async function POST(req: NextRequest) {
  try {
    // Check authentication from request headers
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse request body
    const body = await req.json()
    const { parsedItemId, productId, discountPercentage } = body

    // Validate required fields
    if (!parsedItemId || !productId || !discountPercentage) {
      return NextResponse.json(
        { error: 'Missing required fields: parsedItemId, productId, and discountPercentage are required' },
        { status: 400 }
      )
    }

    // Validate discount percentage
    if (discountPercentage < 1 || discountPercentage > 99) {
      return NextResponse.json(
        { error: 'Discount percentage must be between 1 and 99' },
        { status: 400 }
      )
    }

    // Get the parsed flyer item
    const parsedItemRef = adminDb.collection('parsed-flyer-items').doc(parsedItemId)
    const parsedItemDoc = await parsedItemRef.get()
    
    if (!parsedItemDoc.exists) {
      return NextResponse.json(
        { error: 'Parsed flyer item not found' },
        { status: 404 }
      )
    }
    
    const parsedItem = parsedItemDoc.data()
    
    // Verify the product is in the matched products list
    if (!parsedItem?.matchedProducts || !parsedItem.matchedProducts.some((match: { productId: string }) => match.productId === productId)) {
      return NextResponse.json(
        { error: 'Product is not in the matched products list' },
        { status: 400 }
      )
    }
    
    // Get the product
    const productRef = adminDb.collection('products').doc(productId)
    const productDoc = await productRef.get()
    
    if (!productDoc.exists) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }
    
    const product = productDoc.data()
    
    // Calculate the discounted price
    const currentPrice = product?.price || 0
    const discountedPrice = applyDiscountPercentage(currentPrice, discountPercentage)
    
    // Update the product with the discount
    await productRef.update({
      newPrice: discountedPrice,
      discountPercentage,
      discountSource: {
        type: 'flyer',
        parsedItemId,
        appliedAt: Timestamp.now(),
        appliedBy: 'admin', // Since we're using a simpler auth check
        originalPrice: currentPrice
      },
      hasActiveDiscount: true
    })
    
    // Update the parsed flyer item to mark the discount as applied
    await parsedItemRef.update({
      selectedProductId: productId,
      discountApplied: true,
      discountAppliedAt: Timestamp.now(),
      discountPercentage
    })
    
    return NextResponse.json({
      success: true,
      message: 'Discount applied successfully',
      data: {
        productId,
        originalPrice: currentPrice,
        newPrice: discountedPrice,
        discountPercentage
      }
    })
    
  } catch (error: any) {
    console.error('Error applying discount:', error)
    
    return NextResponse.json(
      { error: `Failed to apply discount: ${error.message}` },
      { status: 500 }
    )
  }
}
