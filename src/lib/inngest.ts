import { Inngest } from 'inngest'

// Create Inngest client
export const inngest = new Inngest({ 
  id: 'flyer-parser-app',
  name: 'Super Shop Flyer Parser'
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
}
