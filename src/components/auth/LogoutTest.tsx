'use client'

import { useState } from 'react'
import { signOut } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'

/**
 * Test component to verify logout functionality
 * This component can be temporarily added to any page to test logout behavior
 */
export default function LogoutTest() {
  const [isSigningOut, setIsSigningOut] = useState(false)
  const router = useRouter()

  const testLogout = async () => {
    try {
      setIsSigningOut(true)
      console.log('Starting logout test...')
      
      // Call the signOut function
      await signOut()
      
      console.log('Logout successful, redirecting to login page...')
      toast.success('Logout test successful - redirecting to login')
      
      // Redirect to login page
      router.push('/')
      
    } catch (error: any) {
      console.error('Logout test failed:', error)
      toast.error(`Logout test failed: ${error.message}`)
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={testLogout}
        disabled={isSigningOut}
        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isSigningOut ? (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Testing Logout...
          </>
        ) : (
          'Test Logout'
        )}
      </button>
    </div>
  )
}
