'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useAuthState } from 'react-firebase-hooks/auth'
import { auth } from '@/lib/firebase/config'
import { ParsedFlyerItem } from '@/types'
import { updateParsedFlyerItem, approveParsedFlyerItem } from '@/lib/firestore'
import { useRealtimeFlyer, useRealtimeParsedItems } from '@/hooks/useRealtimeFirestore'
import Link from 'next/link'
import Image from 'next/image'
import { 
  ChevronLeftIcon, 
  ChevronRightIcon, 
  CheckCircleIcon,
  XCircleIcon,
  PencilIcon,
  EyeIcon,
  SparklesIcon,
  CalendarIcon,
  DocumentIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  TagIcon,
  CheckIcon
} from '@heroicons/react/24/outline'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EditProductModal from '@/components/ui/EditProductModal'
import ParsedDataTable from '@/components/dashboard/ParsedDataTable'
import ParsedItemDetail from '@/components/dashboard/ParsedItemDetail'
import { filesize } from 'filesize'
import toast from 'react-hot-toast'
import { formatPrice as formatCurrencyPrice } from '@/lib/currency'

const ITEMS_PER_PAGE = 10

export default function FlyerDetailPage() {
  const params = useParams()
  const flyerId = params?.id as string
  const [user, loading] = useAuthState(auth)
  
  // Real-time hooks
  const { flyer, isLoading: flyerLoading, error: flyerError } = useRealtimeFlyer(flyerId)
  const { parsedItems: allParsedItems, isLoading: itemsLoading } = useRealtimeParsedItems(flyerId)
  
  // Local state
  const [currentPage, setCurrentPage] = useState(1)
  const [editingItem, setEditingItem] = useState<ParsedFlyerItem | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [savingItemId, setSavingItemId] = useState<string | null>(null)
  const [viewingItemId, setViewingItemId] = useState<string | null>(null)
  
  // Pagination logic
  const totalItems = allParsedItems.length
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const parsedItems = allParsedItems.slice(startIndex, endIndex)
  
  const isLoading = flyerLoading || itemsLoading

  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE)

  const handleEditItem = (item: ParsedFlyerItem) => {
    setEditingItem(item)
    setIsEditModalOpen(true)
  }

  const handleSaveItem = async (id: string, updates: Partial<ParsedFlyerItem>) => {
    try {
      setSavingItemId(id)
      await updateParsedFlyerItem(id, updates)
      
      toast.success('Product updated successfully')
      setIsEditModalOpen(false)
      setEditingItem(null)
    } catch (error) {
      console.error('Error updating item:', error)
      toast.error('Failed to update product')
    } finally {
      setSavingItemId(null)
    }
  }


  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800'
      case 'processing': return 'bg-yellow-100 text-yellow-800'
      case 'failed': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR'
    }).format(price)
  }

  if (loading) {
    return <LoadingSpinner />
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600">Please log in to view this flyer.</p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="large" />
      </div>
    )
  }

  if (!flyer) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-lg font-semibold text-gray-900">Flyer not found</h3>
          <p className="mt-1 text-sm text-gray-500">The flyer you're looking for doesn't exist.</p>
          <div className="mt-6">
            <Link
              href="/flyers"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
            >
              Back to Flyers
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Status Bar */}
      <div className="mb-6 text-right">
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(flyer.processingStatus)}`}>
          {flyer.processingStatus}
        </span>
      </div>

      {/* Content */}
      <div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Flyer Image */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border overflow-hidden sticky top-8">
              <div className="min-h-[300px] max-h-[500px] bg-gray-100 relative">
                <Image
                  src={flyer.storageUrl}
                  alt={flyer.originalName}
                  fill
                  className="object-contain"
                  sizes="(max-width: 1024px) 100vw, 33vw"
                />
              </div>
              
              {/* Flyer Info */}
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Flyer Details</h2>
                
                <div className="space-y-3">
                  <div className="flex items-center text-sm text-gray-600">
                    <DocumentIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="truncate">{flyer.originalName}</span>
                  </div>
                  
                  <div className="flex items-center text-sm text-gray-600">
                    <CalendarIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span>{formatDate(flyer.createdAt)}</span>
                  </div>
                  
                  <div className="flex items-center text-sm text-gray-600">
                    <TagIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span>{filesize(flyer.size)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Parsed Data */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="px-6 py-4 border-b">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Parsed Products ({totalItems})
                  </h2>
                  
                  {flyer.processingStatus === 'processing' && (
                    <div className="flex items-center text-sm text-yellow-600">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600 mr-2"></div>
                      Processing...
                    </div>
                  )}
                </div>
              </div>

              {flyer.processingStatus === 'failed' ? (
                <div className="p-6 text-center">
                  <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-400" />
                  <h3 className="mt-2 text-sm font-semibold text-gray-900">Processing Failed</h3>
                  <p className="mt-1 text-sm text-gray-500">Unable to extract product information from this flyer.</p>
                  {flyer.failureReason && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                      <p className="text-xs font-medium text-red-700">Failure Reason:</p>
                      <p className="text-xs text-red-600 mt-1">{flyer.failureReason}</p>
                    </div>
                  )}
                </div>
              ) : totalItems === 0 ? (
                <div className="p-12 text-center">
                  <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-semibold text-gray-900">
                    {flyer.processingStatus === 'processing' ? 'Processing...' : 'No products found'}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {flyer.processingStatus === 'processing' 
                      ? 'AI is analyzing this flyer. Products will appear here once processing is complete.'
                      : 'No products were detected in this flyer.'
                    }
                  </p>
                </div>
              ) : (
                <>
                  {/* Products List */}
                  <div className="divide-y divide-gray-200">
                    {parsedItems.map((item, index) => (
                      <div 
                        key={item.id} 
                        className="p-6 cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => setViewingItemId(item.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3">
                              <div>
                                <h3 className="text-base font-medium text-gray-900">
                                  {item.productName}
                                </h3>
                                {item.productNameMk && (
                                  <div className="text-sm text-gray-600 mt-1">
                                    🇲🇰 {item.productNameMk}
                                  </div>
                                )}
                              </div>
                              
                              <div className="flex items-center space-x-2">
                                {item.autoApprovalStatus === 'success' && (
                                  <div 
                                    className="flex items-center space-x-1 cursor-help"
                                    title={`Auto-approved with ${item.autoApprovalConfidence ? Math.round(item.autoApprovalConfidence * 100) : 'unknown'}% confidence${item.autoApprovalReason ? `\n\nReason: ${item.autoApprovalReason}` : ''}`}
                                  >
                                    <SparklesIcon className="h-4 w-4 text-purple-500" />
                                    <span className="text-xs text-purple-600 font-medium">Auto</span>
                                  </div>
                                )}
                                {item.autoApprovalStatus === 'failed' && (
                                  <div 
                                    className="flex items-center space-x-1 cursor-help"
                                    title={`Auto-approval failed\n\nReason: ${item.autoApprovalFailureReason || 'Unknown reason'}`}
                                  >
                                    <ExclamationTriangleIcon className="h-4 w-4 text-amber-500" />
                                    <span className="text-xs text-amber-600 font-medium">Manual</span>
                                  </div>
                                )}
                                {item.verified ? (
                                  <CheckCircleIcon className="h-5 w-5 text-green-500" />
                                ) : (
                                  <div className="h-5 w-5 rounded-full bg-gray-300"></div>
                                )}
                              </div>
                            </div>

                            {/* Prices */}
                            <div className="mt-2 flex items-center space-x-4">
                              {item.discountPrice && (
                                <span className="text-lg font-semibold text-red-600">
                                  {formatCurrencyPrice(item.discountPrice, item.currency)}
                                </span>
                              )}
                              
                              <span className={`text-sm ${item.discountPrice ? 'line-through text-gray-500' : 'text-lg font-semibold text-gray-900'}`}>
                                {formatCurrencyPrice(item.oldPrice, item.currency)}
                              </span>
                              
                              {item.discountPrice && (
                                <span className="text-sm font-medium text-green-600">
                                  {Math.round((1 - item.discountPrice / item.oldPrice) * 100)}% OFF
                                </span>
                              )}
                            </div>

                            {/* Macedonian Price Text */}
                            {(item.discountPriceMk || item.oldPriceMk) && (
                              <div className="mt-1 text-sm text-gray-500">
                                {item.discountPriceMk ? (
                                  <div className="flex items-center space-x-2">
                                    <span className="text-red-500">На сајт: {item.discountPriceMk}</span>
                                    {item.oldPriceMk && (
                                      <span className="line-through">{item.oldPriceMk}</span>
                                    )}
                                  </div>
                                ) : item.oldPriceMk ? (
                                  <span>🇲🇰 {item.oldPriceMk}</span>
                                ) : null}
                              </div>
                            )}

                            {/* Additional Info */}
                            {item.additionalInfo && item.additionalInfo.length > 0 && (
                              <div className="mt-3">
                                <div className="flex flex-wrap gap-2">
                                  {item.additionalInfo.map((info, infoIndex) => (
                                    <span key={infoIndex} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                                      {info}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Macedonian Additional Info */}
                            {item.additionalInfoMk && item.additionalInfoMk.length > 0 && (
                              <div className="mt-2">
                                <div className="flex flex-wrap gap-2">
                                  {item.additionalInfoMk.map((info, infoIndex) => (
                                    <span key={infoIndex} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                      🇲🇰 {info}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="ml-4 flex flex-col items-end space-y-2">
                            <div className="text-xs text-gray-500">
                              Confidence: {Math.round(item.confidence * 100)}%
                            </div>
                            
                            <div className="flex space-x-2">
                              {/* Edit Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleEditItem(item)
                                }}
                                className="p-2 text-gray-400 hover:text-indigo-600 transition-colors"
                                title="Edit product"
                              >
                                <PencilIcon className="h-4 w-4" />
                              </button>
                              
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="px-6 py-4 border-t bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-700">
                          Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, totalItems)} of {totalItems} products
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1}
                            className="flex items-center px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ChevronLeftIcon className="h-4 w-4 mr-1" />
                            Previous
                          </button>

                          <div className="flex space-x-1">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                              let page
                              if (totalPages <= 5) {
                                page = i + 1
                              } else if (currentPage <= 3) {
                                page = i + 1
                              } else if (currentPage >= totalPages - 2) {
                                page = totalPages - 4 + i
                              } else {
                                page = currentPage - 2 + i
                              }
                              
                              return (
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
                              )
                            })}
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
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
        
      {/* Edit Product Modal */}
      <EditProductModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setEditingItem(null)
        }}
        item={editingItem}
        onSave={handleSaveItem}
        isLoading={savingItemId !== null}
      />

      {/* ParsedItemDetail Modal */}
      {viewingItemId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Product Details</h2>
                <button
                  onClick={() => setViewingItemId(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircleIcon className="h-6 w-6" />
                </button>
              </div>
              <ParsedItemDetail 
                item={allParsedItems.find(item => item.id === viewingItemId)!}
                onClose={() => setViewingItemId(null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
