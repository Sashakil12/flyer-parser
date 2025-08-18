/**
 * Format a number as currency with the specified currency code
 */
export function formatCurrency(amount: number, currencyCode: string = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch (error) {
    // Fallback if the currency code is not supported
    return `${amount.toFixed(2)} ${currencyCode}`
  }
}

/**
 * Extract keywords from a string for search purposes
 */
export function extractKeywords(text: string): string[] {
  if (!text) return []
  
  // Convert to lowercase and remove special characters
  const cleanedText = text.toLowerCase().replace(/[^\w\s]/g, ' ')
  
  // Split by whitespace and filter out empty strings and common words
  const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'of'])
  const words = cleanedText.split(/\s+/).filter(word => word.length > 1 && !commonWords.has(word))
  
  // Remove duplicates
  return Array.from(new Set(words))
}

/**
 * Calculate discount percentage
 */
export function calculateDiscountPercentage(oldPrice: number, newPrice: number): number {
  if (oldPrice <= 0 || newPrice <= 0) return 0
  const percentage = ((oldPrice - newPrice) / oldPrice) * 100
  return Math.round(percentage)
}

/**
 * Apply discount percentage to a price
 */
export function applyDiscountPercentage(price: number, discountPercentage: number): number {
  if (price <= 0 || discountPercentage <= 0 || discountPercentage >= 100) return price
  const discountAmount = (price * discountPercentage) / 100
  return parseFloat((price - discountAmount).toFixed(2))
}
