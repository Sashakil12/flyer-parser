'use client'

import { useState, useEffect, useCallback } from 'react'
import { ParsedFlyerItem } from '@/types'
import { 
  XMarkIcon, 
  PhotoIcon, 
  CheckIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
  CurrencyDollarIcon,
  TagIcon,
  BuildingStorefrontIcon,
  CalendarIcon,
  CloudArrowUpIcon,
  PlusIcon as PlusIconOutline,
  TrashIcon
} from '@heroicons/react/24/outline'
import Image from 'next/image'
import { toast } from 'react-hot-toast'
import { storage, db } from '@/lib/firebase/config'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { doc, onSnapshot } from 'firebase/firestore'

interface AddProductModalProps {
  isOpen: boolean
  onClose: () => void
  parsedItem: ParsedFlyerItem
  onSuccess?: (productId: string) => void
}

interface ProductFormData {
  name: string
  macedonianname: string
  albenianname: string
  description: string
  categoryId: string
  superMarketId: string
  superMarketName: string
  oldPrice: number
  newPrice: number
  validFrom: string
  validTo: string
  iconUrl: string
}

interface UploadedImage {
  file: File
  preview: string
  type: 'icon' | 'main'
}

export default function AddProductModal({ isOpen, onClose, parsedItem, onSuccess }: AddProductModalProps) {
  const [formData, setFormData] = useState<ProductFormData>({
    name: '',
    macedonianname: '',
    albenianname: '',
    description: '',
    categoryId: '',
    superMarketId: '',
    superMarketName: '',
    oldPrice: 0,
    newPrice: 0,
    validFrom: '',
    validTo: '',
    iconUrl: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedImageType, setSelectedImageType] = useState<'thumbnail' | 'optimized' | 'custom'>('optimized')
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [realTimeStatus, setRealTimeStatus] = useState<{
    imageExtractionStatus?: string
    imageExtractionError?: string
    extractedImages?: any
    imageExtractedAt?: any
    imageQualityScore?: number
  } | null>(null)

  const getSelectedImageUrl = useCallback(() => {
    const currentImages = realTimeStatus?.extractedImages || parsedItem.extractedImages
    if (!currentImages?.clean) return ''
    
    switch (selectedImageType) {
      case 'thumbnail':
        return currentImages.clean.thumbnail || ''
      case 'custom':
        return currentImages.resolutions?.custom || currentImages.clean.optimized || ''
      default:
        return currentImages.clean.optimized || ''
    }
  }, [realTimeStatus?.extractedImages, parsedItem.extractedImages, selectedImageType])

  // Real-time status listener for Inngest function updates
  useEffect(() => {
    if (!isOpen || !parsedItem.id) return


    
    const unsubscribe = onSnapshot(
      doc(db, 'parsed-flyer-items', parsedItem.id),
      (doc) => {
        if (doc.exists()) {
          const data = doc.data()

          
          setRealTimeStatus({
            imageExtractionStatus: data.imageExtractionStatus,
            imageExtractionError: data.imageExtractionError,
            extractedImages: data.extractedImages,
            imageExtractedAt: data.imageExtractedAt,
            imageQualityScore: data.imageQualityScore
          })
        }
      },
      (error) => {
        console.error('❌ Real-time listener error:', error)
      }
    )

    return () => {

      unsubscribe()
    }
  }, [isOpen, parsedItem.id])

  // Pre-populate form with parsed item data
  useEffect(() => {
    if (parsedItem && isOpen) {
      const hasExtractedImages = parsedItem.extractedImages && parsedItem.extractedImages.clean
      const imageUrl = hasExtractedImages ? getSelectedImageUrl() : ''
      
      setFormData({
        name: parsedItem.productName || '',
        macedonianname: parsedItem.productNameMk || '',
        albenianname: '', // Not available in parsed item
        description: parsedItem.additionalInfo?.join(', ') || '',
        categoryId: '', // Needs to be selected
        superMarketId: '', // Needs to be selected
        superMarketName: '', // Needs to be selected
        oldPrice: parsedItem.oldPrice || 0,
        newPrice: parsedItem.discountPrice || parsedItem.oldPrice || 0,
        validFrom: new Date().toISOString().split('T')[0], // Today
        validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
        iconUrl: imageUrl
      })
    }
  }, [parsedItem, isOpen, getSelectedImageUrl])

  const handleImageTypeChange = (type: 'optimized' | 'thumbnail' | 'custom') => {
    setSelectedImageType(type)
    const newImageUrl = getSelectedImageUrl()
    setFormData(prev => ({
      ...prev,
      iconUrl: newImageUrl
    }))
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: name === 'oldPrice' || name === 'newPrice' ? parseFloat(value) || 0 : value
    }))
  }

  // File upload handlers
  const handleFileSelect = (files: FileList | null, type: 'icon' | 'main' = 'main') => {
    if (!files) return

    Array.from(files).forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (e) => {
          const preview = e.target?.result as string
          const newImage: UploadedImage = {
            file,
            preview,
            type
          }
          
          setUploadedImages(prev => [...prev, newImage])
          
          // Update form data with the first uploaded image
          if (uploadedImages.length === 0) {
            setFormData(prev => ({
              ...prev,
              iconUrl: preview
            }))
          }
        }
        reader.readAsDataURL(file)
      }
    })
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    handleFileSelect(e.dataTransfer.files)
  }

  const removeUploadedImage = (index: number) => {
    setUploadedImages(prev => {
      const newImages = prev.filter((_, i) => i !== index)
      
      // Update form data if removing the first image
      if (index === 0 && newImages.length > 0) {
        setFormData(prev => ({
          ...prev,
          iconUrl: newImages[0].preview
        }))
      } else if (newImages.length === 0) {
        // Reset to extracted images if available
        const extractedUrl = getSelectedImageUrl()
        setFormData(prev => ({
          ...prev,
          iconUrl: extractedUrl
        }))
      }
      
      return newImages
    })
  }

  const selectImageAsMain = (index: number) => {
    const selectedImage = uploadedImages[index]
    if (selectedImage) {
      setFormData(prev => ({
        ...prev,
        iconUrl: selectedImage.preview
      }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // Generate keywords for search on submit
      const englishNameKeywords = generateKeywords(formData.name)
      const macedoniannameKeywords = generateKeywords(formData.macedonianname)
      const albeniannameKeywords = generateKeywords(formData.albenianname)

      // Create the product data structure matching the products collection schema
      const productData = {
        name: formData.name,
        macedonianname: formData.macedonianname,
        albenianname: formData.albenianname,
        description: formData.description,
        categoryId: formData.categoryId,
        superMarketId: formData.superMarketId,
        superMarketName: formData.superMarketName,
        oldPrice: formData.oldPrice.toString(),
        newPrice: formData.newPrice,
        validFrom: formData.validFrom,
        validTo: formData.validTo,
        iconUrl: formData.iconUrl,
        iconPath: '', // Will be set by backend if needed
        imagePath: '', // Will be set by backend if needed
        productType: formData.newPrice < formData.oldPrice ? 'discounted' : 'regular',
        hasActiveDiscount: formData.newPrice < formData.oldPrice,
        discountPercentage: formData.newPrice < formData.oldPrice 
          ? Math.round(((formData.oldPrice - formData.newPrice) / formData.oldPrice) * 100)
          : 0,
        discountSource: {
          type: 'manual',
          appliedAt: new Date().toISOString(),
          appliedBy: 'manual-addition',
          parsedItemId: parsedItem.id,
          originalPrice: formData.oldPrice,
          confidence: parsedItem.confidence,
          calculationDetails: `Manually added from parsed flyer item with ${Math.round(parsedItem.confidence * 100)}% confidence.`
        },
        created_at: Date.now(),
        isDeleted: false,
        databaseLocation: 'nam5', // Default location
        // Keywords generated on submit
        englishNameKeywords,
        macedoniannameKeywords,
        albeniannameKeywords
      }

      // Call API to create product
      const response = await fetch('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(productData)
      })

      if (!response.ok) {
        throw new Error('Failed to create product')
      }

      const result = await response.json()
      
      toast.success('Product created successfully!')
      onSuccess?.(result.productId)
      onClose()
      
    } catch (error: any) {
      console.error('Error creating product:', error)
      toast.error('Failed to create product: ' + error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Generate keywords for search (similar to existing products)
  const generateKeywords = (text: string): string[] => {
    if (!text) return []
    
    const keywords: string[] = []
    const cleanText = text.toLowerCase().trim()
    
    for (let i = 1; i <= cleanText.length; i++) {
      keywords.push(cleanText.substring(0, i))
    }
    
    return keywords
  }

  // Helper function to get image extraction status info from real-time data
  const getImageExtractionStatus = () => {
    // Use real-time status if available, otherwise fall back to initial parsed item data
    const currentStatus = realTimeStatus || parsedItem
    const status = currentStatus.imageExtractionStatus || 'pending'
    const hasImages = currentStatus.extractedImages && currentStatus.extractedImages.clean
    const qualityScore = currentStatus.extractedImages?.extractionMetadata?.qualityScore || 0
    const confidence = currentStatus.extractedImages?.extractionMetadata?.confidence || 0
    const processingMethod = currentStatus.extractedImages?.extractionMetadata?.processingMethod || 'imagen4'
    
    switch (status) {
      case 'pending':
        return {
          badge: '⏳ Queued',
          color: 'bg-gray-500',
          description: 'Image extraction queued',
          showProgress: false
        }
      case 'processing':
        return {
          badge: '🔄 Processing',
          color: 'bg-blue-500 animate-pulse',
          description: 'AI is extracting product image...',
          showProgress: true
        }
      case 'completed':
        if (hasImages) {
          const qualityText = qualityScore > 0.8 ? 'Excellent' : qualityScore > 0.6 ? 'Good' : 'Fair'
          return {
            badge: `✨ ${qualityText} Quality`,
            color: qualityScore > 0.8 ? 'bg-green-500' : qualityScore > 0.6 ? 'bg-blue-500' : 'bg-yellow-500',
            description: `${processingMethod.toUpperCase()} • ${Math.round(confidence * 100)}% confidence • ${Math.round(qualityScore * 100)}% quality`,
            showProgress: false
          }
        }
        return {
          badge: '✅ Completed',
          color: 'bg-green-500',
          description: 'Image extraction completed',
          showProgress: false
        }
      case 'failed':
        return {
          badge: '❌ Failed',
          color: 'bg-red-500',
          description: currentStatus.imageExtractionError || 'Image extraction failed',
          showProgress: false
        }
      case 'manual-review':
        return {
          badge: '👁️ Review Required',
          color: 'bg-orange-500',
          description: 'Manual review required for quality',
          showProgress: false
        }
      default:
        return {
          badge: '🤖 AI Generated',
          color: 'bg-green-500',
          description: 'AI generated image',
          showProgress: false
        }
    }
  }

  if (!isOpen) return null

  // Simplified image availability check
  const currentImages = realTimeStatus?.extractedImages || parsedItem.extractedImages
  const selectedImageUrl = getSelectedImageUrl()
  const hasExtractedImages = !!(currentImages && currentImages.clean && selectedImageUrl)
  const imageStatus = getImageExtractionStatus()



  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Backdrop */}
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-900 bg-opacity-75 backdrop-blur-sm" onClick={onClose}></div>
        </div>

        {/* Modal */}
        <div className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-6xl sm:w-full">
          <form onSubmit={handleSubmit}>
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-white bg-opacity-20 rounded-xl flex items-center justify-center">
                      <SparklesIcon className="h-7 w-7 text-white" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">
                      Add Product Manually
                    </h3>
                    <p className="text-blue-100 text-sm mt-1">
                      Create a new product from parsed flyer data
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-white hover:text-gray-200 transition-colors p-2 rounded-full hover:bg-white hover:bg-opacity-10"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-6 max-h-[70vh] overflow-y-auto">

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Column - Product Image */}
                <div className="space-y-6">
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200">
                    <div className="flex items-center space-x-2 mb-4">
                      <PhotoIcon className="h-5 w-5 text-gray-600" />
                      <h4 className="text-lg font-semibold text-gray-900">Product Image</h4>
                    </div>
                    
                    {/* Image Status Info - Real-time from Inngest */}
                    {(hasExtractedImages || realTimeStatus?.imageExtractionStatus || parsedItem.imageExtractionStatus) && (
                      <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <div className={`w-2 h-2 rounded-full ${imageStatus.color.replace('bg-', 'bg-').replace(' animate-pulse', '')}`}></div>
                            <span className="text-sm font-medium text-gray-700">
                              Image Extraction Status 
                              {realTimeStatus && <span className="text-green-600 ml-1">• Live</span>}
                            </span>
                          </div>
                          <div className={`px-2 py-1 rounded-full text-xs font-medium text-white ${imageStatus.color}`}>
                            {imageStatus.badge}
                          </div>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">{imageStatus.description}</p>
                        {currentImages?.extractionMetadata && (
                          <div className="mt-2 flex flex-wrap gap-2 text-xs">
                            {currentImages.extractionMetadata.backgroundRemoved && (
                              <span className="bg-green-100 text-green-700 px-2 py-1 rounded">🎯 Background Removed</span>
                            )}
                            {currentImages.extractionMetadata.textRemoved && (
                              <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">📝 Text Cleaned</span>
                            )}
                            {currentImages.extractionMetadata.manualReviewRequired && (
                              <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded">👁️ Review Needed</span>
                            )}
                          </div>
                        )}
                        {realTimeStatus?.imageExtractionStatus === 'processing' && (
                          <div className="mt-2 text-xs text-blue-600">
                            🔄 Inngest function is actively processing this image...
                          </div>
                        )}
                      </div>
                    )}

                    {/* Image Source Selection */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      {hasExtractedImages && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleImageTypeChange('thumbnail')}
                            className={`px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                              selectedImageType === 'thumbnail'
                                ? 'bg-blue-500 text-white shadow-md'
                                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                            }`}
                          >
                            📱 Thumbnail
                          </button>
                          <button
                            type="button"
                            onClick={() => handleImageTypeChange('optimized')}
                            className={`px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                              selectedImageType === 'optimized'
                                ? 'bg-blue-500 text-white shadow-md'
                                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                            }`}
                          >
                            ✨ Optimized
                          </button>
                          <button
                            type="button"
                            onClick={() => handleImageTypeChange('custom')}
                            className={`px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                              selectedImageType === 'custom'
                                ? 'bg-blue-500 text-white shadow-md'
                                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                            }`}
                          >
                            🎨 Custom (828×440)
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => document.getElementById('file-upload')?.click()}
                        className="px-3 py-2 text-sm font-medium rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-all shadow-md"
                      >
                        📤 Upload Images
                      </button>
                    </div>

                    {/* Main Image Display */}
                    <div 
                      className={`aspect-square bg-white rounded-xl overflow-hidden border-2 border-dashed shadow-inner transition-all duration-200 ${
                        isDragOver 
                          ? 'border-purple-400 bg-purple-50 scale-105' 
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => !hasExtractedImages && !uploadedImages.length && document.getElementById('file-upload')?.click()}
                    >
                      {uploadedImages.length > 0 ? (
                        <div className="relative w-full h-full">
                          <Image
                            src={uploadedImages[0].preview}
                            alt="Uploaded product image"
                            fill
                            className="object-contain p-4"
                          />
                          <div className="absolute top-2 right-2 bg-purple-500 text-white px-2 py-1 rounded-full text-xs font-medium">
                            📤 Uploaded
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              removeUploadedImage(0)
                            }}
                            className="absolute top-2 left-2 bg-red-500 text-white p-1 rounded-full hover:bg-red-600 transition-colors"
                          >
                            <XMarkIcon className="h-4 w-4" />
                          </button>
                        </div>
                      ) : selectedImageUrl ? (
                        <div className="relative w-full h-full">
                          <Image
                            src={selectedImageUrl}
                            alt={parsedItem.productName}
                            fill
                            className="object-contain p-4"
                          />
                          <div className={`absolute top-2 right-2 ${imageStatus.color} text-white px-2 py-1 rounded-full text-xs font-medium shadow-lg`}>
                            {imageStatus.badge}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full text-gray-400 cursor-pointer hover:text-gray-500 transition-colors">
                          <div className="text-center">
                            {isDragOver ? (
                              <>
                                <CloudArrowUpIcon className="h-16 w-16 mx-auto mb-3 text-purple-400" />
                                <p className="text-sm font-medium text-purple-600">Drop images here!</p>
                              </>
                            ) : (
                              <>
                                <PhotoIcon className="h-16 w-16 mx-auto mb-3 text-gray-300" />
                                <p className="text-sm font-medium text-gray-500">Click to upload or drag & drop</p>
                                <p className="text-xs text-gray-400 mt-1">PNG, JPG, WEBP up to 10MB</p>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Additional Uploaded Images */}
                    {uploadedImages.length > 1 && (
                      <div className="mt-4">
                        <h5 className="text-sm font-medium text-gray-700 mb-2">Additional Images ({uploadedImages.length - 1})</h5>
                        <div className="grid grid-cols-3 gap-2">
                          {uploadedImages.slice(1).map((image, index) => (
                            <div key={index + 1} className="relative group">
                              <div className="aspect-square bg-white rounded-lg overflow-hidden border border-gray-200">
                                <Image
                                  src={image.preview}
                                  alt={`Additional image ${index + 2}`}
                                  fill
                                  className="object-contain p-2"
                                />
                              </div>
                              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all duration-200 rounded-lg flex items-center justify-center">
                                <div className="opacity-0 group-hover:opacity-100 flex space-x-1">
                                  <button
                                    type="button"
                                    onClick={() => selectImageAsMain(index + 1)}
                                    className="bg-blue-500 text-white p-1 rounded text-xs hover:bg-blue-600 transition-colors"
                                    title="Set as main image"
                                  >
                                    ⭐
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeUploadedImage(index + 1)}
                                    className="bg-red-500 text-white p-1 rounded text-xs hover:bg-red-600 transition-colors"
                                    title="Remove image"
                                  >
                                    <TrashIcon className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Hidden File Input */}
                    <input
                      id="file-upload"
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={(e) => handleFileSelect(e.target.files)}
                      className="hidden"
                    />
                    

                  </div>
                </div>

                {/* Right Column - Product Details */}
                <div className="space-y-6">
                  {/* Basic Information */}
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
                    <div className="flex items-center space-x-2 mb-4">
                      <TagIcon className="h-5 w-5 text-blue-600" />
                      <h4 className="text-lg font-semibold text-gray-900">Basic Information</h4>
                    </div>
                    
                    <div className="space-y-6">
                      <div className="relative">
                        <input
                          type="text"
                          id="name"
                          name="name"
                          required
                          value={formData.name}
                          onChange={handleInputChange}
                          className="peer block w-full px-4 py-3 text-gray-900 bg-white border-2 border-gray-200 rounded-xl shadow-sm placeholder-transparent focus:border-blue-500 focus:ring-0 focus:outline-none transition-all duration-200 hover:border-gray-300"
                          placeholder="Enter product name in English"
                        />
                        <label 
                          htmlFor="name" 
                          className="absolute left-4 -top-2.5 bg-white px-2 text-sm font-semibold text-blue-600 transition-all duration-200 peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-3 peer-placeholder-shown:text-base peer-placeholder-shown:font-normal peer-focus:-top-2.5 peer-focus:text-sm peer-focus:font-semibold peer-focus:text-blue-600"
                        >
                          Product Name (English) *
                        </label>
                      </div>

                      <div className="relative">
                        <input
                          type="text"
                          id="macedonianname"
                          name="macedonianname"
                          value={formData.macedonianname}
                          onChange={handleInputChange}
                          className="peer block w-full px-4 py-3 text-gray-900 bg-white border-2 border-gray-200 rounded-xl shadow-sm placeholder-transparent focus:border-blue-500 focus:ring-0 focus:outline-none transition-all duration-200 hover:border-gray-300"
                          placeholder="Внесете име на производот на македонски"
                        />
                        <label 
                          htmlFor="macedonianname" 
                          className="absolute left-4 -top-2.5 bg-white px-2 text-sm font-semibold text-blue-600 transition-all duration-200 peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-3 peer-placeholder-shown:text-base peer-placeholder-shown:font-normal peer-focus:-top-2.5 peer-focus:text-sm peer-focus:font-semibold peer-focus:text-blue-600"
                        >
                          Macedonian Name 🇲🇰
                        </label>
                      </div>

                      <div className="relative">
                        <input
                          type="text"
                          id="albenianname"
                          name="albenianname"
                          value={formData.albenianname}
                          onChange={handleInputChange}
                          className="peer block w-full px-4 py-3 text-gray-900 bg-white border-2 border-gray-200 rounded-xl shadow-sm placeholder-transparent focus:border-blue-500 focus:ring-0 focus:outline-none transition-all duration-200 hover:border-gray-300"
                          placeholder="Shkruani emrin e produktit në shqip"
                        />
                        <label 
                          htmlFor="albenianname" 
                          className="absolute left-4 -top-2.5 bg-white px-2 text-sm font-semibold text-blue-600 transition-all duration-200 peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-3 peer-placeholder-shown:text-base peer-placeholder-shown:font-normal peer-focus:-top-2.5 peer-focus:text-sm peer-focus:font-semibold peer-focus:text-blue-600"
                        >
                          Albanian Name 🇦🇱
                        </label>
                      </div>

                      <div className="relative">
                        <textarea
                          id="description"
                          name="description"
                          rows={3}
                          value={formData.description}
                          onChange={handleInputChange}
                          className="peer block w-full px-4 py-3 text-gray-900 bg-white border-2 border-gray-200 rounded-xl shadow-sm placeholder-transparent focus:border-blue-500 focus:ring-0 focus:outline-none transition-all duration-200 hover:border-gray-300 resize-none"
                          placeholder="Additional product information, features, specifications..."
                        />
                        <label 
                          htmlFor="description" 
                          className="absolute left-4 -top-2.5 bg-white px-2 text-sm font-semibold text-blue-600 transition-all duration-200 peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-3 peer-placeholder-shown:text-base peer-placeholder-shown:font-normal peer-focus:-top-2.5 peer-focus:text-sm peer-focus:font-semibold peer-focus:text-blue-600"
                        >
                          Description 📝
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Category & Store */}
                  <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-200">
                    <div className="flex items-center space-x-2 mb-4">
                      <BuildingStorefrontIcon className="h-5 w-5 text-purple-600" />
                      <h4 className="text-lg font-semibold text-gray-900">Category & Store</h4>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="relative">
                        <select
                          id="categoryId"
                          name="categoryId"
                          required
                          value={formData.categoryId}
                          onChange={handleInputChange}
                          className="peer block w-full px-4 py-3 text-gray-900 bg-white border-2 border-gray-200 rounded-xl shadow-sm focus:border-purple-500 focus:ring-0 focus:outline-none transition-all duration-200 hover:border-gray-300 appearance-none cursor-pointer"
                        >
                          <option value="">Select category</option>
                          <option value="food-beverages">🍎 Food & Beverages</option>
                          <option value="cleaning-products">🧽 Cleaning Products</option>
                          <option value="personal-care">🧴 Personal Care</option>
                          <option value="household">🏠 Household</option>
                          <option value="electronics">📱 Electronics</option>
                          <option value="other">📦 Other</option>
                        </select>
                        <label 
                          htmlFor="categoryId" 
                          className="absolute left-4 -top-2.5 bg-white px-2 text-sm font-semibold text-purple-600 transition-all duration-200"
                        >
                          Category *
                        </label>
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                          <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </div>
                      </div>

                      <div className="relative">
                        <select
                          id="superMarketName"
                          name="superMarketName"
                          required
                          value={formData.superMarketName}
                          onChange={handleInputChange}
                          className="peer block w-full px-4 py-3 text-gray-900 bg-white border-2 border-gray-200 rounded-xl shadow-sm focus:border-purple-500 focus:ring-0 focus:outline-none transition-all duration-200 hover:border-gray-300 appearance-none cursor-pointer"
                        >
                          <option value="">Select supermarket</option>
                          <option value="RAMSTORE">🏪 RAMSTORE</option>
                          <option value="TINEX">🏪 TINEX</option>
                          <option value="VERO">🏪 VERO</option>
                          <option value="KAM">🏪 KAM</option>
                          <option value="OTHER">🏪 Other</option>
                        </select>
                        <label 
                          htmlFor="superMarketName" 
                          className="absolute left-4 -top-2.5 bg-white px-2 text-sm font-semibold text-purple-600 transition-all duration-200"
                        >
                          Supermarket *
                        </label>
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                          <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Pricing */}
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200">
                    <div className="flex items-center space-x-2 mb-4">
                      <CurrencyDollarIcon className="h-5 w-5 text-green-600" />
                      <h4 className="text-lg font-semibold text-gray-900">Pricing</h4>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="relative">
                        <input
                          type="number"
                          id="oldPrice"
                          name="oldPrice"
                          required
                          step="0.01"
                          min="0"
                          value={formData.oldPrice}
                          onChange={handleInputChange}
                          className="peer block w-full pl-10 pr-4 py-3 text-gray-900 bg-white border-2 border-gray-200 rounded-xl shadow-sm placeholder-transparent focus:border-green-500 focus:ring-0 focus:outline-none transition-all duration-200 hover:border-gray-300"
                          placeholder="0.00"
                        />
                        <label 
                          htmlFor="oldPrice" 
                          className="absolute left-4 -top-2.5 bg-white px-2 text-sm font-semibold text-green-600 transition-all duration-200 peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-3 peer-placeholder-shown:text-base peer-placeholder-shown:font-normal peer-focus:-top-2.5 peer-focus:text-sm peer-focus:font-semibold peer-focus:text-green-600"
                        >
                          Original Price * 💰
                        </label>
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <span className="text-gray-500 text-sm font-medium">$</span>
                        </div>
                      </div>

                      <div className="relative">
                        <input
                          type="number"
                          id="newPrice"
                          name="newPrice"
                          required
                          step="0.01"
                          min="0"
                          value={formData.newPrice}
                          onChange={handleInputChange}
                          className="peer block w-full pl-10 pr-4 py-3 text-gray-900 bg-white border-2 border-gray-200 rounded-xl shadow-sm placeholder-transparent focus:border-green-500 focus:ring-0 focus:outline-none transition-all duration-200 hover:border-gray-300"
                          placeholder="0.00"
                        />
                        <label 
                          htmlFor="newPrice" 
                          className="absolute left-4 -top-2.5 bg-white px-2 text-sm font-semibold text-green-600 transition-all duration-200 peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-3 peer-placeholder-shown:text-base peer-placeholder-shown:font-normal peer-focus:-top-2.5 peer-focus:text-sm peer-focus:font-semibold peer-focus:text-green-600"
                        >
                          Current Price * 🏷️
                        </label>
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <span className="text-gray-500 text-sm font-medium">$</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Validity Period */}
                  <div className="bg-gradient-to-br from-orange-50 to-yellow-50 rounded-xl p-6 border border-orange-200">
                    <div className="flex items-center space-x-2 mb-4">
                      <CalendarIcon className="h-5 w-5 text-orange-600" />
                      <h4 className="text-lg font-semibold text-gray-900">Validity Period</h4>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="relative">
                        <input
                          type="date"
                          id="validFrom"
                          name="validFrom"
                          value={formData.validFrom}
                          onChange={handleInputChange}
                          className="peer block w-full px-4 py-3 text-gray-900 bg-white border-2 border-gray-200 rounded-xl shadow-sm focus:border-orange-500 focus:ring-0 focus:outline-none transition-all duration-200 hover:border-gray-300"
                        />
                        <label 
                          htmlFor="validFrom" 
                          className="absolute left-4 -top-2.5 bg-white px-2 text-sm font-semibold text-orange-600 transition-all duration-200"
                        >
                          Valid From 📅
                        </label>
                      </div>

                      <div className="relative">
                        <input
                          type="date"
                          id="validTo"
                          name="validTo"
                          value={formData.validTo}
                          onChange={handleInputChange}
                          className="peer block w-full px-4 py-3 text-gray-900 bg-white border-2 border-gray-200 rounded-xl shadow-sm focus:border-orange-500 focus:ring-0 focus:outline-none transition-all duration-200 hover:border-gray-300"
                        />
                        <label 
                          htmlFor="validTo" 
                          className="absolute left-4 -top-2.5 bg-white px-2 text-sm font-semibold text-orange-600 transition-all duration-200"
                        >
                          Valid To 🗓️
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <ExclamationTriangleIcon className="h-4 w-4" />
                  <span>Fields marked with * are required</span>
                </div>
                
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center px-6 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-purple-600 border border-transparent rounded-lg hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                  >
                    {isSubmitting ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Creating Product...
                      </>
                    ) : (
                      <>
                        <CheckIcon className="h-4 w-4 mr-2" />
                        Create Product
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
