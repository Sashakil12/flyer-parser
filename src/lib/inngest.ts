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
