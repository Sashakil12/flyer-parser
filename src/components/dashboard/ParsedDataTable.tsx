'use client'

import { useState } from 'react'
import { ParsedFlyerItem } from '@/types'
import { toast } from 'react-hot-toast'
import { 
  PencilIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  EyeIcon
} from '@heroicons/react/24/outline'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { deleteParsedFlyerItem, updateParsedFlyerItem } from '@/lib/firestore'
import { formatPrice as formatCurrencyPrice, formatPriceRange } from '@/lib/currency'

interface ParsedDataTableProps {
  items: ParsedFlyerItem[]
  isLoading: boolean
  onRefresh: () => void
}

export default function ParsedDataTable({ items, isLoading, onRefresh }: ParsedDataTableProps) {
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [verifyingIds, setVerifyingIds] = useState<Set<string>>(new Set())

  const handleDelete = async (item: ParsedFlyerItem) => {
    if (!confirm('Are you sure you want to delete this parsed item? This action cannot be undone.')) {
      return
    }

    setDeletingIds(prev => new Set(prev).add(item.id))
    
    try {
      await deleteParsedFlyerItem(item.id)
      toast.success('Parsed item deleted successfully')
      onRefresh()
    } catch (error: any) {
      toast.error('Failed to delete item: ' + error.message)
    } finally {
      setDeletingIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(item.id)
        return newSet
      })
    }
  }

  const handleVerify = async (item: ParsedFlyerItem) => {
    setVerifyingIds(prev => new Set(prev).add(item.id))
    
    try {
      await updateParsedFlyerItem(item.id, { verified: !item.verified })
      toast.success(item.verified ? 'Item marked as unverified' : 'Item verified successfully')
      onRefresh()
    } catch (error: any) {
      toast.error('Failed to update verification: ' + error.message)
    } finally {
      setVerifyingIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(item.id)
        return newSet
      })
    }
  }

  const formatPrice = (price?: number) => {
    if (price === undefined || price === null) return '-'
    return `$${price.toFixed(2)}`
  }

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Unknown'
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'text-green-600 bg-green-100'
    if (confidence >= 0.7) return 'text-yellow-600 bg-yellow-100'
    return 'text-red-600 bg-red-100'
  }

  if (isLoading) {
    return (
      <div className="card">
        <div className="card-body">
          <LoadingSpinner size="large" />
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="card">
        <div className="card-body text-center py-12">
          <div className="mx-auto h-24 w-24 text-gray-400">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="mt-4 text-sm font-medium text-gray-900">No parsed data</h3>
          <p className="mt-2 text-sm text-gray-500">
            Upload and process flyer images to see parsed product data here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-gray-900">Parsed Product Data</h2>
            <p className="mt-1 text-sm text-gray-500">
              AI-extracted product information from flyer images
            </p>
          </div>
          <div className="text-sm text-gray-500">
            {items.length} item{items.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Product
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Prices
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Additional Info
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Confidence
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Parsed
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {item.productName}
                  </div>
                </td>
                
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {item.discountPrice ? (
                      <div className="flex items-center space-x-2">
                        <span className="text-red-600 font-semibold">
                          {formatCurrencyPrice(item.discountPrice, item.currency)}
                        </span>
                        <span className="text-gray-500 line-through text-xs">
                          {formatCurrencyPrice(item.oldPrice, item.currency)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-900 font-medium">
                        {formatCurrencyPrice(item.oldPrice, item.currency)}
                      </span>
                    )}
                  </div>
                </td>
                
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-500 max-w-xs">
                    {item.additionalInfo && item.additionalInfo.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {item.additionalInfo.slice(0, 3).map((info, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700"
                          >
                            {info}
                          </span>
                        ))}
                        {item.additionalInfo.length > 3 && (
                          <span className="text-xs text-gray-400">
                            +{item.additionalInfo.length - 3} more
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </div>
                </td>
                
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getConfidenceColor(item.confidence)}`}>
                    {Math.round(item.confidence * 100)}%
                  </span>
                </td>
                
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    {item.verified ? (
                      <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2" />
                    ) : (
                      <XCircleIcon className="h-5 w-5 text-gray-400 mr-2" />
                    )}
                    <span className={`text-sm ${item.verified ? 'text-green-700' : 'text-gray-500'}`}>
                      {item.verified ? 'Verified' : 'Unverified'}
                    </span>
                  </div>
                </td>
                
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDate(item.parsedAt)}
                </td>
                
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end space-x-2">
                    <button
                      type="button"
                      onClick={() => handleVerify(item)}
                      disabled={verifyingIds.has(item.id)}
                      className={`p-1 rounded-full transition-colors ${
                        item.verified
                          ? 'text-gray-400 hover:text-gray-600'
                          : 'text-green-600 hover:text-green-800'
                      }`}
                      title={item.verified ? 'Mark as unverified' : 'Mark as verified'}
                    >
                      {verifyingIds.has(item.id) ? (
                        <LoadingSpinner size="small" />
                      ) : item.verified ? (
                        <XCircleIcon className="h-4 w-4" />
                      ) : (
                        <CheckCircleIcon className="h-4 w-4" />
                      )}
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => setEditingId(item.id)}
                      className="text-blue-600 hover:text-blue-800 p-1 rounded-full transition-colors"
                      title="Edit item"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
                      disabled={deletingIds.has(item.id)}
                      className="text-red-600 hover:text-red-800 p-1 rounded-full transition-colors disabled:opacity-50"
                      title="Delete item"
                    >
                      {deletingIds.has(item.id) ? (
                        <LoadingSpinner size="small" />
                      ) : (
                        <TrashIcon className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination could be added here if needed */}
      <div className="bg-white px-4 py-3 border-t border-gray-200 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Showing <span className="font-medium">1</span> to{' '}
            <span className="font-medium">{items.length}</span> of{' '}
            <span className="font-medium">{items.length}</span> results
          </div>
        </div>
      </div>
    </div>
  )
}
