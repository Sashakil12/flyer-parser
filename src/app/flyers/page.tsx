'use client'

import { useState } from 'react'
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

export default function FlyersPage() {
  const [user, loading] = useAuthState(auth)
  const { flyerImages: allFlyers, isLoading, error } = useRealtimeFlyerImages()
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(12)

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

  // Note: Sorting is already handled by the real-time hook

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
        {/* Stats Bar */}
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
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {totalFlyers}
                  </p>
                  <p className="text-sm text-gray-600 font-medium">Total Flyer Images</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div>
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <LoadingSpinner size="large" />
          </div>
        ) : flyers.length === 0 ? (
          <div className="text-center py-12">
            <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900">No flyers</h3>
            <p className="mt-1 text-sm text-gray-500">Get started by uploading your first flyer.</p>
            <div className="mt-6">
              <Link
                href="/"
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
              >
                Upload Flyer
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Image Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {flyers.map((flyer) => (
                <Link key={flyer.id} href={`/flyers/${flyer.id}`} className="relative group block cursor-pointer transform transition-transform hover:scale-[1.01]">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl blur opacity-0 group-hover:opacity-25 transition duration-500"></div>
                  <div className="relative bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border border-white/50 hover:shadow-2xl transition-all duration-300 group-hover:scale-[1.02]">
                  {/* Image */}
                  <div className="relative min-h-[200px] max-h-[300px] bg-gray-100 rounded-t-lg overflow-hidden">
                    <Image
                      src={flyer.storageUrl}
                      alt={flyer.originalName}
                      fill
                      className="object-contain"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
                    />
                    
                    {/* Status Badge */}
                    <div className="absolute top-2 right-2">
                      <div className="flex items-center space-x-2">
                        <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(flyer.processingStatus)}`}>
                          {flyer.processingStatus.charAt(0).toUpperCase() + flyer.processingStatus.slice(1)}
                        </span>
                        {flyer.processingStatus === 'failed' && flyer.failureReason && (
                          <div className="group relative">
                            <svg className="h-4 w-4 text-red-500 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block">
                              <div className="bg-red-600 text-white text-xs rounded-lg py-2 px-3 shadow-lg max-w-xs">
                                <div className="font-medium mb-1">Failure Reason:</div>
                                <div>{flyer.failureReason}</div>
                                <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-red-600"></div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <h3 className="text-sm font-medium text-gray-900 truncate mb-2">
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
          </>
        )}
      </div>
    </div>
  )
}
