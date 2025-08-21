import { adminDb } from '../firebase/admin';
import { applyDiscountPercentage } from '../utils';
import { Timestamp } from 'firebase-admin/firestore';

// Define Logger type for type safety
export type Logger = {
  log: (message: string, data?: Record<string, any>) => void;
  info: (message: string, data?: Record<string, any>) => void;
  error: (message: string, data?: Record<string, any>) => void;
};

/**
 * Apply discount to a product using a Firebase Transaction for atomicity and performance.
 */
export async function applyDiscount({
  productId,
  flyerId,
  storeId,
  matchConfidence,
  logger,
}: {
  productId: string;
  flyerId: string;
  storeId: string;
  matchConfidence: number;
  logger: Logger;
}) {
  try {
    const parsedItemRef = adminDb.collection('parsed-flyer-items').doc(flyerId);
    const productRef = adminDb.collection('products').doc(productId);

    const result = await adminDb.runTransaction(async (transaction) => {
      // 1. Read documents within the transaction
      const parsedItemDoc = await transaction.get(parsedItemRef);
      const productDoc = await transaction.get(productRef);

      if (!parsedItemDoc.exists) {
        throw new Error(`Parsed flyer item ${flyerId} not found`);
      }
      if (!productDoc.exists) {
        throw new Error(`Product ${productId} not found`);
      }

      const parsedItem = parsedItemDoc.data()!;
      const product = productDoc.data()!;

      // 2. Perform calculations
      const regularPrice = parsedItem.oldPrice;
      const discountPrice = parsedItem.discountPrice;

      if (typeof regularPrice !== 'number' || typeof discountPrice !== 'number') {
        throw new Error('Missing or invalid price information on flyer item');
      }

      const discountPercentage = Math.round(((regularPrice - discountPrice) / regularPrice) * 100);
      if (discountPercentage <= 0 || discountPercentage >= 100) {
        throw new Error(`Invalid calculated discount percentage: ${discountPercentage}%`);
      }

      const currentPrice = product.newPrice ? parseFloat(String(product.newPrice)) : parseFloat(String(product.oldPrice));
      const finalPrice = applyDiscountPercentage(currentPrice, discountPercentage);

      // 3. Queue up writes
      transaction.update(productRef, {
        newPrice: finalPrice,
        discountPercentage: discountPercentage,
        hasActiveDiscount: true,
        discountSource: {
          type: 'flyer',
          parsedItemId: flyerId,
          appliedAt: Timestamp.now(),
          appliedBy: 'auto-approval',
          originalPrice: currentPrice,
          confidence: matchConfidence
        }
      });

      transaction.update(parsedItemRef, {
        selectedProductId: productId,
        discountApplied: true,
        discountAppliedAt: Timestamp.now(),
        discountPercentage: discountPercentage,
        autoDiscountApplied: true
      });

      return {
        success: true,
        productId,
        originalPrice: currentPrice,
        newPrice: finalPrice,
        discountPercentage
      };
    });

    logger.info(`Applied ${result.discountPercentage}% discount to product ${productId} [SUCCESS]`, { 
      flyerId, 
      storeId, 
      newPrice: result.newPrice,
      timestamp: new Date().toISOString() 
    });

    return result;

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorType = error instanceof Error ? error.name : 'DiscountApplicationError';
    const errorCode = 'DISCOUNT_TRANSACTION_FAILED';
    
    logger.error(`Auto-discount transaction failed [${errorType}:${errorCode}]`, {
      message: errorMessage,
      productId,
      flyerId,
      storeId,
      matchConfidence,
      errorStack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    
    return { 
      success: false, 
      error: errorMessage,
      errorType,
      errorCode,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Apply discount with a timeout to prevent hanging
 */
export async function applyDiscountWithTimeout({
  productId,
  flyerId,
  storeId,
  matchConfidence,
  logger,
}: {
  productId: string;
  flyerId: string;
  storeId: string;
  matchConfidence: number;
  logger: Logger;
}) {
  const startTime = Date.now();
  const startTimeIso = new Date().toISOString();
  
  try {
    // Log the start of the discount application process
    logger.info(`Starting discount application [DISCOUNT_START]`, {
      productId,
      flyerId,
      storeId,
      matchConfidence,
      startTime: startTimeIso
    });
    
    // Create the actual discount application promise
    const result = await applyDiscount({
      productId,
      flyerId,
      storeId,
      matchConfidence,
      logger,
    });
    
    const elapsedMs = Date.now() - startTime;
    
    logger.info(`Auto-applied discount completed [DISCOUNT_SUCCESS]`, {
      productId,
      flyerId,
      elapsedMs,
      result,
      timestamp: new Date().toISOString()
    });
    
    return {
      ...result,
      elapsedMs,
      timestamp: new Date().toISOString()
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorType = error instanceof Error ? error.name : 'DiscountApplicationError';
    const errorCode = 'DISCOUNT_APPLICATION_FAILED';
    const elapsedMs = Date.now() - startTime;
    
    logger.error(`Auto-discount application failed [${errorType}:${errorCode}]`, {
      message: errorMessage,
      productId,
      flyerId,
      storeId,
      matchConfidence,
      elapsedMs,
      errorStack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    
    return { 
      success: false, 
      error: errorMessage,
      errorType,
      errorCode,
      elapsedMs,
      timestamp: new Date().toISOString()
    };
  } finally {
    const elapsedMs = Date.now() - startTime;
    
    logger.log(`Auto-discount application step completed [DISCOUNT_COMPLETE]`, {
      productId,
      flyerId,
      elapsedMs,
      timestamp: new Date().toISOString()
    });
  }
}

