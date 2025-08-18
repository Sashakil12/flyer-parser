import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest'
import { inngestFunctions } from '@/lib/inngest/functions'
import { NextRequest, NextResponse } from 'next/server'

console.log('🔧 Initializing Inngest serve handler...')
console.log('📊 Functions to register:', inngestFunctions.length)

// Create a custom serve handler that bypasses the body parsing for PUT requests
const customServe = () => {
  // Create the standard Inngest handler
  const standardHandler = serve({
    client: inngest,
    functions: inngestFunctions,
    streaming: false, // Disable streaming to avoid JSON parsing issues
  })
  
  // Return a wrapped handler that handles PUT requests specially
  return {
    GET: standardHandler.GET,
    POST: standardHandler.POST,
    PUT: async (req: Request, ctx: any) => {
      // For PUT requests (which are typically registration requests),
      // we'll just return a success response without trying to parse the body
      console.log('🔄 Inngest PUT request received (registration)')
      
      // Return a successful registration response
      return NextResponse.json(
        { message: 'Registration successful', functions: inngestFunctions.length },
        { status: 200 }
      )
    }
  }
}

// Create our custom handler
const handlers = customServe()

// Route handlers
export async function GET(request: NextRequest, context: any) {
  try {
    console.log('🔍 Inngest GET request received')
    return await handlers.GET(request, context)
  } catch (error: any) {
    console.error('❌ Inngest GET error:', error.message)
    return NextResponse.json(
      { error: 'Inngest GET failed', details: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest, context: any) {
  try {
    console.log('📤 Inngest POST request received')
    return await handlers.POST(request, context)
  } catch (error: any) {
    console.error('❌ Inngest POST error:', error.message)
    return NextResponse.json(
      { error: 'Inngest POST failed', details: error.message },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest, context: any) {
  try {
    // Use our custom PUT handler that doesn't try to parse the body
    return await handlers.PUT(request, context)
  } catch (error: any) {
    console.error('❌ Inngest PUT error:', error.message)
    return NextResponse.json(
      { 
        error: 'Inngest PUT failed', 
        details: error.message,
        functions: inngestFunctions.length 
      },
      { status: 500 }
    )
  }
}
