import React, { useState, useEffect } from 'react'
import { MatchedProduct, ParsedFlyerItem, Product, isProduct } from '@/types'
import { updateDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { CheckCircleIcon, ChevronDownIcon, ChevronUpIcon, StarIcon, SparklesIcon, MagnifyingGlassIcon } from '@heroicons/react/24/solid'
import { StarIcon as StarOutlineIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import Image from 'next/image'

interface ProductMatchesPanelProps {
  parsedItem: ParsedFlyerItem
  onProductSelected?: (productId: string) => void
}

export default function ProductMatchesPanel({ parsedItem, onProductSelected }: ProductMatchesPanelProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [isApplying, setIsApplying] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showNoResults, setShowNoResults] = useState(false)

  const hasMatches = parsedItem.matchedProducts && parsedItem.matchedProducts.length > 0
  const matchCount = parsedItem.matchedProducts?.length || 0

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return

    setIsSearching(true)
    setSearchResults([])
    setShowNoResults(false)
    try {
      const response = await fetch(`/api/products/search?q=${encodeURIComponent(searchQuery)}`)
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Search failed')
      }
      setSearchResults(result.data)
      if (result.data.length === 0) {
        setShowNoResults(true)
        setTimeout(() => setShowNoResults(false), 10000)
      }
    } catch (error: any) {
      toast.error(`Search failed: ${error.message}`)
    } finally {
      setIsSearching(false)
    }
  }

  const handleApplyDiscount = async (productId: string) => {
    if (!parsedItem.discountPrice || !parsedItem.oldPrice) {
      toast.error('Flyer item is missing price information to calculate a discount.');
      return;
    }

    setIsApplying(productId);

    try {
      const discountPercentage = Math.round(((parsedItem.oldPrice - parsedItem.discountPrice) / parsedItem.oldPrice) * 100);

      if (discountPercentage <= 0 || discountPercentage >= 100) {
        toast.error(`Invalid calculated discount: ${discountPercentage}%`);
        return;
      }

      // CRITICAL FIX: Ensure the key is 'productId' to match the backend destructuring.
      const response = await fetch('/api/discounts/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer dummy-token' },
        body: JSON.stringify({
          parsedItemId: parsedItem.id,
          productId: productId, // Use 'productId' as the key
          discountPercentage,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to apply discount');
      }

      toast.success('Discount applied successfully!');
      if (onProductSelected) {
        onProductSelected(productId);
      }
    } catch (error: any) {
      console.error('Error applying discount:', error);
      toast.error(`Failed to apply discount: ${error.message}`);
    } finally {
      setIsApplying(null);
    }
  };

  const formatRelevance = (score: number) => `${Math.round(score * 100)}%`
  
  const getStatusBadge = () => {
    if (parsedItem.discountApplied) {
      return <span className="px-2 py-1 text-xs bg-teal-200 text-teal-800 rounded-full font-semibold">Discount Applied</span>
    }
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

  const renderProductCard = (product: Product, relevanceScore?: number) => {
    const imageUrl = product?.imageUrl || product?.iconUrl;
    const productName = product?.name || product?.macedonianname || product?.albenianname || 'Unknown Product';

    return (
      <div 
        key={product.productId} 
        className={`border-2 rounded-lg p-4 transition-all ${parsedItem.selectedProductId === product.productId ? 'border-green-500 bg-green-50 shadow-lg' : 'border-gray-200'}`}
      >
        <div className="flex items-start space-x-4">
          <div className="flex-shrink-0">
            {imageUrl ? (
              <Image 
                src={imageUrl} 
                alt={productName}
                width={80}
                height={80}
                className="rounded-md object-cover bg-gray-100"
              />
            ) : (
              <div className="w-20 h-20 bg-gray-100 rounded-md flex items-center justify-center text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </div>

          <div className="flex-1">
            <div>
              <h4 className="font-semibold text-gray-800">{productName}</h4>
              {product?.macedonianname && <p className="text-sm text-gray-600">🇲🇰 {product.macedonianname}</p>}
              {product?.albenianname && <p className="text-sm text-gray-500">🇦🇱 {product.albenianname}</p>}
            </div>
            <div className="mt-2">
              {product?.superMarketName && (
                <span className="px-2 py-1 bg-gray-200 text-gray-700 text-xs font-medium rounded-full">{product.superMarketName}</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="flex justify-between items-center mb-2">
            {relevanceScore !== undefined && (
              <div className="flex items-center space-x-1 text-xs">
                <StarIcon className="h-4 w-4 text-blue-500" />
                <span className="font-semibold text-blue-600">Relevance: {formatRelevance(relevanceScore)}</span>
              </div>
            )}
            <div>
              {parsedItem.discountApplied && parsedItem.selectedProductId === product.productId ? (
                <div className="flex items-center space-x-2 text-green-600 font-semibold">
                  <CheckCircleIcon className="h-5 w-5" />
                  <span>Discount Applied</span>
                </div>
              ) : (
                <button
                  onClick={() => handleApplyDiscount(product.productId)}
                  disabled={isApplying !== null}
                  className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400"
                >
                  {isApplying === product.productId ? 'Applying...' : <><SparklesIcon className="h-4 w-4 mr-2" />Apply Discount</>}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }
  
  return (
    <div className="border rounded-md overflow-hidden mb-4 bg-white shadow-sm">
      <div 
        className="flex items-center justify-between p-4 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center space-x-3">
          <h3 className="font-semibold text-gray-800">Product Matches</h3>
          {getStatusBadge()}
        </div>
        {isOpen ? <ChevronUpIcon className="h-5 w-5 text-gray-500" /> : <ChevronDownIcon className="h-5 w-5 text-gray-500" />}
      </div>
      
      {isOpen && (
        <div className="p-4">
          {parsedItem.matchingStatus === 'processing' ? (
            <div className="flex items-center justify-center p-6 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Finding best product matches...</span>
            </div>
          ) : (
            <>
              {parsedItem.matchingStatus === 'completed' && !hasMatches && (
                <div className="p-6 text-center text-gray-500 border-b mb-4">
                  No automated matches found. Use the search below to find a product manually.
                </div>
              )}
              <div className="mb-4">
                <form onSubmit={handleSearch} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      setShowNoResults(false)
                    }}
                    placeholder="Search for a product by name..."
                    className="flex-grow p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
                    disabled={isSearching}
                  />
                  <button
                    type="submit"
                    disabled={isSearching}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400"
                  >
                    {isSearching ? 'Searching...' : <><MagnifyingGlassIcon className="h-5 w-5 mr-2" />Search</>}
                  </button>
                </form>
                {isSearching && <div className="text-center p-2 text-sm text-gray-600">Loading search results...</div>}
                {showNoResults && <div className="text-center p-2 text-sm text-yellow-800 bg-yellow-50 rounded-md mt-2">No products found for your query.</div>}
              </div>
            </>
          )}

          <div className="space-y-4">
            {searchResults.length > 0 && (
              <div className="p-4 bg-gray-50 rounded-md">
                <h4 className="font-semibold mb-2">Search Results</h4>
                <div className="space-y-4">
                  {searchResults.map(product => renderProductCard(product))}
                </div>
              </div>
            )}
            
            {hasMatches && (
              <>
                <h4 className="font-semibold">Automated Matches</h4>
                {parsedItem.matchedProducts!.sort((a, b) => b.relevanceScore - a.relevanceScore).map((match) => {
                  if (!isProduct(match.productData)) {
                    return <div key={match.productId} className="border-2 rounded-lg p-4 bg-red-50 text-red-700">Error: Invalid product data structure in automated match.</div>;
                  }
                  return renderProductCard(match.productData, match.relevanceScore);
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
