import { NextRequest, NextResponse } from 'next/server'
// Using direct auth check with Firebase Admin
import { adminDb } from '@/lib/firebase/admin'
import { applyDiscountPercentage } from '@/lib/utils'
import { Timestamp } from 'firebase-admin/firestore'

export async function POST(req: NextRequest) {
  console.log('--- APPLY DISCOUNT API START ---');
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('[LOG] Unauthorized access attempt.');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    console.log('[LOG] Request Body:', body);

    const { parsedItemId, productId: newProductId, discountPercentage } = body;
    console.log(`[LOG] Parsed IDs: parsedItemId=${parsedItemId}, newProductId=${newProductId}`);

    if (!parsedItemId || !newProductId || !discountPercentage) {
      console.log('[LOG] Missing required fields.');
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (typeof newProductId !== 'string' || !newProductId) {
      console.log(`[LOG] Invalid newProductId: ${newProductId}`);
      return NextResponse.json({ error: 'Invalid Product ID provided' }, { status: 400 });
    }

    const parsedItemRef = adminDb.collection('parsed-flyer-items').doc(parsedItemId);
    const newProductQuery = adminDb.collection('products').where('productId', '==', newProductId).limit(1);
    
    await adminDb.runTransaction(async (transaction) => {
      console.log('[LOG] Transaction Started.');
      
      // 1. ALL READS FIRST
      console.log(`[LOG] Reading parsedItemDoc: ${parsedItemRef.path}`);
      const parsedItemDoc = await transaction.get(parsedItemRef);
      if (!parsedItemDoc.exists) {
        console.log('[LOG] Parsed flyer item not found.');
        throw new Error('Parsed flyer item not found');
      }
      console.log('[LOG] Parsed flyer item found.');
      
      console.log(`[LOG] Querying for new product with productId: ${newProductId}`);
      const newProductSnapshot = await transaction.get(newProductQuery);
      if (newProductSnapshot.empty) {
        console.log('[LOG] New product not found.');
        throw new Error('New product not found');
      }
      const newProductDoc = newProductSnapshot.docs[0];
      const newProductRef = newProductDoc.ref;
      console.log(`[LOG] New product found with document ID: ${newProductDoc.id}`);
      
      const parsedItem = parsedItemDoc.data()!;
      const oldProductId = parsedItem.selectedProductId;
      let oldProductRef: FirebaseFirestore.DocumentReference | null = null;
      console.log(`[LOG] Old Product ID from parsedItem: ${oldProductId}`);

      if (oldProductId && oldProductId !== newProductId) {
        const oldProductQuery = adminDb.collection('products').where('productId', '==', oldProductId).limit(1);
        console.log(`[LOG] Querying for old product with productId: ${oldProductId}`);
        const oldProductSnapshot = await transaction.get(oldProductQuery);
        if (!oldProductSnapshot.empty) {
          oldProductRef = oldProductSnapshot.docs[0].ref;
          console.log(`[LOG] Old product found with document ID: ${oldProductRef.id}`);
        }
      }

      // 2. ALL WRITES LAST
      console.log('[LOG] Preparing writes...');
      if (oldProductRef) {
        console.log(`[LOG] Queuing update to remove discount from old product: ${oldProductRef.path}`);
        transaction.update(oldProductRef, {
          hasActiveDiscount: false,
          newPrice: null,
          discountPercentage: null,
          discountSource: null,
          validFrom: null,
          validTo: null,
        });
      }

      const newProduct = newProductDoc.data()!;
      const currentPrice = parseFloat(newProduct.oldPrice as string) || 0;
      const discountedPrice = applyDiscountPercentage(currentPrice, discountPercentage);

      const productUpdateData: any = {
        newPrice: discountedPrice,
        discountPercentage,
        hasActiveDiscount: true,
        discountSource: {
          type: 'flyer',
          parsedItemId,
          appliedAt: Timestamp.now(),
          appliedBy: 'admin',
          originalPrice: currentPrice,
          confidence: 1,
        },
      };

      if (parsedItem.discountStartDate) {
        productUpdateData.validFrom = Timestamp.fromDate(new Date(parsedItem.discountStartDate));
      }
      if (parsedItem.discountEndDate) {
        productUpdateData.validTo = Timestamp.fromDate(new Date(parsedItem.discountEndDate));
      }

      console.log(`[LOG] Queuing update for new product: ${newProductRef.path}`, productUpdateData);
      transaction.update(newProductRef, productUpdateData);

      const parsedItemUpdateData = {
        selectedProductId: newProductId,
        discountApplied: true,
        discountAppliedAt: Timestamp.now(),
        discountPercentage,
        autoDiscountApplied: false,
      };
      console.log(`[LOG] Queuing update for parsed item: ${parsedItemRef.path}`, parsedItemUpdateData);
      transaction.update(parsedItemRef, parsedItemUpdateData);
      console.log('[LOG] All writes queued. Committing transaction...');
    });

    console.log('[LOG] Transaction committed successfully.');
    return NextResponse.json({ success: true, message: 'Discount applied successfully' });

  } catch (error: any) {
    console.error('--- APPLY DISCOUNT API ERROR ---');
    console.error('Error applying discount:', error);
    console.error('--- END APPLY DISCOUNT API ERROR ---');
    return NextResponse.json({ error: `Failed to apply discount: ${error.message}` }, { status: 500 });
  } finally {
    console.log('--- APPLY DISCOUNT API END ---');
  }
}
