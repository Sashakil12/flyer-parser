'use client'

import { useAuthState } from 'react-firebase-hooks/auth'
import { auth } from '@/lib/firebase/config'
import { useRealtimeStats } from '@/hooks/useRealtimeFirestore'
import StatsCards from './StatsCards'
import FileUploadSection from './FileUploadSection'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Link from 'next/link'
import { EyeIcon, DocumentTextIcon, ArrowRightIcon, CogIcon } from '@heroicons/react/24/outline'

export default function Dashboard() {
  const [user, loading] = useAuthState(auth)
  const stats = useRealtimeStats()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner size="large" />
      </div>
    )
  }

  if (!user) {
    return null // This should be handled by auth guard
  }

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* <div className="mb-12 text-center">
          <div className="relative inline-block">
            <div className="absolute -inset-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl blur opacity-25"></div>
            <div className="relative bg-white/80 backdrop-blur-sm px-10 py-8 rounded-2xl shadow-xl border border-white/50">
              <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 bg-clip-text text-transparent leading-tight">
                Flyer Parser
              </h1>
              <p className="mt-4 text-lg text-gray-600 font-medium">
                AI-Powered Dashboard
              </p>
            </div>
          </div>
        </div> */}
      </div>
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        {/* Stats Overview */}
        <StatsCards 
          stats={stats}
          isLoading={loading}
        />

        {/* Quick Navigation */}
        <div className="mt-8">
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Navigation</h2>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/flyers"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
              >
                <EyeIcon className="h-4 w-4 mr-2" />
                View All Flyers ({stats.totalFlyers})
              </Link>
              
              <Link
                href="/auto-approval"
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors"
              >
                <CogIcon className="h-4 w-4 mr-2" />
                Auto-Approval Settings
              </Link>
              
              <div className="text-sm text-gray-600 flex items-center">
                <DocumentTextIcon className="h-4 w-4 mr-2" />
                Total Products Parsed: {stats.totalParsedItems}
              </div>
            </div>
          </div>
        </div>

        {/* Upload Section */}
        <div className="mt-8">
          <FileUploadSection 
            onUploadComplete={() => {}} // Real-time updates handle this
            user={{
              uid: user.uid,
              email: user.email || '',
              displayName: user.displayName || '',
              photoURL: user.photoURL || '',
              role: 'admin' // Default role
            }}
          />
        </div>
      </main>
    </div>
  )
}
