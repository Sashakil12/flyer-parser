'use client'

import { useState, useEffect } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { auth } from '@/lib/firebase/config'
import { FlyerImage } from '@/types'
import { useRealtimeFlyerImages } from '@/hooks/useRealtimeFirestore'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronLeftIcon, ChevronRightIcon, EyeIcon, DocumentTextIcon } from '@heroicons/react/24/outline'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { filesize } from 'filesize'

// Items per page options aligned with responsive grid:
// sm: 2 cols | md: 3 cols | lg: 4 cols | xl: 5 cols
// Perfect grid alignment for all breakpoints:
const ITEMS_PER_PAGE_OPTIONS = [
  12,  // sm: 6 rows | md: 4 rows | lg: 3 rows | xl: 2.4 rows
  15,  // sm: 7.5 rows | md: 5 rows | lg: 3.75 rows | xl: 3 rows  
  20,  // sm: 10 rows | md: 6.7 rows | lg: 5 rows | xl: 4 rows
  30,  // sm: 15 rows | md: 10 rows | lg: 7.5 rows | xl: 6 rows
  60   // sm: 30 rows | md: 20 rows | lg: 15 rows | xl: 12 rows
]

export default function FlyersPageContent() {
  const [isClient, setIsClient] = useState(false)
  
  // Call hooks unconditionally at the top level
  const [user, loading] = useAuthState(auth);
  const { flyerImages: allFlyers, isLoading, error } = useRealtimeFlyerImages();
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(12)

  // Ensure we only render client-side content after hydration
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Pagination logic
  const totalFlyers = allFlyers.length
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const flyers = allFlyers.slice(startIndex, endIndex)
  const totalPages = Math.ceil(totalFlyers / itemsPerPage)

  // Handle items per page change
  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage)
    setCurrentPage(1) // Reset to first page when changing items per page
  }

  // During SSR or before hydration, show loading state
  if (!isClient) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner size="large" />
      </div>
    )
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800'
      case 'processing': return 'bg-yellow-100 text-yellow-800'
      case 'failed': return 'bg-red-100 text-red-800'
      case 'pending': return 'bg-blue-100 text-blue-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) return <LoadingSpinner />

  if (!user) {
    return (
      <div className="min-h-screen p-4 sm:p-6 lg:p-8">
        <div className="mb-8">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative bg-white/80 backdrop-blur-sm shadow-xl rounded-xl p-6 border border-white/50">
              <div className="text-center">
                <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
                <p className="text-gray-600">Please log in to view flyers.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Stats Bar */}
      <div className="mb-8">
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
          <div className="relative bg-white/80 backdrop-blur-sm shadow-xl rounded-xl p-6 border border-white/50">
            <div className="text-center">
              <div className="flex items-center justify-center space-x-3">
                <div className="h-12 w-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                  <DocumentTextIcon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">All Flyers</h1>
                  <p className="text-sm text-gray-600">Manage and view your uploaded flyers</p>
                </div>
              </div>
              
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white/60 backdrop-blur-sm rounded-lg p-4 border border-white/30">
                  <div className="text-2xl font-bold text-blue-600">{totalFlyers}</div>
                  <div className="text-sm text-gray-600">Total Flyers</div>
                </div>
                <div className="bg-white/60 backdrop-blur-sm rounded-lg p-4 border border-white/30">
                  <div className="text-2xl font-bold text-green-600">
                    {allFlyers.filter(f => f.processingStatus === 'completed').length}
                  </div>
                  <div className="text-sm text-gray-600">Processed</div>
                </div>
                <div className="bg-white/60 backdrop-blur-sm rounded-lg p-4 border border-white/30">
                  <div className="text-2xl font-bold text-yellow-600">
                    {allFlyers.filter(f => f.processingStatus === 'processing' || f.processingStatus === 'pending').length}
                  </div>
                  <div className="text-sm text-gray-600">In Progress</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Flyers Grid */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-12">
            <LoadingSpinner size="large" />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <div className="text-red-600 mb-2">Error loading flyers</div>
            <div className="text-sm text-gray-500">{error}</div>
          </div>
        ) : flyers.length === 0 ? (
          <div className="text-center py-12">
            <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900">No flyers found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {totalFlyers === 0 ? 'Upload your first flyer to get started.' : 'No flyers match the current page.'}
            </p>
          </div>
        ) : (
          <>
            {/* Grid */}
            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {flyers.map((flyer) => (
                  <Link
                    key={flyer.id}
                    href={`/flyers/${flyer.id}`}
                    className="group relative bg-white rounded-lg border border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all duration-200 overflow-hidden"
                  >
                    {/* Image */}
                    <div className="aspect-[3/4] relative overflow-hidden bg-gray-100">
                      <Image
                        src={flyer.storageUrl}
                        alt={flyer.originalName}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-200"
                        sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw"
                      />
                      
                      {/* Status Badge */}
                      <div className="absolute top-2 right-2">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(flyer.processingStatus)}`}>
                          {flyer.processingStatus}
                        </span>
                      </div>
                    </div>
                    
                    {/* Content */}
                    <div className="p-3">
                      <h3 className="text-sm font-medium text-gray-900 truncate mb-1">
                        {flyer.originalName}
                      </h3>
                      
                      <p className="text-xs text-gray-500 mb-3">
                        {formatDate(flyer.createdAt)}
                      </p>

                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500">
                          {filesize(flyer.size)}
                        </span>
                        
                        <div className="inline-flex items-center px-2 py-1 text-xs font-medium text-indigo-600 group-hover:text-indigo-700 transition-colors">
                          <EyeIcon className="h-4 w-4 mr-1" />
                          Click to view
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Items per page selector - Always show if there are items */}
              {totalFlyers > 0 && (
                <div className="mt-6 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-sm text-gray-600">Show:</span>
                    <select
                      value={itemsPerPage}
                      onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                      className="px-3 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                    >
                      {ITEMS_PER_PAGE_OPTIONS.map(option => (
                        <option key={option} value={option}>
                          {option} items
                        </option>
                      ))}
                    </select>
                    <span className="text-sm text-gray-500">per page</span>
                  </div>
                  
                  {/* Stats */}
                  <div className="text-sm text-gray-600">
                    Showing {startIndex + 1}-{Math.min(endIndex, totalFlyers)} of {totalFlyers} flyers
                  </div>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-center space-x-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="flex items-center px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeftIcon className="h-4 w-4 mr-1" />
                    Previous
                  </button>

                  <div className="flex space-x-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                          currentPage === page
                            ? 'bg-indigo-600 text-white'
                            : 'text-gray-500 bg-white border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="flex items-center px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                    <ChevronRightIcon className="h-4 w-4 ml-1" />
                  </button>
                </div>
              )}
            </div>
            </>
          )}
        </div>
    </div>
  )
}
