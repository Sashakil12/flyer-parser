'use client'

import { useEffect, useState } from 'react'
import { onAuthStateChange } from '@/lib/auth'
import { User } from '@/types'
import LoginForm from '@/components/auth/LoginForm'
import Dashboard from '@/components/dashboard/Dashboard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChange((user) => {
      setUser(user)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="large" />
      </div>
    )
  }

  return (
    <main className="min-h-screen">
      {user ? (
        <Dashboard user={user} />
      ) : (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8">
            <div>
              <h1 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                Flyer Parser
              </h1>
              <p className="mt-2 text-center text-sm text-gray-600">
                AI-powered flyer parsing application
              </p>
            </div>
            <LoginForm />
          </div>
        </div>
      )}
    </main>
  )
}
