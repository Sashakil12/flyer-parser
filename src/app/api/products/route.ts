import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase/config'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'

export async function POST(request: NextRequest) {
  try {
    const productData = await request.json()

    // Validate required fields
    const requiredFields = ['name', 'categoryId', 'superMarketName', 'oldPrice', 'newPrice']
    for (const field of requiredFields) {
      if (!productData[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        )
      }
    }

    // Create the product document
    const productDoc = {
      ...productData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      // Ensure numeric fields are properly typed
      oldPrice: typeof productData.oldPrice === 'string' ? productData.oldPrice : productData.oldPrice.toString(),
      newPrice: typeof productData.newPrice === 'number' ? productData.newPrice : parseFloat(productData.newPrice),
      discountPercentage: typeof productData.discountPercentage === 'number' ? productData.discountPercentage : 0,
      // Set default values for missing fields
      iconPath: productData.iconPath || '',
      imagePath: productData.imagePath || '',
      isDeleted: false,
      databaseLocation: productData.databaseLocation || 'nam5',
      // Generate a unique product ID if not provided
      productId: productData.productId || `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }

    // Add to Firestore
    const docRef = await addDoc(collection(db, 'products'), productDoc)

    return NextResponse.json({
      success: true,
      productId: docRef.id,
      message: 'Product created successfully'
    })

  } catch (error: any) {
    console.error('Error creating product:', error)
    return NextResponse.json(
      { error: 'Failed to create product', details: error.message },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    // This could be used to fetch products if needed
    return NextResponse.json({
      message: 'Products API endpoint',
      methods: ['POST']
    })
  } catch (error: any) {
    console.error('Error in products API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
