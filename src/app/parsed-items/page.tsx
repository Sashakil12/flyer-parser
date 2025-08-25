'use client'

import { useState, useMemo, useEffect } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { auth } from '@/lib/firebase/config'
import { useRealtimeParsedItems } from '@/hooks/useRealtimeFirestore'
import ParsedItemCard from '@/components/parsed-items/ParsedItemCard'
import AddProductModal from '@/components/products/AddProductModal'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { ChevronLeftIcon, ChevronRightIcon, DocumentTextIcon } from '@heroicons/react/24/outline'
import { ParsedFlyerItem } from '@/types'
import { toast } from 'react-hot-toast'

const ITEMS_PER_PAGE = 10

type FilterStatus = 'all' | 'success' | 'failed';

export default function ParsedItemsPage() {
  const [user, loading] = useAuthState(auth)
  const [currentPage, setCurrentPage] = useState(1)
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [selectedItemForProduct, setSelectedItemForProduct] = useState<ParsedFlyerItem | null>(null)
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false)

  const autoApprovalStatusFilter = useMemo(() => {
    if (filter === 'success' || filter === 'failed') return filter;
    return undefined;
  }, [filter]);

  const { parsedItems: filteredItems, isLoading } = useRealtimeParsedItems(undefined, autoApprovalStatusFilter)

  // Pagination logic
  const totalItems = filteredItems.length
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const paginatedItems = filteredItems.slice(startIndex, endIndex)

  const handleFilterChange = (newFilter: FilterStatus) => {
    setFilter(newFilter);
    setCurrentPage(1); // Reset to first page when filter changes
  };

  const handleAddProduct = (item: ParsedFlyerItem) => {
    setSelectedItemForProduct(item)
    setIsAddProductModalOpen(true)
  }

  const handleCloseAddProductModal = () => {
    setIsAddProductModalOpen(false)
    setSelectedItemForProduct(null)
  }

  const handleProductCreated = (productId: string) => {
    toast.success(`Product created successfully! ID: ${productId}`)
    // Optionally refresh the data or update the item status
  }

  const handleViewDetails = (item: ParsedFlyerItem) => {
    // Navigate to item details or open a detail modal
    console.log('View details for item:', item.id)
  }

  if (loading) {
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

  const filterButtons: { label: string; value: FilterStatus }[] = [
    { label: 'All', value: 'all' },
    { label: 'Auto-Approved', value: 'success' },
    { label: 'Manual Review', value: 'failed' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">All Parsed Products</h1>
        <p className="mt-2 text-gray-600">
          Review AI-extracted products and their database matches.
        </p>
      </div>

      {/* Filter Buttons */}
      <div className="mb-6">
        <div className="flex items-center space-x-2 border-b border-gray-200 pb-2">
          <span className="text-sm font-medium text-gray-600">Filter by:</span>
          {filterButtons.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => handleFilterChange(value)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                filter === value
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 bg-white hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <LoadingSpinner size="large" />
        </div>
      ) : paginatedItems.length === 0 ? (
        <div className="text-center py-12">
          <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900">
            {filter === 'all' ? 'No Parsed Products' : 'No items match this filter'}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {filter === 'all' ? 'Upload a flyer to get started.' : 'Try selecting another filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {paginatedItems.map(item => (
            <ParsedItemCard 
              key={item.id} 
              item={item} 
              onAddProduct={handleAddProduct}
              onViewDetails={handleViewDetails}
            />
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

      {/* Add Product Modal */}
      {selectedItemForProduct && (
        <AddProductModal
          isOpen={isAddProductModalOpen}
          onClose={handleCloseAddProductModal}
          parsedItem={selectedItemForProduct}
          onSuccess={handleProductCreated}
        />
      )}
    </div>
  )
}
