'use client'

import { useState } from 'react'
import { ParsedFlyerItem } from '@/types'
import ProductMatchesPanel from '@/components/dashboard/ProductMatchesPanel'
import { formatCurrency } from '@/lib/utils'
import Link from 'next/link'
import { 
  PhotoIcon, 
  PlusIcon, 
  EyeIcon,
  CheckCircleIcon,
  XCircleIcon,
  SparklesIcon
} from '@heroicons/react/24/outline'
import Image from 'next/image'
import { appConfig } from '@/lib/config'

interface ParsedItemCardProps {
  item: ParsedFlyerItem
  onAddProduct?: (item: ParsedFlyerItem) => void
  onViewDetails?: (item: ParsedFlyerItem) => void
}

export default function ParsedItemCard({ item, onAddProduct, onViewDetails }: ParsedItemCardProps) {
  const [imageError, setImageError] = useState(false)
  const [selectedImageType, setSelectedImageType] = useState<'optimized' | 'thumbnail' | 'custom'>('optimized')

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString();
  };

  const hasMatches = item.matchedProducts && item.matchedProducts.length > 0
  const isAutoApproved = item.autoApproved
  
  // More robust check for extracted images - handle both old and new data structures
  const hasExtractedImages = item.extractedImages && (
    item.extractedImages.clean || // New structure
    (item.extractedImages as any).original || // Old structure fallback
    (item.extractedImages as any).optimized || // Another fallback
    (item.extractedImages as any).metadata?.uploadedAt // Handle corrupted metadata-only structure
  )





  // Helper function to construct Firebase Storage URLs
  const constructFirebaseStorageUrl = (flyerImageId: string, itemId: string, imageType: string, resolution?: string): string => {
    // Remove gs:// prefix if present
    const rawBucketName = appConfig.firebase.storageBucket || ''
    const bucketName = rawBucketName.replace(/^gs:\/\//, '')
    
    let filePath: string
    
    if (resolution) {
      filePath = `flyer-images/${flyerImageId}/extracted/${itemId}/resolutions/${resolution}.webp`
    } else {
      filePath = `flyer-images/${flyerImageId}/extracted/${itemId}/clean/${imageType}.webp`
    }
    
    // Use Firebase Storage REST API format with URL encoding
    const encodedPath = encodeURIComponent(filePath)
    return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media`
  }

  const getImageUrl = () => {
    console.log('🖼️ [ParsedItemCard] getImageUrl called for item:', item.id || item.productName)
    console.log('🖼️ [ParsedItemCard] hasExtractedImages:', hasExtractedImages)
    console.log('🖼️ [ParsedItemCard] selectedImageType:', selectedImageType)
    console.log('🖼️ [ParsedItemCard] item.extractedImages:', item.extractedImages)
    
    if (!hasExtractedImages) {
      console.log('🖼️ [ParsedItemCard] No extracted images found, returning null')
      return null
    }
    
    const extractedImages = item.extractedImages!
    console.log('🖼️ [ParsedItemCard] extractedImages structure:', extractedImages)
    console.log('🖼️ [ParsedItemCard] extractedImages keys:', Object.keys(extractedImages))
    
    // Deep inspection of all properties
    if (extractedImages.resolutions) {
      console.log('🖼️ [ParsedItemCard] resolutions content:', extractedImages.resolutions)
      console.log('🖼️ [ParsedItemCard] resolutions keys:', Object.keys(extractedImages.resolutions))
    }
    if (extractedImages.clean) {
      console.log('🖼️ [ParsedItemCard] clean content:', extractedImages.clean)
      console.log('🖼️ [ParsedItemCard] clean keys:', Object.keys(extractedImages.clean))
    }
    if (extractedImages.extractionMetadata) {
      console.log('🖼️ [ParsedItemCard] extractionMetadata:', extractedImages.extractionMetadata)
    }
    
    // Handle new structure (with urls object) - this is the current structure
    if (extractedImages.urls) {
      console.log('🖼️ [ParsedItemCard] Using new structure with urls object:', extractedImages.urls)
      let imageUrl: string | undefined
      
      switch (selectedImageType) {
        case 'thumbnail':
          imageUrl = extractedImages.urls.thumbnail
          console.log('🖼️ [ParsedItemCard] Thumbnail URL:', imageUrl)
          break
        case 'custom':
          imageUrl = extractedImages.urls.resolutions?.custom || extractedImages.urls.optimized
          console.log('🖼️ [ParsedItemCard] Custom URL (fallback to optimized):', imageUrl)
          break
        default:
          imageUrl = extractedImages.urls.optimized
          console.log('🖼️ [ParsedItemCard] Optimized URL:', imageUrl)
          break
      }
      
      console.log('🖼️ [ParsedItemCard] Final URL from new structure:', imageUrl)
      return imageUrl
    }
    
    // Handle legacy structure (with clean object) - check if URLs exist
    if (extractedImages.clean && Object.keys(extractedImages.clean).length > 0) {
      console.log('🖼️ [ParsedItemCard] Using legacy structure with clean object:', extractedImages.clean)
      let imageUrl: string | undefined
      
      switch (selectedImageType) {
        case 'thumbnail':
          imageUrl = extractedImages.clean.thumbnail
          console.log('🖼️ [ParsedItemCard] Legacy thumbnail URL:', imageUrl)
          break
        case 'custom':
          imageUrl = extractedImages.resolutions?.custom || extractedImages.clean.optimized
          console.log('🖼️ [ParsedItemCard] Legacy custom URL (fallback to optimized):', imageUrl)
          break
        default:
          imageUrl = extractedImages.clean.optimized
          console.log('🖼️ [ParsedItemCard] Legacy optimized URL:', imageUrl)
          break
      }
      
      console.log('🖼️ [ParsedItemCard] Final URL from legacy structure:', imageUrl)
      return imageUrl
    }
    
    // If clean/resolutions objects are empty but extractionMetadata exists, construct URLs directly
    if (extractedImages.extractionMetadata && item.flyerImageId && item.id) {
      console.log('🖼️ [ParsedItemCard] Clean/resolutions empty, constructing URLs directly from storage paths')
      console.log('🖼️ [ParsedItemCard] flyerImageId:', item.flyerImageId, 'itemId:', item.id)
      
      let imageUrl: string
      
      switch (selectedImageType) {
        case 'thumbnail':
          imageUrl = constructFirebaseStorageUrl(item.flyerImageId, item.id, 'thumbnail')
          console.log('🖼️ [ParsedItemCard] Constructed thumbnail URL:', imageUrl)
          break
        case 'custom':
          imageUrl = constructFirebaseStorageUrl(item.flyerImageId, item.id, 'optimized', 'custom') || 
                    constructFirebaseStorageUrl(item.flyerImageId, item.id, 'optimized')
          console.log('🖼️ [ParsedItemCard] Constructed custom URL (fallback to optimized):', imageUrl)
          break
        default:
          imageUrl = constructFirebaseStorageUrl(item.flyerImageId, item.id, 'optimized')
          console.log('🖼️ [ParsedItemCard] Constructed optimized URL:', imageUrl)
          break
      }
      
      console.log('🖼️ [ParsedItemCard] Final constructed URL:', imageUrl)
      return imageUrl
    }
    
    // Handle old structure (direct URLs)
    const oldStructure = extractedImages as any
    console.log('🖼️ [ParsedItemCard] Using old structure (direct URLs):', oldStructure)
    
    // Handle corrupted metadata-only structure
    if (oldStructure.metadata?.uploadedAt && !oldStructure.original && !oldStructure.optimized) {
      console.log('🖼️ [ParsedItemCard] Detected corrupted metadata-only structure')
      // Extract URL from metadata if it contains a valid URL
      const metadataUrl = oldStructure.metadata.uploadedAt
      console.log('🖼️ [ParsedItemCard] Metadata URL:', metadataUrl)
      
      if (typeof metadataUrl === 'string' && metadataUrl.includes('http')) {
        console.log('🖼️ [ParsedItemCard] Valid URL found in metadata:', metadataUrl)
        return metadataUrl
      }
      console.log('🖼️ [ParsedItemCard] No valid URL in metadata, returning null')
      return null
    }
    
    let imageUrl: string | undefined
    switch (selectedImageType) {
      case 'thumbnail':
        imageUrl = oldStructure.thumbnail || oldStructure.optimized || oldStructure.original
        console.log('🖼️ [ParsedItemCard] Old structure thumbnail URL (with fallbacks):', imageUrl)
        break
      case 'custom':
        imageUrl = oldStructure.custom || oldStructure.optimized || oldStructure.original
        console.log('🖼️ [ParsedItemCard] Old structure custom URL (with fallbacks):', imageUrl)
        break
      default:
        imageUrl = oldStructure.optimized || oldStructure.original
        console.log('🖼️ [ParsedItemCard] Old structure optimized URL (with fallback):', imageUrl)
        break
    }
    
    console.log('🖼️ [ParsedItemCard] Final URL from old structure:', imageUrl)
    return imageUrl
  }

  const getStatusBadge = () => {
    if (isAutoApproved) {
      return (
        <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
          <SparklesIcon className="h-3 w-3 mr-1" />
          Auto-approved
        </div>
      )
    }
    
    if (hasMatches) {
      return (
        <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          <CheckCircleIcon className="h-3 w-3 mr-1" />
          {item.matchedProducts!.length} match{item.matchedProducts!.length > 1 ? 'es' : ''}
        </div>
      )
    }
    
    return (
      <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
        <XCircleIcon className="h-3 w-3 mr-1" />
        No matches
      </div>
    )
  }

  const getImageExtractionStatus = () => {
    if (!item.imageExtractionStatus) return null
    
    const statusConfig = {
      pending: { color: 'bg-gray-100 text-gray-800', text: 'Pending' },
      processing: { color: 'bg-yellow-100 text-yellow-800', text: 'Processing' },
      completed: { color: 'bg-green-100 text-green-800', text: 'Completed' },
      failed: { color: 'bg-red-100 text-red-800', text: 'Failed' },
      'manual-review': { color: 'bg-orange-100 text-orange-800', text: 'Review Needed' }
    }
    
    const config = statusConfig[item.imageExtractionStatus as keyof typeof statusConfig] || 
                   { color: 'bg-gray-100 text-gray-800', text: 'Unknown' }
    
    return (
      <div className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${config.color}`}>
        <PhotoIcon className="h-3 w-3 mr-1" />
        {config.text}
      </div>
    )
  }

  return (
    <div className="bg-white shadow-lg rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-6 bg-gray-50 border-b border-gray-200">
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-800 truncate">{item.productName}</h2>
            {item.productNameMk && <p className="text-gray-600 mt-1">🇲🇰 {item.productNameMk}</p>}
            <p className="text-xs text-gray-500 mt-2">Created: {formatDate(item.createdAt)}</p>
          </div>
          <div className="flex flex-col items-end space-y-2 ml-4">
            {getStatusBadge()}
            {getImageExtractionStatus()}
            <Link href={`/flyers/${item.flyerImageId}`} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
              View Source Flyer
            </Link>
          </div>
        </div>
        
        <div className="mt-4 flex space-x-6 text-sm">
          <div>
            <p className="text-gray-500">Flyer Price</p>
            <p className="font-semibold text-red-600">{formatCurrency(item.discountPrice || 0, item.currency)}</p>
          </div>
          <div>
            <p className="text-gray-500">Original Price</p>
            <p className="font-semibold text-gray-700 line-through">{formatCurrency(item.oldPrice, item.currency)}</p>
          </div>
          {item.discountPrice && (
            <div>
              <p className="text-gray-500">Savings</p>
              <p className="font-semibold text-green-600">
                {Math.round(((item.oldPrice - item.discountPrice) / item.oldPrice) * 100)}% off
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Product Image Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-900">Extracted Image</h4>
              {hasExtractedImages && (
                <div className="flex space-x-1">
                  <button
                    onClick={() => setSelectedImageType('thumbnail')}
                    className={`px-2 py-1 text-xs rounded ${
                      selectedImageType === 'thumbnail'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Thumb
                  </button>
                  <button
                    onClick={() => setSelectedImageType('optimized')}
                    className={`px-2 py-1 text-xs rounded ${
                      selectedImageType === 'optimized'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Optimized
                  </button>
                  <button
                    onClick={() => setSelectedImageType('custom')}
                    className={`px-2 py-1 text-xs rounded ${
                      selectedImageType === 'custom'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Custom (828x440)
                  </button>
                </div>
              )}
            </div>
            
            <div className="aspect-square bg-gray-50 rounded-lg overflow-hidden border">
              {(() => {
                const imageUrl = getImageUrl()
                const shouldShowImage = hasExtractedImages && !imageError
                
                console.log('🖼️ [ParsedItemCard] Image rendering decision:')
                console.log('🖼️ [ParsedItemCard] - hasExtractedImages:', hasExtractedImages)
                console.log('🖼️ [ParsedItemCard] - imageError:', imageError)
                console.log('🖼️ [ParsedItemCard] - imageUrl:', imageUrl)
                console.log('🖼️ [ParsedItemCard] - shouldShowImage:', shouldShowImage)
                console.log('🖼️ [ParsedItemCard] - imageExtractionStatus:', item.imageExtractionStatus)
                
                return shouldShowImage ? (
                  <div className="relative w-full h-full">
                    <Image
                      src={imageUrl!}
                      alt={item.productName}
                      fill
                      className="object-contain"
                      onError={(e) => {
                        console.error('🖼️ [ParsedItemCard] Image load error for URL:', imageUrl, e)
                        setImageError(true)
                      }}
                      onLoad={() => {
                        console.log('🖼️ [ParsedItemCard] Image loaded successfully:', imageUrl)
                      }}
                    />
                    {item.extractedImages!.extractionMetadata && (
                      <div className="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
                        {Math.round(item.extractedImages!.extractionMetadata.confidence * 100)}% confidence
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400">
                    <div className="text-center">
                      <PhotoIcon className="h-12 w-12 mx-auto mb-2" />
                      <p className="text-sm">
                        {item.imageExtractionStatus === 'processing' 
                          ? 'Processing...' 
                          : item.imageExtractionStatus === 'failed'
                          ? 'Extraction failed'
                          : 'No image available'
                        }
                      </p>
                      {!hasExtractedImages && (
                        <p className="text-xs text-gray-400 mt-1">
                          Debug: No extracted images found
                        </p>
                      )}
                      {hasExtractedImages && imageError && (
                        <p className="text-xs text-gray-400 mt-1">
                          Debug: Image load error for URL: {imageUrl}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>
            
            {hasExtractedImages && item.extractedImages!.extractionMetadata && (
              <div className="text-xs text-gray-500 space-y-1">
                <div className="flex justify-between">
                  <span>Quality Score:</span>
                  <span className="font-medium">
                    {Math.round(item.extractedImages!.extractionMetadata.qualityScore * 100)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Method:</span>
                  <span className="font-medium capitalize">
                    {item.extractedImages!.extractionMetadata.processingMethod}
                  </span>
                </div>
                {item.extractedImages!.extractionMetadata.manualReviewRequired && (
                  <div className="text-orange-600 font-medium">
                    ⚠️ Manual review recommended
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Product Details Section */}
          <div className="space-y-4">
            {/* Additional Info */}
            {item.additionalInfo && item.additionalInfo.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">Additional Info</h4>
                <div className="flex flex-wrap gap-1">
                  {item.additionalInfo.slice(0, 4).map((info, index) => (
                    <span
                      key={index}
                      className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded"
                    >
                      {info}
                    </span>
                  ))}
                  {item.additionalInfo.length > 4 && (
                    <span className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                      +{item.additionalInfo.length - 4} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Confidence */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-gray-600">AI Confidence:</span>
                <span className="text-sm font-medium">
                  {Math.round(item.confidence * 100)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    item.confidence >= 0.9
                      ? 'bg-green-500'
                      : item.confidence >= 0.7
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                  }`}
                  style={{ width: `${item.confidence * 100}%` }}
                />
              </div>
            </div>

            {/* Actions for no matches */}
            {!hasMatches && onAddProduct && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <XCircleIcon className="h-5 w-5 text-yellow-400" />
                  </div>
                  <div className="ml-3 flex-1">
                    <h3 className="text-sm font-medium text-yellow-800">
                      No product matches found
                    </h3>
                    <p className="mt-1 text-sm text-yellow-700">
                      This item couldn't be matched to any existing products in your database.
                    </p>
                    <div className="mt-3">
                      <button
                        onClick={() => onAddProduct(item)}
                        className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        <PlusIcon className="h-4 w-4 mr-1" />
                        Add Product Manually
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Product Matches Panel */}
        <div className="mt-6">
          <ProductMatchesPanel parsedItem={item} />
        </div>
      </div>

      {/* Footer Actions */}
      {/* <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex space-x-2">
            {onViewDetails && (
              <button
                onClick={() => onViewDetails(item)}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <EyeIcon className="h-4 w-4 mr-1" />
                View Details
              </button>
            )}
          </div>
          
          <div className="text-sm text-gray-500">
            {hasMatches && item.selectedProductId && 'Product linked'}
            {hasMatches && !item.selectedProductId && `${item.matchedProducts!.length} potential matches`}
            {!hasMatches && 'Ready for manual addition'}
          </div>
        </div>
      </div> */}
    </div>
  )
}
