'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useAuthState } from 'react-firebase-hooks/auth'
import { auth } from '@/lib/firebase/config'
import { FlyerImage, ParsedFlyerItem } from '@/types'
import { getFlyerImages, getParsedFlyerItems } from '@/lib/firestore'
import Link from 'next/link'
import Image from 'next/image'
import { 
  ChevronLeftIcon, 
  ChevronRightIcon, 
  CheckCircleIcon, 
  XCircleIcon,
  DocumentTextIcon,
  CalendarIcon,
  DocumentIcon,
  TagIcon
} from '@heroicons/react/24/outline'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import toast from 'react-hot-toast'

const ITEMS_PER_PAGE = 10

export default function FlyerDetailPage() {
  const params = useParams()
  const flyerId = params?.id as string
  const [user, loading] = useAuthState(auth)
  
  const [flyer, setFlyer] = useState<FlyerImage | null>(null)
  const [parsedItems, setParsedItems] = useState<ParsedFlyerItem[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (user && flyerId) {
      loadFlyerDetails()
    }
  }, [user, flyerId, currentPage])

  const loadFlyerDetails = async () => {
    try {
      setIsLoading(true)
      
      // Load flyer details
      const flyers = await getFlyerImages()
      const flyerData = flyers.find(f => f.id === flyerId)
      
      if (!flyerData) {
        toast.error('Flyer not found')
        return
      }
      
      setFlyer(flyerData)
      
      // Load parsed items
      const items = await getParsedFlyerItems(flyerId)
      setTotalItems(items.length)
      
      // Paginate items
      const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
      const endIndex = startIndex + ITEMS_PER_PAGE
      setParsedItems(items.slice(startIndex, endIndex))
      
    } catch (error) {
      console.error('Error loading flyer details:', error)
      toast.error('Failed to load flyer details')
    } finally {
      setIsLoading(false)
    }
  }

  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE)

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
      currency: 'USD'
    }).format(price)
  }

  if (loading) return <LoadingSpinner />

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
        <LoadingSpinner size="lg" />
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link 
                href="/flyers" 
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                ← Back to Flyers
              </Link>
              <h1 className="text-xl font-bold text-gray-900 truncate">
                {flyer.originalName}
              </h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(flyer.processingStatus)}`}>
                {flyer.processingStatus}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Flyer Image */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border overflow-hidden sticky top-8">
              <div className="aspect-[3/4] bg-gray-100 relative">
                <Image
                  src={flyer.storageUrl}
                  alt={flyer.originalName}
                  fill
                  className="object-cover"
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
                    <span>{(flyer.size / 1024 / 1024).toFixed(1)} MB</span>
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
                <div className="p-12 text-center">
                  <XCircleIcon className="mx-auto h-12 w-12 text-red-400" />
                  <h3 className="mt-2 text-sm font-semibold text-gray-900">Processing Failed</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    There was an error processing this flyer. Please try uploading again.
                  </p>
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
                      <div key={item.id} className="p-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3">
                              <h3 className="text-base font-medium text-gray-900">
                                {item.productName}
                              </h3>
                              
                              {item.verified ? (
                                <CheckCircleIcon className="h-5 w-5 text-green-500" />
                              ) : (
                                <div className="h-5 w-5 rounded-full bg-gray-300"></div>
                              )}
                            </div>

                            {/* Prices */}
                            <div className="mt-2 flex items-center space-x-4">
                              {item.discountPrice && (
                                <span className="text-lg font-semibold text-green-600">
                                  {formatPrice(item.discountPrice)}
                                </span>
                              )}
                              
                              <span className={`text-sm ${item.discountPrice ? 'line-through text-gray-500' : 'text-lg font-semibold text-gray-900'}`}>
                                {formatPrice(item.oldPrice)}
                              </span>
                              
                              {item.discountPrice && (
                                <span className="text-sm font-medium text-green-600">
                                  {Math.round((1 - item.discountPrice / item.oldPrice) * 100)}% OFF
                                </span>
                              )}
                            </div>

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
                          </div>

                          <div className="ml-4 text-right">
                            <div className="text-xs text-gray-500">
                              Confidence: {Math.round(item.confidence * 100)}%
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
      </main>
    </div>
  )
}
