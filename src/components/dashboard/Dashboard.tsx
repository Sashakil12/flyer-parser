'use client'

import { useState, useEffect } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { auth } from '@/lib/firebase/config'
import { signOut } from '@/lib/auth'
import { FlyerImage, ParsedFlyerItem } from '@/types'
import { getFlyerImages, getParsedFlyerItems } from '@/lib/firestore'
import Header from './Header'
import StatsCards from './StatsCards'
import FileUploadSection from './FileUploadSection'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Link from 'next/link'
import { EyeIcon, DocumentTextIcon, ArrowRightIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export default function Dashboard() {
  const [user, loading] = useAuthState(auth)
  const [flyerImages, setFlyerImages] = useState<FlyerImage[]>([])
  const [parsedItems, setParsedItems] = useState<ParsedFlyerItem[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (user) {
      refreshData()
      // Auto-refresh every 30 seconds
      const interval = setInterval(refreshData, 30000)
      return () => clearInterval(interval)
    }
  }, [user])

  const refreshData = async () => {
    if (!user) return
    
    try {
      setIsLoading(true)
      const [images, items] = await Promise.all([
        getFlyerImages(),
        getParsedFlyerItems()
      ])
      setFlyerImages(images)
      setParsedItems(items)
    } catch (error) {
      console.error('Error refreshing data:', error)
      toast.error('Failed to refresh data')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      toast.success('Signed out successfully')
    } catch (error) {
      toast.error('Failed to sign out')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} onSignOut={handleSignOut} />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Overview */}
        <StatsCards 
          flyerImages={flyerImages}
          parsedItems={parsedItems}
          isLoading={isLoading}
        />

        {/* Navigation Tabs */}
        <div className="mt-8">
          <div className="sm:hidden">
            <label htmlFor="tabs" className="sr-only">
              Select a tab
            </label>
            <select
              id="tabs"
              name="tabs"
              className="input-field"
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value as typeof activeTab)}
            >
              {tabs.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.label}
                  {tab.count !== undefined && ` (${tab.count})`}
                </option>
              ))}
            </select>
          </div>
          <div className="hidden sm:block">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`
                      whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm
                      ${activeTab === tab.id
                        ? 'border-primary-500 text-primary-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }
                    `}
                  >
                    {tab.label}
                    {tab.count !== undefined && (
                      <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${
                        activeTab === tab.id 
                          ? 'bg-primary-100 text-primary-600'
                          : 'bg-gray-100 text-gray-900'
                      }`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </nav>
            </div>
          </div>
        </div>

        {/* Tab Content */}
        <div className="mt-8">
          {activeTab === 'upload' && (
            <FileUploadSection 
              onUploadComplete={handleDataRefresh}
              user={user}
            />
          )}
          
          {activeTab === 'images' && (
            <FlyerImagesGrid 
              images={flyerImages}
              isLoading={isLoading}
              onRefresh={handleDataRefresh}
            />
          )}
          
          {activeTab === 'parsed' && (
            <ParsedDataTable 
              items={parsedItems}
              isLoading={isLoading}
              onRefresh={handleDataRefresh}
            />
          )}
        </div>
      </main>
    </div>
  )
}
