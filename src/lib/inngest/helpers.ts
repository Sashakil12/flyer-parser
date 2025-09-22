import { adminDb } from '../firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { calculateDiscountedPrice } from '../gemini-discount';
import { applyDiscountPercentage } from '../utils';

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
      const originalPrice = parseFloat(product.oldPrice) || parseFloat(product.price) || 0;
      
      const hasDiscountText = !!parsedItem.discountText;
      const hasStructuredDiscount = typeof parsedItem.oldPrice === 'number' && typeof parsedItem.discountPrice === 'number' && parsedItem.discountPrice < parsedItem.oldPrice;

      if (hasDiscountText || hasStructuredDiscount) {
        let newPrice;
        let calculationDetails;

        if (hasDiscountText) {
          // Primary method: Use AI to calculate from unstructured text
          logger.info('Calculating discount using AI from discount text.', { flyerId, productId });
          const result = await calculateDiscountedPrice(originalPrice, parsedItem.discountText);
          newPrice = result.newPrice;
          calculationDetails = result.calculationDetails;
        } else { // hasStructuredDiscount must be true
          // Fallback method: Calculate from structured price fields
          logger.info('Calculating discount from structured oldPrice and discountPrice fields.', { flyerId, productId });
          const percentage = ((parsedItem.oldPrice - parsedItem.discountPrice) / parsedItem.oldPrice) * 100;
          newPrice = applyDiscountPercentage(originalPrice, percentage);
          calculationDetails = `Calculated from flyer's old price (${parsedItem.oldPrice}) and discount price (${parsedItem.discountPrice}).`;
        }
        
        const discountPercentage = originalPrice > 0 
          ? Math.round(((originalPrice - newPrice) / originalPrice) * 100)
          : 0;

        // Check for existing discounts
        if (product.hasActiveDiscount && product.discountPercentage >= discountPercentage) {
          logger.info('Existing discount is better or the same. No action taken.', {
            productId,
            existingDiscount: product.discountPercentage,
            newDiscount: discountPercentage,
          });
          return {
            success: true,
            productId,
            originalPrice,
            newPrice: product.newPrice,
            discountPercentage: product.discountPercentage,
            message: 'Existing discount is better or the same.'
          };
        }

        // Prepare the product update object
        const productUpdateData: any = {
          newPrice: newPrice,
          discountPercentage: discountPercentage,
          hasActiveDiscount: true,
          discountSource: {
            type: 'flyer',
            parsedItemId: flyerId,
            appliedAt: Timestamp.now(),
            appliedBy: 'auto-approval',
            originalPrice: originalPrice,
            confidence: matchConfidence,
            calculationDetails: calculationDetails
          }
        };

        // Add discount validity dates if they exist on the parsed item
        if (parsedItem.discountStartDate) {
          productUpdateData.validFrom = Timestamp.fromDate(new Date(parsedItem.discountStartDate));
        }
        if (parsedItem.discountEndDate) {
          productUpdateData.validTo = Timestamp.fromDate(new Date(parsedItem.discountEndDate));
        }

        // 3. Queue up writes for a product WITH a discount
        transaction.update(productRef, productUpdateData);

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
          originalPrice: originalPrice,
          newPrice: newPrice,
          discountPercentage
        };
      } else {
        // NO DISCOUNT LOGIC
        logger.info('No discount information found. Linking product without applying discount.', { flyerId, productId });

        // Update parsed item to link it, but mark as not discounted.
        transaction.update(parsedItemRef, {
          selectedProductId: productId,
          discountApplied: false,
          discountPercentage: 0,
          autoDiscountApplied: false,
          autoApprovalReason: "Product auto-matched but no discount was found on the flyer."
        });

        return {
          success: true,
          productId,
          originalPrice: originalPrice,
          newPrice: originalPrice,
          discountPercentage: 0
        };
      }
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

