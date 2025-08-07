/**
 * Currency formatting utilities for the flyer parser
 */

interface CurrencyInfo {
  symbol: string
  name: string
  locale: string
}

// Common currency mappings
export const CURRENCY_INFO: Record<string, CurrencyInfo> = {
  USD: { symbol: '$', name: 'US Dollar', locale: 'en-US' },
  CAD: { symbol: 'C$', name: 'Canadian Dollar', locale: 'en-CA' },
  EUR: { symbol: '€', name: 'Euro', locale: 'en-EU' },
  GBP: { symbol: '£', name: 'British Pound', locale: 'en-GB' },
  AUD: { symbol: 'A$', name: 'Australian Dollar', locale: 'en-AU' },
  JPY: { symbol: '¥', name: 'Japanese Yen', locale: 'ja-JP' },
  CHF: { symbol: 'CHF', name: 'Swiss Franc', locale: 'de-CH' },
  CNY: { symbol: '¥', name: 'Chinese Yuan', locale: 'zh-CN' },
  INR: { symbol: '₹', name: 'Indian Rupee', locale: 'en-IN' },
  MXN: { symbol: 'MX$', name: 'Mexican Peso', locale: 'es-MX' },
  MKD: { symbol: 'ден', name: 'Macedonian Denar', locale: 'mk-MK' },
}

/**
 * Format a price with currency
 */
export function formatPrice(amount: number, currencyCode: string): string {
  const currency = CURRENCY_INFO[currencyCode.toUpperCase()]
  
  if (!currency) {
    // Fallback for unknown currencies
    return `${amount.toFixed(2)} ${currencyCode}`
  }

  try {
    // Use Intl.NumberFormat for proper localization
    const formatter = new Intl.NumberFormat(currency.locale, {
      style: 'currency',
      currency: currencyCode.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    
    return formatter.format(amount)
  } catch (error) {
    // Fallback if Intl.NumberFormat fails
    return `${currency.symbol}${amount.toFixed(2)}`
  }
}

/**
 * Get currency symbol for a currency code
 */
export function getCurrencySymbol(currencyCode: string): string {
  const currency = CURRENCY_INFO[currencyCode.toUpperCase()]
  return currency?.symbol || currencyCode
}

/**
 * Get currency name for a currency code
 */
export function getCurrencyName(currencyCode: string): string {
  const currency = CURRENCY_INFO[currencyCode.toUpperCase()]
  return currency?.name || currencyCode
}

/**
 * Validate if a currency code is supported
 */
export function isSupportedCurrency(currencyCode: string): boolean {
  return currencyCode.toUpperCase() in CURRENCY_INFO
}

/**
 * Get all supported currency codes
 */
export function getSupportedCurrencies(): string[] {
  return Object.keys(CURRENCY_INFO)
}

/**
 * Format a price range (old price to discount price)
 */
export function formatPriceRange(
  oldPrice: number,
  discountPrice: number | undefined,
  currencyCode: string
): string {
  if (!discountPrice || discountPrice >= oldPrice) {
    return formatPrice(oldPrice, currencyCode)
  }
  
  return `${formatPrice(discountPrice, currencyCode)} (was ${formatPrice(oldPrice, currencyCode)})`
}
