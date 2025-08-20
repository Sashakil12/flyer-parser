import { adminDb } from '../firebase/admin';

// Define Logger type for type safety
export type Logger = {
  log: (message: string, data?: Record<string, any>) => void;
  info: (message: string, data?: Record<string, any>) => void;
  error: (message: string, data?: Record<string, any>) => void;
};

/**
 * Apply discount to a product based on parsed flyer item data
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
    // Get the parsed flyer item to extract price information
    try {
      const parsedItemRef = adminDb.collection('parsed-flyer-items').doc(flyerId);
      const parsedItemDoc = await parsedItemRef.get();
      const parsedItem = parsedItemDoc.data();
      
      if (!parsedItem) {
        const errorCode = 'PARSED_ITEM_NOT_FOUND';
        logger.error(`Parsed flyer item ${flyerId} not found [${errorCode}]`, { 
          productId,
          errorCode,
          timestamp: new Date().toISOString() 
        });
        return { 
          success: false, 
          error: 'Parsed flyer item not found', 
          errorCode,
          timestamp: new Date().toISOString() 
        };
      }
      
      // Get the product to update
      const productRef = adminDb.collection('products').doc(productId);
      const productDoc = await productRef.get();
      
      if (!productDoc.exists) {
        const errorCode = 'PRODUCT_NOT_FOUND';
        logger.error(`Product ${productId} not found for auto-discount application [${errorCode}]`, {
          flyerId,
          errorCode,
          timestamp: new Date().toISOString()
        });
        return { 
          success: false, 
          error: 'Product not found', 
          errorCode,
          timestamp: new Date().toISOString() 
        };
      }
      
      const product = productDoc.data();
      if (!product) {
        const errorCode = 'EMPTY_PRODUCT_DATA';
        logger.error(`Product ${productId} data is empty [${errorCode}]`, {
          flyerId,
          errorCode,
          timestamp: new Date().toISOString()
        });
        return { 
          success: false, 
          error: 'Product data is empty', 
          errorCode,
          timestamp: new Date().toISOString() 
        };
      }
      
      // Extract price information from parsed item
      const { price, regularPrice, salePrice, discountPercentage } = parsedItem;
      
      // Apply discount logic
      // If the parsed item already has a discount percentage, use it
      // Otherwise, calculate it based on the price difference
      let discountToApply = discountPercentage;
      let discountSource = 'explicit';
      
      if (!discountToApply && regularPrice && salePrice) {
        // Calculate discount percentage
        discountToApply = Math.round(((regularPrice - salePrice) / regularPrice) * 100);
        discountSource = 'calculated';
      }
      
      if (!discountToApply && price) {
        // If we only have a single price, use a default discount (e.g., 10%)
        discountToApply = 10;
        discountSource = 'default';
        logger.info(`Using default discount percentage of ${discountToApply}% [DEFAULT_DISCOUNT]`, { 
          productId, 
          flyerId,
          timestamp: new Date().toISOString() 
        });
      }
      
      if (!discountToApply) {
        const errorCode = 'MISSING_DISCOUNT_DATA';
        logger.error(`Cannot determine discount percentage for product ${productId} [${errorCode}]`, {
          flyerId,
          availablePriceFields: { price, regularPrice, salePrice, discountPercentage },
          errorCode,
          timestamp: new Date().toISOString()
        });
        return { 
          success: false, 
          error: 'Cannot determine discount percentage', 
          errorCode,
          timestamp: new Date().toISOString() 
        };
      }
      
      // Update the product with the discount
      try {
        await productRef.update({
          discountPercentage: discountToApply,
          discountAppliedAt: new Date(),
          discountAppliedBy: 'auto-approval',
          discountSource: `flyer-item-${flyerId}`,
          discountMatchConfidence: matchConfidence,
          discountCalculationMethod: discountSource
        });
      } catch (updateError: unknown) {
        const errorMessage = updateError instanceof Error ? updateError.message : 'Unknown error';
        const errorType = updateError instanceof Error ? updateError.name : 'ProductUpdateError';
        const errorCode = 'PRODUCT_UPDATE_FAILED';
        
        logger.error(`Failed to update product with discount [${errorType}:${errorCode}]`, {
          message: errorMessage,
          productId,
          flyerId,
          discountPercentage: discountToApply,
          errorStack: updateError instanceof Error ? updateError.stack : undefined,
          timestamp: new Date().toISOString()
        });
        
        throw updateError; // Re-throw to be caught by outer catch block
      }
      
      // Update the parsed flyer item to mark that discount was applied
      try {
        await parsedItemRef.update({
          discountApplied: true,
          discountAppliedAt: new Date(),
          discountAppliedToProductId: productId,
          discountPercentage: discountToApply
        });
      } catch (updateError: unknown) {
        const errorMessage = updateError instanceof Error ? updateError.message : 'Unknown error';
        const errorType = updateError instanceof Error ? updateError.name : 'ParsedItemUpdateError';
        const errorCode = 'PARSED_ITEM_UPDATE_FAILED';
        
        logger.error(`Failed to update parsed item with discount status [${errorType}:${errorCode}]`, {
          message: errorMessage,
          productId,
          flyerId,
          discountPercentage: discountToApply,
          errorStack: updateError instanceof Error ? updateError.stack : undefined,
          timestamp: new Date().toISOString()
        });
        
        // Don't throw here since the discount was already applied to the product
        // Just log the error and continue
      }
      
      logger.info(`Applied ${discountToApply}% discount to product ${productId} [SUCCESS]`, { 
        flyerId, 
        storeId, 
        discountPercentage: discountToApply,
        discountSource,
        timestamp: new Date().toISOString()
      });
      
      return { 
        success: true, 
        discountPercentage: discountToApply,
        discountSource,
        timestamp: new Date().toISOString()
      };
    } catch (dbError: unknown) {
      const errorMessage = dbError instanceof Error ? dbError.message : 'Unknown error';
      const errorType = dbError instanceof Error ? dbError.name : 'DatabaseOperationError';
      const errorCode = 'DB_OPERATION_FAILED';
      
      logger.error(`Database operation failed during discount application [${errorType}:${errorCode}]`, {
        message: errorMessage,
        productId,
        flyerId,
        errorStack: dbError instanceof Error ? dbError.stack : undefined,
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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorType = error instanceof Error ? error.name : 'DiscountApplicationError';
    const errorCode = 'DISCOUNT_APPLICATION_FAILED';
    
    logger.error(`Auto-discount application failed [${errorType}:${errorCode}]`, {
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
  const MAX_DISCOUNT_APPLICATION_TIME = 30000; // 30 seconds timeout
  const startTime = Date.now();
  const startTimeIso = new Date().toISOString();
  
  try {
    // Log the start of the discount application process
    logger.info(`Starting discount application with timeout [DISCOUNT_START]`, {
      productId,
      flyerId,
      storeId,
      matchConfidence,
      timeoutMs: MAX_DISCOUNT_APPLICATION_TIME,
      startTime: startTimeIso
    });
    
    // Create a promise that will be rejected after the timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        const timeoutError = new Error(`Auto-discount application timed out after ${MAX_DISCOUNT_APPLICATION_TIME/1000} seconds`);
        timeoutError.name = 'DiscountTimeoutError';
        
        logger.error(`Auto-discount application timed out [DISCOUNT_TIMEOUT]`, {
          productId,
          flyerId,
          timeoutMs: MAX_DISCOUNT_APPLICATION_TIME,
          elapsedMs: Date.now() - startTime,
          timestamp: new Date().toISOString()
        });
        
        reject(timeoutError);
      }, MAX_DISCOUNT_APPLICATION_TIME);
    });
    
    // Create the actual discount application promise
    const discountPromise = applyDiscount({
      productId,
      flyerId,
      storeId,
      matchConfidence,
      logger,
    });
    
    // Wait for the first promise to resolve or reject
    const result = await Promise.race([discountPromise, timeoutPromise]);
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
    const errorCode = errorMessage.includes('timed out') ? 'DISCOUNT_TIMEOUT' : 'DISCOUNT_APPLICATION_FAILED';
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
