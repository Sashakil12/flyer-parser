'use client'

import { useState } from 'react'
import { FlyerImage } from '@/types'
import { toast } from 'react-hot-toast'
import { 
  EyeIcon,
  TrashIcon,
  ArrowPathIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { deleteFlyerImage, updateFlyerImageStatus } from '@/lib/firestore'
import { deleteFile } from '@/lib/storage'

interface FlyerImagesGridProps {
  images: FlyerImage[]
  isLoading: boolean
  onRefresh: () => void
}

export default function FlyerImagesGrid({ images, isLoading, onRefresh }: FlyerImagesGridProps) {
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [reprocessingIds, setReprocessingIds] = useState<Set<string>>(new Set())

  const getStatusIcon = (status: FlyerImage['processingStatus']) => {
    switch (status) {
      case 'pending':
        return <ClockIcon className="h-5 w-5 text-yellow-500" />
      case 'processing':
        return <LoadingSpinner size="small" />
      case 'completed':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />
      case 'failed':
        return <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
      default:
        return <ClockIcon className="h-5 w-5 text-gray-400" />
    }
  }

  const getStatusBadgeClass = (status: FlyerImage['processingStatus']) => {
    switch (status) {
      case 'pending':
        return 'status-pending'
      case 'processing':
        return 'status-processing'
      case 'completed':
        return 'status-completed'
      case 'failed':
        return 'status-failed'
      default:
        return 'status-badge bg-gray-100 text-gray-800'
    }
  }

  const handleDelete = async (image: FlyerImage) => {
    if (!confirm('Are you sure you want to delete this flyer image? This action cannot be undone.')) {
      return
    }

    setDeletingIds(prev => new Set(prev).add(image.id))
    
    try {
      // Delete from storage
      await deleteFile(image.storageUrl)
      
      // Delete from Firestore
      await deleteFlyerImage(image.id)
      
      toast.success('Flyer image deleted successfully')
      onRefresh()
    } catch (error: any) {
      toast.error('Failed to delete image: ' + error.message)
    } finally {
      setDeletingIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(image.id)
        return newSet
      })
    }
  }

  const handleReprocess = async (image: FlyerImage) => {
    setReprocessingIds(prev => new Set(prev).add(image.id))
    
    try {
      // Update status to pending
      await updateFlyerImageStatus(image.id, 'pending')
      
      // Trigger reprocessing via API
      const response = await fetch('/api/inngest/trigger-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flyerImageId: image.id,
          storageUrl: image.storageUrl,
          dataUrl: image.storageUrl, // Note: This should ideally be the original data URL
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to trigger reprocessing')
      }

      toast.success('Reprocessing started')
      onRefresh()
    } catch (error: any) {
      toast.error('Failed to reprocess: ' + error.message)
    } finally {
      setReprocessingIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(image.id)
        return newSet
      })
    }
  }

  const formatFileSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(2)} MB`
  }

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Unknown'
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="card">
            <div className="aspect-video bg-gray-200 animate-pulse rounded-t-lg" />
            <div className="card-body">
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 rounded animate-pulse" />
                <div className="h-3 bg-gray-200 rounded animate-pulse w-2/3" />
                <div className="h-3 bg-gray-200 rounded animate-pulse w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (images.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="mx-auto h-24 w-24 text-gray-400">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="mt-4 text-sm font-medium text-gray-900">No flyer images</h3>
        <p className="mt-2 text-sm text-gray-500">
          Upload some flyer images to get started with AI parsing.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {images.map((image) => (
        <div key={image.id} className="card overflow-hidden group">
          {/* Image Preview */}
          <div className="aspect-video bg-gray-100 relative overflow-hidden">
            <img
              src={image.storageUrl}
              alt={image.filename}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            />
            
            {/* Status Overlay */}
            <div className="absolute top-2 right-2">
              <div className={`${getStatusBadgeClass(image.processingStatus)} flex items-center space-x-1`}>
                {getStatusIcon(image.processingStatus)}
                <span className="capitalize text-xs">{image.processingStatus}</span>
              </div>
            </div>

            {/* Action Overlay */}
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-opacity flex items-center justify-center">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex space-x-2">
                <button
                  type="button"
                  onClick={() => window.open(image.storageUrl, '_blank')}
                  className="p-2 bg-white text-gray-700 rounded-full hover:bg-gray-100 transition-colors"
                  title="View full image"
                >
                  <EyeIcon className="h-5 w-5" />
                </button>
                
                {(image.processingStatus === 'failed' || image.processingStatus === 'completed') && (
                  <button
                    type="button"
                    onClick={() => handleReprocess(image)}
                    disabled={reprocessingIds.has(image.id)}
                    className="p-2 bg-white text-gray-700 rounded-full hover:bg-gray-100 transition-colors disabled:opacity-50"
                    title="Reprocess image"
                  >
                    {reprocessingIds.has(image.id) ? (
                      <LoadingSpinner size="small" />
                    ) : (
                      <ArrowPathIcon className="h-5 w-5" />
                    )}
                  </button>
                )}
                
                <button
                  type="button"
                  onClick={() => handleDelete(image)}
                  disabled={deletingIds.has(image.id)}
                  className="p-2 bg-white text-red-600 rounded-full hover:bg-red-50 transition-colors disabled:opacity-50"
                  title="Delete image"
                >
                  {deletingIds.has(image.id) ? (
                    <LoadingSpinner size="small" />
                  ) : (
                    <TrashIcon className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Image Details */}
          <div className="card-body">
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-900 truncate" title={image.filename}>
                {image.filename}
              </h3>
              
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{formatFileSize(image.fileSize)}</span>
                <span>{image.fileType}</span>
              </div>
              
              <div className="text-xs text-gray-400">
                Uploaded: {formatDate(image.uploadedAt)}
              </div>
              
              <div className="text-xs text-gray-400">
                By: {image.uploadedBy}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
