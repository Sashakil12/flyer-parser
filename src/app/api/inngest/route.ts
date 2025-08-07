import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest'
import { inngestFunctions } from '@/lib/inngest/functions'
import { NextRequest } from 'next/server'

console.log('🔧 Initializing Inngest serve handler...')
console.log('📊 Functions to register:', inngestFunctions.length)

// Create the Inngest handlers with proper error handling
const handlers = serve({
  client: inngest,
  functions: inngestFunctions,
  streaming: false, // Disable streaming to avoid JSON parsing issues
})

// Wrap handlers with error handling
export async function GET(request: NextRequest, context: any) {
  try {
    console.log('🔍 Inngest GET request received')
    return await handlers.GET(request, context)
  } catch (error: any) {
    console.error('❌ Inngest GET error:', error.message)
    return new Response(JSON.stringify({ error: 'Inngest GET failed', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

export async function POST(request: NextRequest, context: any) {
  try {
    console.log('📤 Inngest POST request received')
    return await handlers.POST(request, context)
  } catch (error: any) {
    console.error('❌ Inngest POST error:', error.message)
    return new Response(JSON.stringify({ error: 'Inngest POST failed', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

export async function PUT(request: NextRequest, context: any) {
  try {
    console.log('🔄 Inngest PUT request received (registration)')
    
    // Check if request has body before trying to parse
    const contentLength = request.headers.get('content-length')
    if (!contentLength || contentLength === '0') {
      console.log('⚠️ PUT request has no body, creating empty body')
      // Create a new request with empty JSON body for registration
      const newRequest = new Request(request.url, {
        method: 'PUT',
        headers: request.headers,
        body: JSON.stringify({})
      })
      return await handlers.PUT(newRequest as any, context)
    }
    
    return await handlers.PUT(request, context)
  } catch (error: any) {
    console.error('❌ Inngest PUT error:', error.message)
    return new Response(JSON.stringify({ 
      error: 'Inngest PUT failed', 
      details: error.message,
      functions: inngestFunctions.length 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
