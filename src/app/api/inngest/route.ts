import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest'
import { inngestFunctions } from '@/lib/inngest/functions'

console.log('🔧 Initializing Inngest serve handler...')
console.log('📊 Functions to register:', inngestFunctions.length)

// Create the standard Inngest handler with proper configuration
const handler = serve({
  client: inngest,
  functions: inngestFunctions,
  // Set streaming to 'allow' for better compatibility
  streaming: 'allow',
  // Add more verbose logging
  logLevel: 'debug'
})

// Export GET and POST handlers directly
export const { GET, POST,PUT } = handler

