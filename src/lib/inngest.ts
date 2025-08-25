import { Inngest } from 'inngest'

// Create the client with environment-specific configuration
export const inngest = new Inngest({ 
  id: 'badiyala-flyer-parser',
  name: 'Flyer Parser',
  // Enhanced local development configuration
  ...(process.env.NODE_ENV === 'development' && {
    isDev: true,
    devServerURL: 'http://localhost:8288'
  })
})

// Export types for use in functions
export type Events = {
  'flyer/parse': {
    data: {
      flyerImageId: string
      storageUrl: string
      dataUrl: string
    }
  }
  'flyer/parse-status-update': {
    data: {
      flyerImageId: string
      status: 'pending' | 'processing' | 'completed' | 'failed'
      error?: string
    }
  }
  'flyer/product-match': {
    data: {
      parsedItemId: string
      flyerImageId: string
      productName: string
      productNameMk?: string
      productNamePrefixes: string[]
      productNamePrefixesMk?: string[]
      additionalInfo?: string[]
      additionalInfoMk?: string[]
      discountText?: string
      batchId?: string // For batch processing to avoid overload
    }
  }
  'flyer/product-match-status-update': {
    data: {
      parsedItemId: string
      status: 'pending' | 'processing' | 'completed' | 'failed'
      error?: string
    }
  }
  'flyer/extract-images': {
    data: {
      flyerImageId: string
      storageUrl: string
      originalImageDimensions: {
        width: number
        height: number
      }
      parsedItems: Array<{
        id: string
        productName: string
        productNameMk?: string
        discountPrice?: number
        oldPrice: number
        additionalInfo?: string[]
        suggestedRegion?: {
          x: number
          y: number
          width: number
          height: number
          confidence: number
        }
      }>
    }
  }
}
