import React, { useState } from 'react'
import { MatchedProduct, ParsedFlyerItem } from '@/types'
import { updateDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { CheckCircleIcon, ChevronDownIcon, ChevronUpIcon, StarIcon } from '@heroicons/react/24/solid'
import { StarIcon as StarOutlineIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'

interface ProductMatchesPanelProps {
  parsedItem: ParsedFlyerItem
  onProductSelected?: (productId: string) => void
}

export default function ProductMatchesPanel({ parsedItem, onProductSelected }: ProductMatchesPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSelecting, setIsSelecting] = useState(false)
  
  const hasMatches = parsedItem.matchedProducts && parsedItem.matchedProducts.length > 0
  const matchCount = parsedItem.matchedProducts?.length || 0
  
  const togglePanel = () => {
    setIsOpen(!isOpen)
  }
  
  const selectProduct = async (productId: string) => {
    try {
      setIsSelecting(true)
      
      // Update in Firestore
      const docRef = doc(db, 'parsed-flyer-items', parsedItem.id)
      await updateDoc(docRef, {
        selectedProductId: productId
      })
      
      // Notify parent component
      if (onProductSelected) {
        onProductSelected(productId)
      }
      
      toast.success('Product selected for discount application')
    } catch (error: any) {
      console.error('Error selecting product:', error)
      toast.error(`Failed to select product: ${error.message}`)
    } finally {
      setIsSelecting(false)
    }
  }
  
  // Format relevance score as percentage
  const formatRelevance = (score: number) => {
    return `${Math.round(score * 100)}%`
  }
  
  // Get status badge
  const getStatusBadge = () => {
    if (!parsedItem.matchingStatus || parsedItem.matchingStatus === 'pending') {
      return <span className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded-full">Pending</span>
    }
    
    if (parsedItem.matchingStatus === 'processing') {
      return <span className="px-2 py-1 text-xs bg-blue-200 text-blue-700 rounded-full">Processing</span>
    }
    
    if (parsedItem.matchingStatus === 'failed') {
      return <span className="px-2 py-1 text-xs bg-red-200 text-red-700 rounded-full">Failed</span>
    }
    
    if (hasMatches) {
      return <span className="px-2 py-1 text-xs bg-green-200 text-green-700 rounded-full">{matchCount} Matches</span>
    }
    
    return <span className="px-2 py-1 text-xs bg-yellow-200 text-yellow-700 rounded-full">No Matches</span>
  }
  
  return (
    <div className="border rounded-md overflow-hidden mb-4">
      <div 
        className="flex items-center justify-between p-3 bg-gray-50 cursor-pointer"
        onClick={togglePanel}
      >
        <div className="flex items-center space-x-2">
          <h3 className="font-medium">Product Matches</h3>
          {getStatusBadge()}
        </div>
        <div className="flex items-center">
          {isOpen ? (
            <ChevronUpIcon className="h-5 w-5 text-gray-500" />
          ) : (
            <ChevronDownIcon className="h-5 w-5 text-gray-500" />
          )}
        </div>
      </div>
      
      {isOpen && (
        <div className="p-3">
          {parsedItem.matchingError && (
            <div className="mb-3 p-2 bg-red-50 text-red-700 text-sm rounded">
              Error: {parsedItem.matchingError}
            </div>
          )}
          
          {parsedItem.matchingStatus === 'processing' && (
            <div className="flex items-center justify-center p-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
              <span className="ml-2 text-sm text-gray-600">Matching products...</span>
            </div>
          )}
          
          {parsedItem.matchingStatus === 'completed' && !hasMatches && (
            <div className="p-4 text-center text-gray-500">
              No product matches found
            </div>
          )}
          
          {hasMatches && (
            <div className="space-y-3">
              {parsedItem.matchedProducts!.sort((a, b) => b.relevanceScore - a.relevanceScore).map((match) => (
                <div 
                  key={match.productId} 
                  className={`border rounded p-3 ${parsedItem.selectedProductId === match.productId ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">{match.productData?.name}</div>
                      {match.productData?.macedonianname && (
                        <div className="text-sm text-gray-600">{match.productData.macedonianname}</div>
                      )}
                      <div className="mt-1 flex items-center">
                        <span className="text-xs font-medium bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                          Relevance: {formatRelevance(match.relevanceScore)}
                        </span>
                        {match.productData?.superMarketName && (
                          <span className="ml-2 text-xs text-gray-500">
                            {match.productData.superMarketName}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        selectProduct(match.productId)
                      }}
                      disabled={isSelecting || parsedItem.selectedProductId === match.productId}
                      className="flex items-center"
                    >
                      {parsedItem.selectedProductId === match.productId ? (
                        <CheckCircleIcon className="h-6 w-6 text-green-500" />
                      ) : (
                        <StarOutlineIcon className="h-6 w-6 text-gray-400 hover:text-yellow-500" />
                      )}
                    </button>
                  </div>
                  
                  {match.matchReason && (
                    <div className="mt-2 text-xs text-gray-500">
                      <span className="font-medium">Match reason:</span> {match.matchReason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
