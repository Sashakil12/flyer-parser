'use client'

import { useState } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { auth } from '@/lib/firebase/config'
import { useRealtimeParsedItems } from '@/hooks/useRealtimeFirestore'
import ParsedItemCard from '@/components/parsed-items/ParsedItemCard'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { ChevronLeftIcon, ChevronRightIcon, DocumentTextIcon } from '@heroicons/react/24/outline'

const ITEMS_PER_PAGE = 10

export default function ParsedItemsPage() {
  const [user, loading] = useAuthState(auth)
  const { parsedItems: allItems, isLoading } = useRealtimeParsedItems()
  const [currentPage, setCurrentPage] = useState(1)

  // Pagination logic
  const totalItems = allItems.length
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const paginatedItems = allItems.slice(startIndex, endIndex)

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
        <p className="text-gray-600">Please log in to view parsed items.</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">All Parsed Products</h1>
        <p className="mt-2 text-gray-600">
          Review AI-extracted products and their database matches.
        </p>
      </div>

      {paginatedItems.length === 0 ? (
        <div className="text-center py-12">
          <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900">No Parsed Products</h3>
          <p className="mt-1 text-sm text-gray-500">Upload a flyer to get started.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {paginatedItems.map(item => (
            <ParsedItemCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Showing {startIndex + 1} to {Math.min(endIndex, totalItems)} of {totalItems} items
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex items-center px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              <ChevronLeftIcon className="h-4 w-4 mr-1" />
              Previous
            </button>
            
            <div className="flex items-center space-x-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-2 text-sm font-medium rounded-md ${
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
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="flex items-center px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Next
              <ChevronRightIcon className="h-4 w-4 ml-1" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
