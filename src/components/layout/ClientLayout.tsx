'use client'

import { useAuthState } from 'react-firebase-hooks/auth'
import { auth } from '@/lib/firebase/config'
import Header from '@/components/dashboard/Header'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

interface ClientLayoutProps {
  children: React.ReactNode
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  const [user, loading] = useAuthState(auth)

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="large" />
      </div>
    )
  }

  if (!user) {
    // For unauthenticated pages, just return children without header
    return <>{children}</>
  }

  // For authenticated pages, include the header
  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={{
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || '',
        photoURL: user.photoURL || '',
        role: 'admin' // Default role
      }} />
      <main>
        {children}
      </main>
    </div>
  )
}
